import { describe, expect, it } from 'vitest'
import { resetLinkState, resetPasswordFailure } from './password-reset'
import { COMPROMISED_PASSWORD_MESSAGE } from './password-policy'

const TOKEN = 'a'.repeat(64)

describe('resetLinkState', () => {
  it('is ready with a well-formed token', () => {
    expect(resetLinkState({ token: TOKEN })).toEqual({ kind: 'ready', token: TOKEN })
    expect(resetLinkState({ token: [TOKEN, 'x'] })).toEqual({ kind: 'ready', token: TOKEN })
  })

  it('is invalid when the link redirect reported an error', () => {
    expect(resetLinkState({ token: TOKEN, error: 'INVALID_TOKEN' })).toEqual({ kind: 'invalid' })
  })

  it('is invalid without a token or with a malformed one', () => {
    expect(resetLinkState({})).toEqual({ kind: 'invalid' })
    expect(resetLinkState({ token: 'abc' })).toEqual({ kind: 'invalid' })
    expect(resetLinkState({ token: 'Z'.repeat(64) })).toEqual({ kind: 'invalid' })
  })
})

describe('resetPasswordFailure', () => {
  it('reads the codes from the raw message, before the code is dropped for display', () => {
    expect(
      resetPasswordFailure(
        new Error(
          '/api/client/v1/auth/reset-password failed: HTTP 400: INVALID_TOKEN \u2014 Invalid token'
        )
      )
    ).toEqual({ expired: true })
    expect(
      resetPasswordFailure(
        new Error(
          '/api/client/v1/auth/reset-password failed: HTTP 400: password_breached \u2014 This password has appeared in a data breach.'
        )
      )
    ).toEqual({ message: COMPROMISED_PASSWORD_MESSAGE })
  })

  it('shows the server sentence, else a plain fallback', () => {
    expect(
      resetPasswordFailure(
        new Error('/p failed: HTTP 400: weak_password \u2014 Use a longer password.')
      )
    ).toEqual({ message: 'Use a longer password.' })
    expect(resetPasswordFailure('nope')).toEqual({ message: 'nope' })
    expect(resetPasswordFailure(null)).toEqual({ message: 'Could not reset the password' })
  })
})
