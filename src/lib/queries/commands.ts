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

/** Start, stop and restart (`managed.lifecycle`). */
const LIFECYCLE_WAIT_MS = 120_000
/** `managed.apply`, `managed.destroy`, `managed.promote` and failover. */
const APPLY_WAIT_MS = 600_000
/** `managed.backup` and `managed.restore`, a stored backup's removal included. */
const BACKUP_WAIT_MS = 1_800_000
/** `managed.ha.reconcile` (read eligibility). */
const RECONCILE_WAIT_MS = 300_000

/**
 * Every command the database screens track, by what the person did, with the
 * expiry the server gives that command. `registerCommand` takes only these
 * labels, so a new or renamed label fails the type check until it has a wait.
 */
export const TRACKED_COMMAND_WAIT_MS = {
  Apply: APPLY_WAIT_MS,
  'Apply settings': APPLY_WAIT_MS,
  start: LIFECYCLE_WAIT_MS,
  stop: LIFECYCLE_WAIT_MS,
  restart: LIFECYCLE_WAIT_MS,
  Delete: APPLY_WAIT_MS,
  'Back up now': BACKUP_WAIT_MS,
  'Delete backup': BACKUP_WAIT_MS,
  'Restore backup': BACKUP_WAIT_MS,
  'Rotate root password': APPLY_WAIT_MS,
  'Redeploy service': APPLY_WAIT_MS,
  'Create database': APPLY_WAIT_MS,
  'Delete database': APPLY_WAIT_MS,
  'Create user': APPLY_WAIT_MS,
  'Delete user': APPLY_WAIT_MS,
  'Change user permissions': APPLY_WAIT_MS,
  'Rotate user password': APPLY_WAIT_MS,
  'Add app logins': APPLY_WAIT_MS,
  'Add replica': APPLY_WAIT_MS,
  'Update read eligibility': RECONCILE_WAIT_MS,
  'Convert to failover': APPLY_WAIT_MS,
  'Remove replica': APPLY_WAIT_MS,
  'Resync replica': APPLY_WAIT_MS,
  Promote: APPLY_WAIT_MS,
  'Promote (forced)': APPLY_WAIT_MS,
  'Disaster recovery': APPLY_WAIT_MS,
} as const satisfies Readonly<Record<string, number>>

export type TrackedCommandLabel = keyof typeof TRACKED_COMMAND_WAIT_MS

/**
 * How long a tracked command can go without a status answer before the screen
 * stops waiting for it: the expiry the server gives that kind of command.
 */
export function trackedCommandWaitMs(label: TrackedCommandLabel): number {
  return TRACKED_COMMAND_WAIT_MS[label]
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
const UNANSWERED_POLL_ROUNDS = APPLY_WAIT_MS / COMMAND_POLL_MS

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
