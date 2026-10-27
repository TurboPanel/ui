import { useQueryClient, type QueryClient } from '@tanstack/react-query'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { ManagedDetailResponse } from '@/lib/managed-services'
import {
  commandStatusById,
  isTerminalCommandStatus,
  trackedCommandsInFlight,
  useCommandsBatch,
  type TrackedCommandEntry,
} from '@/lib/queries/commands'
import { useEnvironment } from '@/lib/queries/environments'
import { useEnvironmentManaged } from '@/lib/queries/managed'
import { queryKeys } from '@/lib/query-keys'

/** Refetch everything a managed environment shows after a command finished. */
export function invalidateEnvironmentManagedQueries(
  queryClient: QueryClient,
  orgId: string,
  environmentId: string
): void {
  const managed = queryKeys.org(orgId).managed
  Promise.all(
    [
      managed.environment(environmentId),
      managed.status(environmentId),
      managed.users(environmentId),
      managed.databases(environmentId),
      managed.backups(environmentId),
    ].map((queryKey) => queryClient.invalidateQueries({ queryKey }))
  ).catch(() => {
    // Best-effort; the queries surface their own errors.
  })
}

export type ManagedEnvironmentValue = Readonly<{
  orgId: string
  environmentId: string
  /** The managed detail once the environment has a server; null before. */
  detail: ManagedDetailResponse | null
  /** True once the database exists (it has a server and a managed record). */
  provisioned: boolean
  /** Track a queued command; its result refreshes the managed queries. */
  registerCommand: (commandId: string, label: string, commandServerId?: string) => void
  /** The newest Apply queued here, kept after it finishes so its log stays readable. */
  applyCommand: TrackedCommandEntry | null
  /** A command queued here is still running. */
  inFlight: boolean
}>

const ManagedEnvironmentContext = createContext<ManagedEnvironmentValue | null>(null)

/** The managed environment around this screen, or null outside the shared shell. */
export function useOptionalManagedEnvironment(): ManagedEnvironmentValue | null {
  return useContext(ManagedEnvironmentContext)
}

/** The managed environment around this screen; only inside a {@link ManagedCommandsProvider}. */
export function useManagedEnvironment(): ManagedEnvironmentValue {
  const value = useContext(ManagedEnvironmentContext)
  if (!value) throw new Error('useManagedEnvironment needs a ManagedCommandsProvider')
  return value
}

/**
 * Holds what the header and the tab body share for one managed environment:
 * the managed detail and the commands queued from either. Apply changes in
 * the header and the Apply log on the Deployments tab read the same command.
 */
export function ManagedCommandsProvider({
  orgId,
  environmentId,
  children,
}: Readonly<{ orgId: string; environmentId: string; children: ReactNode }>) {
  const queryClient = useQueryClient()
  const environmentQuery = useEnvironment(orgId, environmentId)
  const hasServerPin = Boolean(environmentQuery.data?.environment.serverId)
  const managedQuery = useEnvironmentManaged(orgId, environmentId, { enabled: hasServerPin })
  const detail = hasServerPin ? (managedQuery.data ?? null) : null
  const [trackedEntries, setTrackedEntries] = useState<readonly TrackedCommandEntry[]>([])
  const [applyCommand, setApplyCommand] = useState<TrackedCommandEntry | null>(null)
  const commandsQuery = useCommandsBatch(orgId, trackedEntries)
  const serverId = detail?.managed?.serverId ?? detail?.server?.id ?? null

  const registerCommand = useCallback(
    (commandId: string, label: string, commandServerId?: string) => {
      const resolvedServerId = commandServerId ?? serverId
      if (!resolvedServerId) return
      setTrackedEntries((current) => [...current, { serverId: resolvedServerId, commandId }])
      if (label === 'Apply' || label === 'Apply settings') {
        setApplyCommand({ serverId: resolvedServerId, commandId })
      }
    },
    [serverId]
  )

  useEffect(() => {
    if (!commandsQuery.data) return
    // Join on command id: unreadable ids are dropped from the batched response.
    const recordsById = commandStatusById(commandsQuery.data)
    for (const entry of trackedEntries) {
      const record = recordsById.get(entry.commandId)
      if (!record || !isTerminalCommandStatus(record.status)) continue
      // A failed or cancelled command can still have moved the database (a
      // stop that half ran), so every end refreshes what the screen shows.
      invalidateEnvironmentManagedQueries(queryClient, orgId, environmentId)
      setTrackedEntries((current) => current.filter((row) => row.commandId !== entry.commandId))
    }
  }, [commandsQuery.data, trackedEntries, queryClient, orgId, environmentId])

  const inFlight = trackedCommandsInFlight(trackedEntries, commandsQuery)

  const value = useMemo<ManagedEnvironmentValue>(
    () => ({
      orgId,
      environmentId,
      detail,
      provisioned: Boolean(detail?.managed),
      registerCommand,
      applyCommand,
      inFlight,
    }),
    [orgId, environmentId, detail, registerCommand, applyCommand, inFlight]
  )
  return (
    <ManagedEnvironmentContext.Provider value={value}>
      {children}
    </ManagedEnvironmentContext.Provider>
  )
}
