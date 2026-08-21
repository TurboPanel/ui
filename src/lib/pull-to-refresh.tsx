import { useIsFocused } from 'expo-router'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'

export type PullToRefreshHandler = () => void | Promise<void>

type Registration = Readonly<{
  id: string
  handler: PullToRefreshHandler
}>

type PullToRefreshContextValue = Readonly<{
  /** True while a focused screen has a refresh handler registered. */
  enabled: boolean
  refreshing: boolean
  onRefresh: () => Promise<void>
  register: (id: string, handler: PullToRefreshHandler) => void
  unregister: (id: string) => void
}>

const PullToRefreshContext = createContext<PullToRefreshContextValue | null>(
  null,
)

/**
 * Shell-level pull-to-refresh registry.
 *
 * Screens call {@link usePullToRefresh} to attach a handler; the org shell
 * ScrollView reads {@link useOptionalPullToRefresh} and mounts RefreshControl.
 *
 * Registrations are **keyed by screen** rather than held in a single slot. A
 * native stack keeps the screen underneath mounted when you push a new one, so
 * a single slot let a background screen (e.g. the projects list) keep the
 * gesture alive on a pushed screen that has nothing to refresh. Keying also
 * makes teardown order irrelevant: a screen can only ever clear its own entry,
 * so a blur/focus pair that fires in either order still lands correctly.
 */
export function PullToRefreshProvider({
  children,
}: Readonly<{ children: ReactNode }>) {
  const registrationsRef = useRef<readonly Registration[]>([])
  const [enabled, setEnabled] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  const commit = useCallback((next: readonly Registration[]) => {
    registrationsRef.current = next
    setEnabled(next.length > 0)
  }, [])

  const register = useCallback(
    (id: string, handler: PullToRefreshHandler) => {
      commit([
        ...registrationsRef.current.filter((entry) => entry.id !== id),
        { id, handler },
      ])
    },
    [commit],
  )

  const unregister = useCallback(
    (id: string) => {
      commit(registrationsRef.current.filter((entry) => entry.id !== id))
    },
    [commit],
  )

  const onRefresh = useCallback(async () => {
    // Most recent registration wins if focus transitions ever overlap.
    const active = registrationsRef.current.at(-1)
    if (!active || refreshing) return
    setRefreshing(true)
    try {
      await active.handler()
    } finally {
      setRefreshing(false)
    }
  }, [refreshing])

  const value = useMemo(
    () => ({ enabled, refreshing, onRefresh, register, unregister }),
    [enabled, refreshing, onRefresh, register, unregister],
  )

  return (
    <PullToRefreshContext.Provider value={value}>
      {children}
    </PullToRefreshContext.Provider>
  )
}

export function useOptionalPullToRefresh(): PullToRefreshContextValue | null {
  return useContext(PullToRefreshContext)
}

/**
 * Register a pull-to-refresh handler for the current screen.
 *
 * The org shell ScrollView owns the gesture; call this from overview (and
 * other) screens that should refresh on pull. The handler is registered only
 * while the screen is focused, and unregisters on blur or unmount — screens
 * that never call this (the create wizard, forms) get no RefreshControl.
 */
export function usePullToRefresh(handler: PullToRefreshHandler): void {
  const ctx = useContext(PullToRefreshContext)
  const isFocused = useIsFocused()
  const id = useId()
  const handlerRef = useRef(handler)

  useEffect(() => {
    handlerRef.current = handler
  }, [handler])

  useEffect(() => {
    if (!ctx || !isFocused) return
    ctx.register(id, () => handlerRef.current())
    return () => {
      ctx.unregister(id)
    }
  }, [ctx, id, isFocused])
}
