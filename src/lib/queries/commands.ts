import { useQuery } from '@tanstack/react-query'
import {
  fetchCommand,
  fetchCommandStatuses,
  type CommandRecord,
  type CommandStatus,
  type CommandStatusRecord,
} from '@/lib/instance-api'
import { queryKeys } from '@/lib/query-keys'

export const COMMAND_POLL_MS = 2000

const TERMINAL_COMMAND_STATUSES = new Set<CommandStatus>([
  'succeeded',
  'failed',
  'timed_out',
  'cancelled',
])

export function isTerminalCommandStatus(status: CommandStatus): boolean {
  return TERMINAL_COMMAND_STATUSES.has(status)
}

export type TrackedCommandEntry = Readonly<{
  serverId: string
  commandId: string
}>

/** Structural minimum shared by {@link CommandRecord} and {@link CommandStatusRecord}. */
type CommandStatusLike = Readonly<{ status: CommandStatus }>

export function hasInFlightCommands(commands: readonly CommandStatusLike[] | undefined): boolean {
  if (!commands || commands.length === 0) return false
  return commands.some((command) => !isTerminalCommandStatus(command.status))
}

export function anyCommandInFlight(commands: readonly CommandStatusLike[] | undefined): boolean {
  return hasInFlightCommands(commands)
}

function trackedEntryKey(entry: TrackedCommandEntry): string {
  return `${entry.serverId}:${entry.commandId}`
}

/** True while a tracked Apply/reconcile batch is still loading or non-terminal. */
export function hasPendingTrackedCommands(
  entries: readonly TrackedCommandEntry[],
  commands: readonly CommandStatusLike[] | undefined
): boolean {
  if (entries.length === 0) return false
  if (!commands || commands.length === 0) return true
  return hasInFlightCommands(commands)
}

/**
 * True while a tracked batch still has a command running. Status rows are
 * trusted while they say a command runs, even when the latest read failed. A
 * batch with no rows yet (loading, or every read so far failed) counts as
 * running too: the caller stops tracking it once the commands' own expiry has
 * passed ({@link trackedCommandWaitMs}), so a flaky read never unlocks the
 * controls mid-command and a lost one never locks them for good.
 */
export function trackedCommandsInFlight(
  entries: readonly TrackedCommandEntry[],
  query: Readonly<{ data: readonly CommandStatusLike[] | undefined }>
): boolean {
  if (entries.length === 0) return false
  return query.data === undefined || hasInFlightCommands(query.data)
}

/** Start, stop and restart: the server gives them two minutes. */
const LIFECYCLE_WAIT_MS = 120_000
/** The longest expiry the server gives a command tracked by label (backups and restores). */
const LONG_WAIT_MS = 1_800_000
/** Apply and the other database changes. */
const DEFAULT_WAIT_MS = 600_000

const WAIT_MS_BY_LABEL: Readonly<Record<string, number>> = {
  start: LIFECYCLE_WAIT_MS,
  stop: LIFECYCLE_WAIT_MS,
  restart: LIFECYCLE_WAIT_MS,
  Delete: 300_000,
  'Back up now': LONG_WAIT_MS,
  'Restore backup': LONG_WAIT_MS,
}

/**
 * How long a tracked command can go without a status answer before the screen
 * stops waiting for it: the expiry the server gives that kind of command.
 */
export function trackedCommandWaitMs(label: string): number {
  return WAIT_MS_BY_LABEL[label] ?? DEFAULT_WAIT_MS
}

/** Keep earlier command ids when a later Apply returns more queued rows. */
export function mergeTrackedCommandEntries(
  current: readonly TrackedCommandEntry[],
  next: readonly TrackedCommandEntry[]
): TrackedCommandEntry[] {
  const seen = new Set(current.map((entry) => trackedEntryKey(entry)))
  const merged = [...current]
  for (const entry of next) {
    const key = trackedEntryKey(entry)
    if (seen.has(key)) continue
    seen.add(key)
    merged.push(entry)
  }
  return merged
}

/**
 * Index the batched status rows by command id.
 *
 * `POST /commands/status` may omit ids the session cannot read, so the returned
 * array is shorter than the tracked-entry list whenever that happens. Consumers
 * must join on `commandId` through this map instead of pairing by position.
 */
export function commandStatusById(
  records: readonly CommandStatusRecord[] | undefined
): Map<string, CommandStatusRecord> {
  const byId = new Map<string, CommandStatusRecord>()
  for (const record of records ?? []) {
    byId.set(record.id, record)
  }
  return byId
}

/**
 * Poll many tracked commands with a single batched request. Rows keep `entries`
 * order, but ids the session cannot read are omitted entirely, so positions do
 * NOT line up with `entries` — resolve records by `commandId` (see
 * {@link commandStatusById}) rather than by index.
 */
export function useCommandsBatch(
  orgId: string,
  entries: readonly TrackedCommandEntry[],
  options?: Readonly<{ enabled?: boolean }>
) {
  const enabled = (options?.enabled ?? true) && orgId.length > 0 && entries.length > 0

  return useQuery({
    queryKey: queryKeys.org(orgId).commands.batch(entries),
    queryFn: async (): Promise<CommandStatusRecord[]> => {
      const records = await fetchCommandStatuses(entries.map((entry) => entry.commandId))
      const byId = new Map(records.map((record) => [record.id, record]))
      return entries
        .map((entry) => byId.get(entry.commandId))
        .filter((record): record is CommandStatusRecord => record !== undefined)
    },
    enabled,
    refetchInterval: (query) => batchPollInterval(query.state),
  })
}

/**
 * Failed rounds with no answer at all after which the batch stops asking: ten
 * minutes of polling, as long as a tracked command can wait for an answer.
 */
const UNANSWERED_POLL_ROUNDS = DEFAULT_WAIT_MS / COMMAND_POLL_MS

/**
 * Poll while a command runs, and while the batch has no answer yet: when the
 * first reads fail, stopping would leave the screen waiting on nothing.
 */
export function batchPollInterval(
  state: Readonly<{ data: readonly CommandStatusLike[] | undefined; errorUpdateCount: number }>
): number | false {
  if (state.data === undefined) {
    return state.errorUpdateCount < UNANSWERED_POLL_ROUNDS ? COMMAND_POLL_MS : false
  }
  return hasInFlightCommands(state.data) ? COMMAND_POLL_MS : false
}

/**
 * Per-id variant kept for the server-detail view, which renders the full
 * record (ping latency breakdown, result summary) that the batched status
 * endpoint deliberately omits.
 */
export function useCommandRecordsBatch(
  orgId: string,
  entries: readonly TrackedCommandEntry[],
  options?: Readonly<{ enabled?: boolean }>
) {
  const enabled = (options?.enabled ?? true) && orgId.length > 0 && entries.length > 0

  return useQuery({
    // Distinct from the batched-status key: same entries, different shape.
    queryKey: [...queryKeys.org(orgId).commands.batch(entries), 'records'],
    queryFn: (): Promise<CommandRecord[]> =>
      Promise.all(entries.map((entry) => fetchCommand(entry.serverId, entry.commandId))),
    enabled,
    refetchInterval: (query) => {
      const data = query.state.data
      if (!hasInFlightCommands(data)) return false
      return COMMAND_POLL_MS
    },
  })
}
