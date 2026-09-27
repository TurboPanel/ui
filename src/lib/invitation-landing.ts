/**
 * Invitation landing page (owner decision 2026-09-27): the emailed link opens
 * `/accept-invitation?id=…`, which never accepts on load. What it shows comes
 * from the unauthenticated invitation preview and who (if anyone) is signed in.
 */
import type { InvitationPreview } from './instance-api'

export type InvitationLandingView =
  | { kind: 'missing-id' }
  | { kind: 'loading' }
  /** The id matches no invitation. */
  | { kind: 'not-found' }
  /** Expired, revoked or already used. */
  | { kind: 'unavailable'; status: 'expired' | 'accepted' | 'revoked'; organizationName: string }
  /** Signed in as the invited address: show the Accept invitation button. */
  | { kind: 'accept'; organizationName: string; inviterName: string | null }
  /** Signed in as someone else: say so and offer switching accounts. */
  | { kind: 'wrong-account'; organizationName: string; signedInAs: string; invitedEmail: string }
  /** Not signed in, the address has an account: go to sign-in, come back to Accept. */
  | { kind: 'sign-in'; organizationName: string; email: string }
  /** Not signed in, no account yet: create a password — that is the accept. */
  | { kind: 'create-password'; organizationName: string; email: string }
  /**
   * The preview could not be read (an older control plane without it, or a
   * network error): fall back to explicit links and, when signed in, the
   * Accept button — never an automatic accept.
   */
  | { kind: 'fallback'; signedIn: boolean }

export type InvitationLandingInput = {
  invitationId: string
  sessionLoading: boolean
  /** The signed-in account's email, or null when signed out. */
  sessionEmail: string | null
  preview: InvitationPreview | undefined
  previewLoading: boolean
  previewError: unknown
}

function sameEmail(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase()
}

/** A JSON `not_found` from the preview route, as opposed to a route that doesn't exist. */
export function isInvitationNotFound(err: unknown): boolean {
  return err instanceof Error && /HTTP 404\b/.test(err.message) && err.message.includes('not_found')
}

export function invitationLandingView(input: InvitationLandingInput): InvitationLandingView {
  if (!input.invitationId) return { kind: 'missing-id' }
  if (input.sessionLoading || input.previewLoading) return { kind: 'loading' }
  if (input.previewError !== undefined && input.previewError !== null) {
    return isInvitationNotFound(input.previewError)
      ? { kind: 'not-found' }
      : { kind: 'fallback', signedIn: input.sessionEmail !== null }
  }
  const preview = input.preview
  if (!preview) return { kind: 'loading' }
  const organizationName = preview.organizationName

  if (preview.status !== 'pending') {
    return { kind: 'unavailable', status: preview.status, organizationName }
  }
  const invitedEmail = preview.email ?? ''

  if (input.sessionEmail !== null) {
    if (invitedEmail && !sameEmail(input.sessionEmail, invitedEmail)) {
      return { kind: 'wrong-account', organizationName, signedInAs: input.sessionEmail, invitedEmail }
    }
    return { kind: 'accept', organizationName, inviterName: preview.inviterName }
  }

  return preview.accountExists
    ? { kind: 'sign-in', organizationName, email: invitedEmail }
    : { kind: 'create-password', organizationName, email: invitedEmail }
}

/** One line for the expired / revoked / already-used states. */
export function unavailableInvitationCopy(
  status: 'expired' | 'accepted' | 'revoked',
  organizationName: string,
): string {
  if (status === 'accepted') {
    return `This invitation to ${organizationName} has already been accepted. Sign in to open it.`
  }
  if (status === 'revoked') {
    return `This invitation to ${organizationName} was withdrawn. Ask whoever invited you to send a new one.`
  }
  return `This invitation to ${organizationName} has expired. Ask whoever invited you to send a new one.`
}

/** Error copy for the Accept button and the create-password submit. */
export function invitationActionErrorCopy(err: unknown): string {
  if (!(err instanceof Error)) return 'Could not accept this invitation.'
  const message = err.message
  if (/HTTP 403\b/.test(message)) return 'This invitation was sent to a different email address.'
  if (/HTTP 404\b/.test(message)) return 'This invitation could not be found.'
  if (/HTTP 410\b/.test(message)) return 'This invitation has expired or has already been used.'
  if (/HTTP 429\b/.test(message)) return 'Too many attempts. Wait a minute and try again.'
  return message || 'Could not accept this invitation.'
}

/** The create-password submit found an existing account after all (raced sign-up). */
export function isAccountExistsError(err: unknown): boolean {
  return err instanceof Error && /HTTP 409\b/.test(err.message) && err.message.includes('account_exists')
}
