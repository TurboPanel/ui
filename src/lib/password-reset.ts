import { breachedPasswordCopy } from '@/lib/password-policy'
import { userErrorMessage } from '@/lib/user-error'

/**
 * What the reset-password page was opened with. The control plane's link
 * redirect lands here with `?token=<64 hex>` for a live link, or
 * `?error=INVALID_TOKEN` for an unknown, used or expired one (better-auth).
 */
export type ResetLinkState = { kind: 'ready'; token: string } | { kind: 'invalid' }

const RESET_TOKEN_PATTERN = /^[0-9a-f]{64}$/

function firstParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return (value[0] ?? '').trim()
  return (value ?? '').trim()
}

export function resetLinkState(params: {
  token?: string | string[]
  error?: string | string[]
}): ResetLinkState {
  if (firstParam(params.error)) return { kind: 'invalid' }
  const token = firstParam(params.token)
  return RESET_TOKEN_PATTERN.test(token) ? { kind: 'ready', token } : { kind: 'invalid' }
}

/**
 * What a failed reset shows: the expired-link screen for `INVALID_TOKEN`, else
 * one sentence. Both codes are read from the raw message, before
 * `userErrorMessage` drops the code, so a breached password reads the same
 * sentence as sign-up and invitations.
 */
export function resetPasswordFailure(err: unknown): { expired: true } | { message: string } {
  const raw = err instanceof Error ? err.message : ''
  if (raw.includes('INVALID_TOKEN')) return { expired: true }
  const breached = breachedPasswordCopy(raw)
  if (breached !== raw) return { message: breached }
  return { message: userErrorMessage(err, '') || 'Could not reset the password' }
}
