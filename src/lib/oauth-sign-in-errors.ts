/**
 * Messages for the `?error=` code the control plane's OAuth callback redirects
 * back with. Every code it sends has a line here; an unknown one gets a
 * generic line rather than the raw code.
 */
const OAUTH_SIGN_IN_ERRORS: Readonly<Record<string, string>> = {
  oauth_state_invalid: 'Sign-in expired or was started in another browser. Try again.',
  oauth_exchange_failed: 'Could not complete sign-in. Try again.',
  oauth_email_unverified:
    'Your email address is not verified with that provider. Verify it there, then try again.',
  not_configured: 'Sign-in with that provider is not set up on this control plane.',
  account_disabled: 'This account is disabled.',
  oauth_signup_disabled: 'New accounts cannot be created this way.',
  account_conflict: 'That provider account is already linked to another user.',
  oauth_unauthenticated: 'Sign in first, then link this provider.',
}

export function oauthSignInError(code: string): string {
  return OAUTH_SIGN_IN_ERRORS[code] ?? 'Sign-in failed. Try again.'
}
