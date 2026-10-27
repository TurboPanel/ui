import { useCallback, useEffect, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
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
import { isNewestDeploymentInFlight, newestDeploymentFinished } from '@/lib/deployment-history'

/** Transcript poll cadence while a command is live. Sealed transcripts stop. */
export const COMMAND_LOG_POLL_MS = 1000

/**
 * Most pages one read takes back to back. The log endpoint returns a bounded
 * slice per call (512 KiB), so a long log needs several calls; the cap keeps
 * one read from running on, and the next poll carries on from the cursor.
 */
export const COMMAND_LOG_MAX_PAGES_PER_READ = 32

/** Render state of a transcript — see `pages/deploy-logs.md` (state matrix). */
export type CommandLogState =
  'idle' | 'waiting' | 'streaming' | 'sealed' | 'truncated' | 'unavailable' | 'forbidden'

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
  /**
   * The last read stopped while the cursor was still moving (page cap or a
   * failed later page): there may be more to read even though the log is
   * sealed, so polling goes on until it is caught up.
   */
  moreToRead: boolean
}>

export const EMPTY_COMMAND_LOG_SNAPSHOT: CommandLogSnapshot = {
  lines: [],
  nextSeq: 0,
  sealed: false,
  truncated: false,
  exists: false,
  access: 'ok',
  moreToRead: false,
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
  response: CommandLogResponse
): CommandLogSnapshot {
  const lastSeq = current.lines.at(-1)?.seq ?? 0
  const incoming = parseCommandLogChunk(response.text, lastSeq)
  const lines = incoming.length > 0 ? mergeTranscriptLines(current.lines, incoming) : current.lines
  return {
    lines,
    nextSeq: Math.max(current.nextSeq, response.nextSeq),
    sealed: response.sealed,
    truncated: current.truncated || response.truncated,
    exists: current.exists || response.exists,
    // A successful read clears any earlier forbidden/unavailable verdict.
    access: 'ok',
    moreToRead: current.moreToRead,
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
export function classifyCommandLogFailure(error: unknown): Exclude<CommandLogAccess, 'ok'> | null {
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
  }>
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

/**
 * Whether to read the next page straight away. The endpoint reports `sealed`
 * for the whole log, not for the slice it returned, so a sealed read whose
 * cursor moved may still have more behind it. A live log that is not sealed
 * yet carries on at the next poll instead (unless polling is off).
 */
export function shouldReadNextPage(
  from: number,
  response: Readonly<Pick<CommandLogResponse, 'nextSeq' | 'sealed'>>,
  poll: boolean
): boolean {
  if (response.nextSeq <= from) return false
  return response.sealed || !poll
}

/**
 * Next read for a transcript, or false to stop. A forbidden or durably
 * unavailable transcript stops; one with more left to read carries on even
 * when sealed or when polling is off; otherwise a live transcript polls until
 * it is sealed.
 */
export function commandLogRefetchInterval(
  data: CommandLogSnapshot | undefined,
  poll: boolean
): number | false {
  if (data && data.access !== 'ok') return false
  if (data?.moreToRead) return COMMAND_LOG_POLL_MS
  if (!poll || data?.sealed) return false
  return COMMAND_LOG_POLL_MS
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
  options?: Readonly<{ enabled?: boolean; poll?: boolean }>
): UseCommandLogResult {
  const enabled =
    (options?.enabled ?? true) && orgId.length > 0 && Boolean(serverId) && Boolean(commandId)
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
    const keep = (snapshot: CommandLogSnapshot): CommandLogSnapshot => {
      accumulatorRef.current = { identity, snapshot }
      return snapshot
    }
    const accumulator = accumulatorRef.current
    // A different command reuses this hook instance: start from scratch rather
    // than resuming another transcript's cursor.
    const current =
      accumulator.identity === identity ? accumulator.snapshot : EMPTY_COMMAND_LOG_SNAPSHOT
    let next = current
    for (let page = 0; page < COMMAND_LOG_MAX_PAGES_PER_READ; page++) {
      const from = next.nextSeq
      let response: CommandLogResponse
      try {
        response = await fetchCommandLog(serverId, commandId, { from })
      } catch (err) {
        // A later page failed: keep what was read, carry on at the next poll.
        if (page > 0) return keep({ ...next, moreToRead: true })
        const access = classifyCommandLogFailure(err)
        // Rethrow only what the query should genuinely retry/surface as an error;
        // a command-level 403 never reaches the global forbidden handler.
        if (!access) throw err
        return keep({ ...next, access })
      }
      next = accumulateCommandLog(next, response)
      if (!shouldReadNextPage(from, response, poll)) {
        return keep({ ...next, moreToRead: false })
      }
    }
    // Page cap reached while the cursor was still moving.
    return keep({ ...next, moreToRead: true })
  }, [serverId, commandId, identity, poll])

  const query = useQuery({
    queryKey: queryKeys.org(orgId).commands.log(serverId ?? '', commandId ?? ''),
    queryFn,
    enabled,
    // The accumulator lives in the ref; a cached snapshot is only ever a
    // starting point, so keep reads cheap but always resume from the cursor.
    staleTime: 0,
    gcTime: 0,
    refetchInterval: (query) => commandLogRefetchInterval(query.state.data, poll),
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
 * History poll cadence while the newest deploy is still going. The deploy
 * mutation invalidates the history, which starts the poll.
 */
export const DEPLOYMENT_POLL_MS = 5000

/**
 * What a finished deploy can have changed, fetched again: the hostings (and
 * their certificates), the services with their run state, and the containers.
 * The Overview reads its status from these, so it shows the new state as soon
 * as the deploy ends instead of when another tab is opened.
 */
function refetchAfterDeploy(
  queryClient: ReturnType<typeof useQueryClient>,
  orgId: string,
  environmentId: string
): void {
  const keys = queryKeys.org(orgId)
  void queryClient.invalidateQueries({ queryKey: keys.hostings.all })
  void queryClient.invalidateQueries({ queryKey: keys.services.list(environmentId) })
  void queryClient.invalidateQueries({ queryKey: keys.containers.all })
}

/**
 * The environment's deploy history. Polls only while the newest deploy is
 * still going, so the status and the pages under it follow the deploy without
 * a reload; when it finishes, what the deploy can have changed is fetched
 * again (see `refetchAfterDeploy`).
 */
export function useEnvironmentDeployments(
  orgId: string,
  environmentId: string,
  options?: Readonly<{ enabled?: boolean; limit?: number }>
) {
  const queryClient = useQueryClient()
  const queryKey = queryKeys.org(orgId).environments.deployments(environmentId)
  return useQuery({
    queryKey,
    queryFn: async () => {
      const before = queryClient.getQueryData<{ deployments: DeploymentHistoryRecord[] }>(queryKey)
      const page = await fetchEnvironmentDeployments(environmentId, {
        ...(options?.limit ? { limit: options.limit } : {}),
      })
      if (newestDeploymentFinished(before?.deployments, page.deployments)) {
        refetchAfterDeploy(queryClient, orgId, environmentId)
      }
      return page
    },
    enabled: (options?.enabled ?? true) && orgId.length > 0 && environmentId.length > 0,
    refetchInterval: (query) =>
      isNewestDeploymentInFlight(query.state.data?.deployments) ? DEPLOYMENT_POLL_MS : false,
  })
}

/** Newest-first rows for the history table (the API already sorts; be explicit). */
export function orderDeploymentsNewestFirst(
  rows: readonly DeploymentHistoryRecord[] | undefined
): DeploymentHistoryRecord[] {
  return [...(rows ?? [])].sort((a, b) => b.id.localeCompare(a.id))
}
