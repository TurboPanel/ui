import { useCallback, useEffect, useRef, useState } from 'react'
import { lookupPwnedPassword, type PwnedLookup, validatePassword } from '@/lib/password-policy'
import {
  finishPwnedCheck,
  INITIAL_PWNED_STATE,
  needsPwnedLookup,
  type PwnedState,
  pwnedStatusFor,
  type PwnedStatus,
  startPwnedCheck,
} from '@/lib/pwned-check'

const DEBOUNCE_MS = 400

/**
 * Browser breach check for a new password: runs shortly after typing stops and
 * on blur, keeps the answer for that exact value, and lets a submit await the
 * lookup that is already running instead of starting another one.
 */
export function usePwnedCheck(password: string): {
  status: PwnedStatus
  /** Resolves with the lookup for `value` (cached or in flight, else new). */
  settle: (value: string) => Promise<PwnedLookup>
  /** Start the lookup now (on blur); no-op when already known or running. */
  checkNow: () => void
} {
  const [state, setState] = useState<PwnedState>(INITIAL_PWNED_STATE)
  const stateRef = useRef(state)
  const inflight = useRef(new Map<string, Promise<PwnedLookup>>())

  const settle = useCallback((value: string): Promise<PwnedLookup> => {
    const known = stateRef.current.result
    if (known?.password === value) return Promise.resolve(known.lookup)
    const running = inflight.current.get(value)
    if (running) return running
    stateRef.current = startPwnedCheck(stateRef.current, value)
    setState(stateRef.current)
    const promise = lookupPwnedPassword(value).then((lookup) => {
      inflight.current.delete(value)
      stateRef.current = finishPwnedCheck(stateRef.current, value, lookup)
      setState(stateRef.current)
      return lookup
    })
    inflight.current.set(value, promise)
    return promise
  }, [])

  const checkNow = useCallback(() => {
    if (!validatePassword(password).isValid) return
    if (needsPwnedLookup(stateRef.current, password)) void settle(password)
  }, [password, settle])

  useEffect(() => {
    if (!validatePassword(password).isValid) return
    const timer = setTimeout(checkNow, DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [password, checkNow])

  return { status: pwnedStatusFor(state, password), settle, checkNow }
}
