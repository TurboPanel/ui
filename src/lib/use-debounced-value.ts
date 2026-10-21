import { useCallback, useEffect, useState } from 'react'

/**
 * `value`, once it has stopped changing for `delayMs` — plus `flush` to take
 * it right away (on blur, say). Starts equal to `value`, so the first read
 * after a pick is not held back; only later edits wait.
 *
 * Same shape as the breach check's debounce (`use-pwned-check.ts`): a timer per
 * change, cleared by the next one.
 */
export function useDebouncedValue<T>(value: T, delayMs: number): [T, () => void] {
  const [settled, setSettled] = useState(value)

  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delayMs)
    return () => clearTimeout(timer)
  }, [value, delayMs])

  const flush = useCallback(() => setSettled(value), [value])
  return [settled, flush]
}
