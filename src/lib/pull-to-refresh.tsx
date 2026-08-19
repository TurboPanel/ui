import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'

export type PullToRefreshHandler = () => void | Promise<void>

type PullToRefreshContextValue = Readonly<{
  /** True when the active screen registered a refresh handler. */
  enabled: boolean
  refreshing: boolean
  onRefresh: () => Promise<void>
  register: (handler: PullToRefreshHandler | null) => void
}>

const PullToRefreshContext = createContext<PullToRefreshContextValue | null>(
  null,
)

/**
 * Shell-level pull-to-refresh registry.
 *
 * Screens call {@link usePullToRefresh} to attach a handler; the org shell
 * ScrollView reads {@link useOptionalPullToRefresh} and mounts RefreshControl.
 */
export function PullToRefreshProvider({
  children,
}: Readonly<{ children: ReactNode }>) {
  const handlerRef = useRef<PullToRefreshHandler | null>(null)
  const [enabled, setEnabled] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  const register = useCallback((handler: PullToRefreshHandler | null) => {
    handlerRef.current = handler
    setEnabled(handler != null)
  }, [])

  const onRefresh = useCallback(async () => {
    const handler = handlerRef.current
    if (!handler || refreshing) return
    setRefreshing(true)
    try {
      await handler()
    } finally {
      setRefreshing(false)
    }
  }, [refreshing])

  const value = useMemo(
    () => ({ enabled, refreshing, onRefresh, register }),
    [enabled, refreshing, onRefresh, register],
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
 * other) screens that should refresh on pull. Unregisters on unmount.
 */
export function usePullToRefresh(handler: PullToRefreshHandler): void {
  const ctx = useContext(PullToRefreshContext)
  const handlerRef = useRef(handler)

  useEffect(() => {
    handlerRef.current = handler
  }, [handler])

  useEffect(() => {
    if (!ctx) return
    const run: PullToRefreshHandler = () => handlerRef.current()
    ctx.register(run)
    return () => {
      ctx.register(null)
    }
  }, [ctx])
}
