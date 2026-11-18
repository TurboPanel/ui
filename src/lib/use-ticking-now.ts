import { useEffect, useState } from 'react'

/**
 * The current time in milliseconds, refreshed every second while `active`.
 * A fixed `override` (a test clock) is returned as given and never ticks.
 */
export function useTickingNow(active: boolean, override?: number): number {
  const [now, setNow] = useState(() => Date.now())
  const ticking = active && override === undefined
  useEffect(() => {
    if (!ticking) return
    setNow(Date.now())
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [ticking])
  return override ?? now
}
