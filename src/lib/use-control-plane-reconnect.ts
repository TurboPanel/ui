import { useCallback, useEffect, useRef, useState } from 'react'
import {
  reconnectRetryDelayMs,
  reconnectView,
  type ReconnectView,
} from '@/lib/control-plane-reconnect'

/**
 * While `unreachable` is true: count the time since it began, retry `retry`
 * with a 2 to 10 s backoff, and report the view (calm, then "taking longer").
 * `retryNow` is the manual "Try again now" button. `retry` may change identity
 * on every render (a callback closing over a query result): it is read through
 * a ref so a new identity never restarts the backoff timer.
 */
export function useControlPlaneReconnect(
  unreachable: boolean,
  retry: () => void
): Readonly<{ view: ReconnectView | null; keepWaiting: () => void; retryNow: () => void }> {
  const retryRef = useRef(retry)
  useEffect(() => {
    retryRef.current = retry
  })
  const [since, setSince] = useState<number | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const [extendedMs, setExtendedMs] = useState(0)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!unreachable) {
      setSince(null)
      setExtendedMs(0)
      setAttempt(0)
      return
    }
    setSince((current) => current ?? Date.now())
  }, [unreachable])

  useEffect(() => {
    if (!unreachable) return
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [unreachable])

  useEffect(() => {
    if (!unreachable) return
    const timer = setTimeout(() => {
      retryRef.current()
      setAttempt((n) => n + 1)
    }, reconnectRetryDelayMs(attempt))
    return () => clearTimeout(timer)
  }, [unreachable, attempt])

  const keepWaiting = useCallback(() => {
    setExtendedMs(Math.max(0, Date.now() - (since ?? Date.now())))
  }, [since])

  const retryNow = useCallback(() => retryRef.current(), [])

  if (!unreachable || since === null) return { view: null, keepWaiting, retryNow }
  const elapsed = Math.max(0, now - since)
  return { view: reconnectView(elapsed, extendedMs), keepWaiting, retryNow }
}
