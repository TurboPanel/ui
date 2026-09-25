import { describe, expect, it } from 'vitest'
import { oauthSignInError } from '@/lib/oauth-sign-in-errors'

describe('oauthSignInError', () => {
  it('explains an unverified provider email instead of a generic failure', () => {
    const message = oauthSignInError('oauth_email_unverified')
    expect(message).toContain('not verified')
    expect(message).not.toBe(oauthSignInError('something_new'))
  })

  it('names every code the control plane redirects with', () => {
    for (const code of [
      'account_conflict',
      'account_disabled',
      'not_configured',
      'oauth_email_unverified',
      'oauth_exchange_failed',
      'oauth_signup_disabled',
      'oauth_state_invalid',
      'oauth_unauthenticated',
    ]) {
      expect(oauthSignInError(code)).not.toBe('Sign-in failed. Try again.')
    }
  })

  it('falls back to a generic line for a code it does not know', () => {
    expect(oauthSignInError('something_new')).toBe('Sign-in failed. Try again.')
  })
})
