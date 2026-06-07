import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import {
  fetchCommandResults,
  fetchDaemonConnections,
  fetchDaemonEvents,
  fetchHealth,
  daemonLabel,
  uniqueFleetConnections,
  type CommandResult,
  type DaemonConnection,
  type DaemonEvent,
} from '@/lib/instance-api'
import { ALL_TARGET } from '@/lib/developer-navigation'

const POLL_MS = 2_000

type DeveloperContextValue = {
  healthOk: boolean | null
  connections: DaemonConnection[]
  events: DaemonEvent[]
  commands: CommandResult[]
  error: string | null
  setError: (error: string | null) => void
  target: string
  setTarget: (target: string) => void
  fleet: DaemonConnection[]
  targetLabel: string
  staleCount: number
  refresh: () => Promise<void>
}

const DeveloperContext = createContext<DeveloperContextValue | null>(null)

export function DeveloperProvider({ children }: { children: ReactNode }) {
  const [healthOk, setHealthOk] = useState<boolean | null>(null)
  const [connections, setConnections] = useState<DaemonConnection[]>([])
  const [events, setEvents] = useState<DaemonEvent[]>([])
  const [commands, setCommands] = useState<CommandResult[]>([])
  const [target, setTarget] = useState<string>(ALL_TARGET)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      const [health, conn, ev, cmd] = await Promise.all([
        fetchHealth(),
        fetchDaemonConnections(),
        fetchDaemonEvents(),
        fetchCommandResults(),
      ])
      setHealthOk(health.ok)
      setConnections(conn.connections)
      setEvents(ev.events)
      setCommands(cmd.commands)
      setError(null)
    } catch (err) {
      setHealthOk(false)
      setError(err instanceof Error ? err.message : 'Failed to reach instance')
    }
  }, [])

  useEffect(() => {
    void refresh()
    const timer = setInterval(() => {
      void refresh()
    }, POLL_MS)
    return () => clearInterval(timer)
  }, [refresh])

  const fleet = useMemo(() => uniqueFleetConnections(connections), [connections])

  const targetExists = useMemo(
    () => target === ALL_TARGET || fleet.some((c) => c.id === target),
    [target, fleet],
  )

  useEffect(() => {
    if (!targetExists) setTarget(ALL_TARGET)
  }, [targetExists])

  const targetLabel = target === ALL_TARGET
    ? 'all servers'
    : daemonLabel(target, connections)

  const staleCount = connections.length - fleet.length

  const value = useMemo<DeveloperContextValue>(
    () => ({
      healthOk,
      connections,
      events,
      commands,
      error,
      setError,
      target,
      setTarget,
      fleet,
      targetLabel,
      staleCount,
      refresh,
    }),
    [
      healthOk,
      connections,
      events,
      commands,
      error,
      target,
      fleet,
      targetLabel,
      staleCount,
      refresh,
    ],
  )

  return <DeveloperContext.Provider value={value}>{children}</DeveloperContext.Provider>
}

export function useDeveloper() {
  const context = useContext(DeveloperContext)
  if (!context) {
    throw new Error('useDeveloper must be used within DeveloperProvider')
  }
  return context
}
