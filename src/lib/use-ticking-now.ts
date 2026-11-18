import { useEffect, useState } from 'react'

/**
 * The current time in milliseconds, refreshed every second while `active`.
 * A fixed `override` (a test clock) is returned as given and never ticks.
 * With `stopAt` (a time in milliseconds, NaN for none that can be read) it
 * stops ticking once the clock reaches it: nothing is left to wait for.
 */
export function useTickingNow(active: boolean, override?: number, stopAt?: number): number {
  const [now, setNow] = useState(() => Date.now())
  const reached = stopAt !== undefined && now >= stopAt
  const ticking = active && override === undefined && !reached
  useEffect(() => {
    if (!ticking) return
    setNow(Date.now())
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [ticking])
  return override ?? now
}
