import { breachedPasswordCopy, validatePassword } from '@/lib/password-policy'

/**
 * The signed-in change-password form: what to check before asking the control
 * plane, and how to word what it answers. The control plane stays authoritative
 * (rules, breach list, current password); these checks only save a round trip.
 */

export type ChangePasswordForm = {
  current: string
  next: string
  confirm: string
}

/** The first thing wrong with the form, or `null` when it can be sent. */
export function changePasswordFormProblem(form: ChangePasswordForm): string | null {
  if (form.current.length === 0) return 'Enter your current password.'
  if (!validatePassword(form.next).isValid) {
    return 'The new password needs at least 8 characters, a number and a symbol, with no space at either end.'
  }
  if (form.next === form.current) return 'Choose a password different from your current one.'
  if (form.next !== form.confirm) return "The two new passwords don't match."
  return null
}

const KNOWN_ERRORS: readonly (readonly [RegExp, string])[] = [
  [/incorrect_current_password/, "Your current password isn't right."],
  [/no_password/, 'This account signs in without a password, so there is nothing to change.'],
  [/password_unchanged/, 'Choose a password different from your current one.'],
  [/HTTP 429\b/, 'Too many attempts. Wait a minute and try again.'],
]

const STATUS_PREFIX = /^.*?HTTP \d+:\s*/

/**
 * Words for a failed change. `message` is the thrown error text
 * (`<path> failed: HTTP 400: <code or rule>`); a rule message from the control
 * plane (for example "Password must include at least one number") is shown as
 * written, a known code is translated, and anything else is generic.
 */
export function changePasswordErrorMessage(message: string): string {
  const known = KNOWN_ERRORS.find(([pattern]) => pattern.test(message))
  if (known) return known[1]
  const breached = breachedPasswordCopy(message)
  if (breached !== message) return breached
  const detail = message.replace(STATUS_PREFIX, '').trim()
  return detail.startsWith('Password ') ? `${detail}.` : 'Could not change the password.'
}
