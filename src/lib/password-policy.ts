import type { PasswordMeterStatus } from '@/components/auth/auth-password-meter'

/**
 * The console's password policy and breached-password check, shared by every
 * screen that sets a password (sign-up, reset password).
 */

export type PasswordValidation = {
  isValid: boolean
  hasMinLength: boolean
  hasNumber: boolean
  hasSpecialChar: boolean
  noLeadingTrailingWhitespace: boolean
}

export const COMPROMISED_PASSWORD_MESSAGE =
  "That password isn't safe to use. Please choose a different one."

/**
 * The control plane checks every new password against the breach list too and
 * answers `password_breached` (the browser check below fails open, so the server
 * is authoritative). Swap that code for the same friendly copy the screens show.
 */
export function breachedPasswordCopy(message: string): string {
  return message.includes('password_breached') ? COMPROMISED_PASSWORD_MESSAGE : message
}

const PWNED_PASSWORDS_RANGE_URL = 'https://api.pwnedpasswords.com/range/'
const PWNED_PASSWORDS_TIMEOUT_MS = 5000

// Client mirror of the canonical server password policy in the instance repo
// (`src/client/authn/install-state.ts` → `validateSuperadminPassword` /
// `PASSWORD_SPECIAL_CHARS_PATTERN` / `PASSWORD_MIN_LENGTH`). The server enforces
// the same structural rules on every password-setting path (install, sign-up,
// password reset), so the API rejects weak passwords even if this UI check is
// bypassed. Keep the two in lockstep — do not weaken one without the other.
const PASSWORD_MIN_LENGTH = 8
const PASSWORD_SPECIAL_CHARS_PATTERN = /[$!@%&*#^()_+=-]/

export function validatePassword(password: string): PasswordValidation {
  const hasMinLength = password.length >= PASSWORD_MIN_LENGTH
  const hasNumber = /\d/.test(password)
  const hasSpecialChar = PASSWORD_SPECIAL_CHARS_PATTERN.test(password)
  const noLeadingTrailingWhitespace = password === password.trim()
  return {
    hasMinLength,
    hasNumber,
    hasSpecialChar,
    noLeadingTrailingWhitespace,
    isValid: hasMinLength && hasNumber && hasSpecialChar && noLeadingTrailingWhitespace,
  }
}

/**
 * One nudge at a time, never a checklist — sign-up is the first impression, so
 * the form asks for the single next thing instead of grading four rules at once.
 */
export function passwordHint(validation: PasswordValidation): string {
  if (!validation.hasMinLength) return 'A little longer'
  if (!validation.hasNumber) return 'Add a number'
  if (!validation.hasSpecialChar) return 'Add a symbol'
  if (!validation.noLeadingTrailingWhitespace) {
    return 'Remove the leading or trailing space'
  }
  return ''
}

/** Map structural policy + HIBP state onto the password meter badge. */
export function resolveMeterStatus(input: {
  hasPwnedResult: boolean
  isPwned: boolean | null
  checking: boolean
  isValid: boolean
}): PasswordMeterStatus {
  if (input.hasPwnedResult && input.isPwned === true) return 'compromised'
  if (input.checking) return 'checking'
  if (input.isValid) return 'valid'
  return 'incomplete'
}

/** Track fill; never reads full while the password is still rejected. */
export function passwordProgress(validation: PasswordValidation): number {
  if (validation.isValid) return 1
  const met = [
    validation.hasMinLength,
    validation.hasNumber,
    validation.hasSpecialChar,
  ].filter(Boolean).length
  return Math.min(met / 3, 2 / 3)
}

async function sha1Hex(password: string): Promise<string> {
  const enc = new TextEncoder()
  // HIBP range API requires SHA-1; only the 5-char prefix is sent (k-anonymity).
  const digest = await crypto.subtle.digest('SHA-1', enc.encode(password)) // NOSONAR typescript:S4790 — HIBP k-anonymity API mandates SHA-1
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase()
}

export type PwnedLookup = 'breached' | 'clean' | 'unavailable'

/** Breach lookup that tells "service unreachable" apart from "not found". */
export async function lookupPwnedPassword(password: string): Promise<PwnedLookup> {
  try {
    const fullHash = await sha1Hex(password)
    const prefix = fullHash.slice(0, 5)
    const suffix = fullHash.slice(5)
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), PWNED_PASSWORDS_TIMEOUT_MS)
    try {
      const res = await fetch(`${PWNED_PASSWORDS_RANGE_URL}${prefix}`, {
        headers: { 'Add-Padding': 'true' },
        signal: controller.signal,
      })
      if (!res.ok) return 'unavailable'
      const text = await res.text()
      for (const line of text.split(/\r?\n/)) {
        const colon = line.indexOf(':')
        if (colon === -1) continue
        const lineSuffix = line.slice(0, colon).trim()
        const countStr = line.slice(colon + 1).trim()
        if (lineSuffix === suffix) {
          const count = Number.parseInt(countStr, 10)
          return Number.isFinite(count) && count > 0 ? 'breached' : 'clean'
        }
      }
      return 'clean'
    } finally {
      clearTimeout(timeoutId)
    }
  } catch {
    return 'unavailable'
  }
}

/** True only when the password is in the breach list; fails open otherwise. */
export async function checkPwnedPassword(password: string): Promise<boolean> {
  return (await lookupPwnedPassword(password)) === 'breached'
}
