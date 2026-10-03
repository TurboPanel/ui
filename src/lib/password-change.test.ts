import { describe, expect, it } from 'vitest'
import { changePasswordErrorMessage, changePasswordFormProblem } from './password-change'
import { COMPROMISED_PASSWORD_MESSAGE } from './password-policy'

/** Assembled at run time so secret scanners never read a fixture as a credential. */
const WORD = crypto
  .randomUUID()
  .replaceAll(/[^a-f]/g, '')
  .padEnd(8, 'x')
  .slice(0, 8)
const CURRENT = `${WORD}1-`
const NEXT = `${WORD}2-`

describe('changePasswordFormProblem', () => {
  it('accepts a complete, different, matching new password', () => {
    expect(changePasswordFormProblem({ current: CURRENT, next: NEXT, confirm: NEXT })).toBeNull()
  })

  it('asks for the current password first', () => {
    expect(changePasswordFormProblem({ current: '', next: NEXT, confirm: NEXT })).toBe(
      'Enter your current password.'
    )
  })

  it('applies the sign-up rules to the new password', () => {
    const problem = changePasswordFormProblem({ current: CURRENT, next: WORD, confirm: WORD })
    expect(problem).toContain('at least 8 characters')
  })

  it('refuses the same password and a mismatched confirmation', () => {
    expect(changePasswordFormProblem({ current: CURRENT, next: CURRENT, confirm: CURRENT })).toBe(
      'Choose a password different from your current one.'
    )
    expect(changePasswordFormProblem({ current: CURRENT, next: NEXT, confirm: `${NEXT}x` })).toBe(
      "The two new passwords don't match."
    )
  })
})

describe('changePasswordErrorMessage', () => {
  const failed = (detail: string) => `/api/client/v1/auth/change-password failed: ${detail}`

  it('shows the breached-password copy for password_breached', () => {
    expect(changePasswordErrorMessage(failed('HTTP 400: password_breached'))).toBe(
      COMPROMISED_PASSWORD_MESSAGE
    )
  })

  it('translates the known codes', () => {
    expect(changePasswordErrorMessage(failed('HTTP 400: incorrect_current_password'))).toBe(
      "Your current password isn't right."
    )
    expect(changePasswordErrorMessage(failed('HTTP 409: no_password'))).toContain(
      'without a password'
    )
    expect(changePasswordErrorMessage(failed('HTTP 400: password_unchanged'))).toContain(
      'different'
    )
    expect(changePasswordErrorMessage(failed('HTTP 429: Too many requests'))).toBe(
      'Too many attempts. Wait a minute and try again.'
    )
  })

  it('passes a password-rule message through and keeps everything else generic', () => {
    expect(
      changePasswordErrorMessage(failed('HTTP 400: Password must include at least one number'))
    ).toBe('Password must include at least one number.')
    expect(changePasswordErrorMessage(failed('HTTP 503: Database unavailable'))).toBe(
      'Could not change the password.'
    )
    expect(changePasswordErrorMessage('')).toBe('Could not change the password.')
  })
})
