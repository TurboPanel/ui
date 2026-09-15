import type { TwoFactorCodeKind } from '@/lib/instance-api'

/**
 * Copy and small state transitions for the second-factor code prompt.
 *
 * The sign-in screen and the security screen both present the same two kinds of
 * secret (an authenticator code or a one-time backup code) with the same
 * wording, and the prompt's coverage is scoped to `src/lib/**` — so the labels
 * and the toggle live here rather than inline in JSX.
 */

export const TWO_FACTOR_PROMPT_TITLE = 'Two-factor authentication'

export const TWO_FACTOR_PROMPT_COPY: Record<TwoFactorCodeKind, string> = {
  totp: 'Enter the 6-digit code from your authenticator app.',
  backup: 'Enter one of the backup codes you saved when you enrolled.',
}

export const TWO_FACTOR_FIELD_LABEL: Record<TwoFactorCodeKind, string> = {
  totp: 'Authentication code',
  backup: 'Backup code',
}

/** Label for the link that swaps to the other kind of secret. */
export const TWO_FACTOR_TOGGLE_LABEL: Record<TwoFactorCodeKind, string> = {
  totp: 'Use a backup code',
  backup: 'Use your authenticator app',
}

export function otherTwoFactorKind(kind: TwoFactorCodeKind): TwoFactorCodeKind {
  return kind === 'totp' ? 'backup' : 'totp'
}

/**
 * Backup codes are alphanumeric and hyphenated; authenticator codes are six
 * digits. Only the latter can claim a numeric keypad on native.
 */
export function twoFactorKeyboard(
  kind: TwoFactorCodeKind,
): 'number-pad' | 'default' {
  return kind === 'totp' ? 'number-pad' : 'default'
}

/**
 * `one-time-code` lets the platform offer an SMS/authenticator autofill; a
 * backup code is never autofillable and the hint only gets in the way.
 */
export function twoFactorAutoComplete(
  kind: TwoFactorCodeKind,
): 'one-time-code' | 'off' {
  return kind === 'totp' ? 'one-time-code' : 'off'
}

/** Trim + strip separators so a pasted `1234 56` or `abcd-efgh` still submits. */
export function normalizeTwoFactorCode(
  value: string,
  kind: TwoFactorCodeKind,
): string {
  const trimmed = value.trim()
  return kind === 'totp' ? trimmed.replaceAll(/\s/g, '') : trimmed
}

/** A code short enough to be an obvious typo should not spend an attempt. */
export function isTwoFactorCodeComplete(
  value: string,
  kind: TwoFactorCodeKind,
): boolean {
  const normalized = normalizeTwoFactorCode(value, kind)
  return kind === 'totp' ? normalized.length === 6 : normalized.length >= 8
}
