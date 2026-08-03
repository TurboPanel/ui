import { useQuery } from '@tanstack/react-query'
import {
  fetchCommand,
  type CommandRecord,
  type CommandStatus,
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

export function hasInFlightCommands(
  commands: readonly CommandRecord[] | undefined,
): boolean {
  if (!commands || commands.length === 0) return false
  return commands.some((command) => !isTerminalCommandStatus(command.status))
}

export function anyCommandInFlight(
  commands: readonly CommandRecord[] | undefined,
): boolean {
  return hasInFlightCommands(commands)
}

export function useCommandsBatch(
  orgId: string,
  entries: readonly TrackedCommandEntry[],
  options?: Readonly<{ enabled?: boolean }>,
) {
  const enabled =
    (options?.enabled ?? true) &&
    orgId.length > 0 &&
    entries.length > 0

  return useQuery({
    queryKey: queryKeys.org(orgId).commands.batch(entries),
    queryFn: () =>
      Promise.all(
        entries.map((entry) =>
          fetchCommand(entry.serverId, entry.commandId),
        ),
      ),
    enabled,
    refetchInterval: (query) => {
      const data = query.state.data
      if (!hasInFlightCommands(data)) return false
      return COMMAND_POLL_MS
    },
  })
}
