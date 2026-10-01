import type { PwnedLookup } from '@/lib/password-policy'

/**
 * Pure state for the browser breach check on a new password. The result is
 * keyed to the exact value that was checked, so typing in another field never
 * re-triggers it and an edited value is "idle" again.
 */

export type PwnedStatus = 'idle' | 'checking' | PwnedLookup

export type PwnedState = {
  /** The value a lookup is running for, or `null`. */
  checking: string | null
  /** The last finished lookup and the value it belongs to. */
  result: { password: string; lookup: PwnedLookup } | null
}

export const INITIAL_PWNED_STATE: PwnedState = { checking: null, result: null }

export function pwnedStatusFor(state: PwnedState, password: string): PwnedStatus {
  if (state.result?.password === password) return state.result.lookup
  if (state.checking === password) return 'checking'
  return 'idle'
}

export function startPwnedCheck(state: PwnedState, password: string): PwnedState {
  return { ...state, checking: password }
}

export function finishPwnedCheck(
  state: PwnedState,
  password: string,
  lookup: PwnedLookup
): PwnedState {
  const checking = state.checking === password ? null : state.checking
  return { checking, result: { password, lookup } }
}

/** A lookup is only worth starting for a value that is not yet known. */
export function needsPwnedLookup(state: PwnedState, password: string): boolean {
  return password.length > 0 && pwnedStatusFor(state, password) === 'idle'
}

export type PwnedSubmitDecision = 'wait' | 'block' | 'send'

/**
 * What a submit does for the current status: `wait` for the client check to
 * finish (idle or still running), `block` (send nothing) when breached, `send`
 * when clean or when the service could not be reached (the server checks too).
 */
export function pwnedSubmitDecision(status: PwnedStatus): PwnedSubmitDecision {
  if (status === 'breached') return 'block'
  if (status === 'clean' || status === 'unavailable') return 'send'
  return 'wait'
}

export const PWNED_CHECKING_COPY = 'Checking this password against known breaches…'

/** Inline words under the new-password field; nothing when idle, clean or unreachable. */
export function pwnedFieldNotice(
  status: PwnedStatus,
  breachedCopy: string
): { hint?: string; error?: string } {
  if (status === 'checking') return { hint: PWNED_CHECKING_COPY }
  if (status === 'breached') return { error: breachedCopy }
  return {}
}
