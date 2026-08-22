import { useCallback, useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  fetchCommandLog,
  fetchEnvironmentDeployments,
  isForbiddenError,
  type CommandLogResponse,
  type DeploymentHistoryRecord,
} from '@/lib/instance-api'
import {
  mergeTranscriptLines,
  parseCommandLogChunk,
  type LogTranscriptLine,
} from '@/lib/execution-log-lines'
import { queryKeys } from '@/lib/query-keys'

/** Transcript poll cadence while a command is live. Sealed transcripts stop. */
export const COMMAND_LOG_POLL_MS = 1000

/** Render state of a transcript — see `pages/deploy-logs.md` (state matrix). */
export type CommandLogState =
  | 'idle'
  | 'waiting'
  | 'streaming'
  | 'sealed'
  | 'truncated'
  | 'unavailable'
  | 'forbidden'

/**
 * Whether the last read could see the transcript at all.
 *
 * A command-level 403 (or a durable "this transcript will never be readable"
 * response) is *local* viewer state — not a session-level authorization
 * failure. Rethrowing it would hand the error to the app-wide QueryClient,
 * whose `onError` routes every 403 through the global forbidden recovery and
 * can kick the session out of the console over one unreadable transcript.
 */
export type CommandLogAccess = 'ok' | 'forbidden' | 'unavailable'

/** Accumulated transcript across every poll for one command. */
export type CommandLogSnapshot = Readonly<{
  lines: readonly LogTranscriptLine[]
  /** Cursor for the next read (`from`). */
  nextSeq: number
  sealed: boolean
  truncated: boolean
  /** Whether the control plane has ever reported a transcript for this command. */
  exists: boolean
  /** Result of the latest read — see {@link CommandLogAccess}. */
  access: CommandLogAccess
}>

export const EMPTY_COMMAND_LOG_SNAPSHOT: CommandLogSnapshot = {
  lines: [],
  nextSeq: 0,
  sealed: false,
  truncated: false,
  exists: false,
  access: 'ok',
}

/**
 * Fold one transcript read into the accumulated snapshot.
 *
 * The cursor only ever advances: a read whose byte budget split a chunk returns
 * the same `nextSeq` and replays those bytes, and a stale/out-of-order response
 * must not rewind progress. Duplicate rows are collapsed by sequence in
 * {@link mergeTranscriptLines}. `truncated` and `exists` are sticky — once the
 * store reports either, a later empty read does not clear it.
 */
export function accumulateCommandLog(
  current: CommandLogSnapshot,
  response: CommandLogResponse,
): CommandLogSnapshot {
  const lastSeq = current.lines.at(-1)?.seq ?? 0
  const incoming = parseCommandLogChunk(response.text, lastSeq)
  const lines =
    incoming.length > 0
      ? mergeTranscriptLines(current.lines, incoming)
      : current.lines
  return {
    lines,
    nextSeq: Math.max(current.nextSeq, response.nextSeq),
    sealed: response.sealed,
    truncated: current.truncated || response.truncated,
    exists: current.exists || response.exists,
    // A successful read clears any earlier forbidden/unavailable verdict.
    access: 'ok',
  }
}

/**
 * Classify a failed transcript read.
 *
 * `403` is the viewer's own `forbidden` state. Every other non-retryable client
 * error (`404`/`410`/… — the transcript is gone or was never stored) is durable
 * `unavailable`. Transient failures (network, `5xx`, `429`) return `null` so the
 * query keeps its normal retry/error behaviour.
 */
export function classifyCommandLogFailure(
  error: unknown,
): Exclude<CommandLogAccess, 'ok'> | null {
  if (isForbiddenError(error)) return 'forbidden'
  if (!(error instanceof Error)) return null
  const status = /HTTP (\d{3})(?!\d)/.exec(error.message)?.[1]
  if (!status) return null
  const code = Number(status)
  if (code === 408 || code === 425 || code === 429) return null
  return code >= 400 && code < 500 ? 'unavailable' : null
}

/** Resolve the viewer state from the accumulated snapshot plus query status. */
export function resolveCommandLogState(
  input: Readonly<{
    enabled: boolean
    snapshot: CommandLogSnapshot
    error: unknown
    hasFetched: boolean
  }>,
): CommandLogState {
  if (!input.enabled) return 'idle'
  if (input.snapshot.access !== 'ok') return input.snapshot.access
  if (input.error) {
    return isForbiddenError(input.error) ? 'forbidden' : 'unavailable'
  }
  if (!input.hasFetched) return 'waiting'
  if (input.snapshot.truncated) return 'truncated'
  if (input.snapshot.sealed) {
    return input.snapshot.exists ? 'sealed' : 'unavailable'
  }
  if (!input.snapshot.exists || input.snapshot.lines.length === 0) {
    return 'waiting'
  }
  return 'streaming'
}

export type UseCommandLogResult = Readonly<{
  snapshot: CommandLogSnapshot
  state: CommandLogState
  error: Error | null
  isFetching: boolean
}>

/**
 * Cursor-based transcript tail for one command.
 *
 * One React Query per open transcript. `refetchInterval` returns
 * {@link COMMAND_LOG_POLL_MS} only while the latest read says the transcript is
 * not sealed (and readable) and stops afterwards — never a hand-rolled
 * `setInterval`. Chunks
 * accumulate in a ref keyed by `(serverId, commandId)` so a re-render (or a
 * React Query garbage-collect) cannot rewind the tail.
 *
 * Pass `poll: false` for a transcript that is already terminal (history rows):
 * one read, no interval.
 */
export function useCommandLog(
  orgId: string,
  serverId: string | null,
  commandId: string | null,
  options?: Readonly<{ enabled?: boolean; poll?: boolean }>,
): UseCommandLogResult {
  const enabled =
    (options?.enabled ?? true) &&
    orgId.length > 0 &&
    Boolean(serverId) &&
    Boolean(commandId)
  const poll = options?.poll ?? true

  // Accumulator + the command it belongs to. Both are read and written only
  // inside the query function and effects — never during render.
  const accumulatorRef = useRef<{
    identity: string
    snapshot: CommandLogSnapshot
  }>({ identity: '', snapshot: EMPTY_COMMAND_LOG_SNAPSHOT })
  const identity = `${serverId ?? ''}:${commandId ?? ''}`

  const queryFn = useCallback(async (): Promise<CommandLogSnapshot> => {
    if (!serverId || !commandId) return EMPTY_COMMAND_LOG_SNAPSHOT
    const accumulator = accumulatorRef.current
    // A different command reuses this hook instance: start from scratch rather
    // than resuming another transcript's cursor.
    const current =
      accumulator.identity === identity
        ? accumulator.snapshot
        : EMPTY_COMMAND_LOG_SNAPSHOT
    let response: CommandLogResponse
    try {
      response = await fetchCommandLog(serverId, commandId, {
        from: current.nextSeq,
      })
    } catch (err) {
      const access = classifyCommandLogFailure(err)
      // Rethrow only what the query should genuinely retry/surface as an error;
      // a command-level 403 never reaches the global forbidden handler.
      if (!access) throw err
      const next: CommandLogSnapshot = { ...current, access }
      accumulatorRef.current = { identity, snapshot: next }
      return next
    }
    const next = accumulateCommandLog(current, response)
    accumulatorRef.current = { identity, snapshot: next }
    return next
  }, [serverId, commandId, identity])

  const query = useQuery({
    queryKey: queryKeys.org(orgId).commands.log(serverId ?? '', commandId ?? ''),
    queryFn,
    enabled,
    // The accumulator lives in the ref; a cached snapshot is only ever a
    // starting point, so keep reads cheap but always resume from the cursor.
    staleTime: 0,
    gcTime: 0,
    refetchInterval: (query) => {
      if (!poll) return false
      const data = query.state.data
      if (data?.sealed) return false
      // A forbidden/durably-unavailable transcript will not become readable by
      // asking again every second.
      if (data && data.access !== 'ok') return false
      return COMMAND_LOG_POLL_MS
    },
  })

  useEffect(() => {
    if (enabled) return
    accumulatorRef.current = {
      identity: '',
      snapshot: EMPTY_COMMAND_LOG_SNAPSHOT,
    }
  }, [enabled])

  const snapshot = query.data ?? EMPTY_COMMAND_LOG_SNAPSHOT
  return {
    snapshot,
    state: resolveCommandLogState({
      enabled,
      snapshot,
      error: query.error,
      hasFetched: query.isSuccess,
    }),
    error: query.error,
    isFetching: query.isFetching,
  }
}

/**
 * Deploy history for one environment. No `refetchInterval` — the list is
 * invalidated by the deploy mutation and whenever a tracked command reaches a
 * terminal status, mirroring the containers-on-Project-Overview rule.
 */
export function useEnvironmentDeployments(
  orgId: string,
  environmentId: string,
  options?: Readonly<{ enabled?: boolean; limit?: number }>,
) {
  return useQuery({
    queryKey: queryKeys.org(orgId).environments.deployments(environmentId),
    queryFn: () =>
      fetchEnvironmentDeployments(environmentId, {
        ...(options?.limit ? { limit: options.limit } : {}),
      }),
    enabled:
      (options?.enabled ?? true) &&
      orgId.length > 0 &&
      environmentId.length > 0,
    refetchInterval: false,
  })
}

/** Newest-first rows for the history table (the API already sorts; be explicit). */
export function orderDeploymentsNewestFirst(
  rows: readonly DeploymentHistoryRecord[] | undefined,
): DeploymentHistoryRecord[] {
  return [...(rows ?? [])].sort((a, b) => b.id.localeCompare(a.id))
}
