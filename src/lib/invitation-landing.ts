/**
 * Invitation landing page (owner decision 2026-09-27): the emailed link opens
 * `/accept-invitation?token=<secret>`, which never accepts on load.
 *
 * Only the link **secret** may show the invited email, route a new address to
 * "create a password", or stand in for proof of the address — the invitation
 * id cannot (managers can list it). Links sent before the secret existed carry
 * `?id=`: those get the organization and inviter only, and the person signs
 * in or signs up as usual, then presses Accept (the server checks the email).
 */
import type { InvitationPreview } from './instance-api'

export type InvitationLink = { kind: 'token'; token: string } | { kind: 'id'; id: string }

/** `?token=` wins over `?id=`; neither → null. */
export function invitationLinkFromParams(params: {
  token?: string
  id?: string
}): InvitationLink | null {
  const token = params.token?.trim()
  if (token) return { kind: 'token', token }
  const id = params.id?.trim()
  if (id) return { kind: 'id', id }
  return null
}

export type InvitationLandingView =
  | { kind: 'missing-link' }
  | { kind: 'loading' }
  /** The link matches no invitation (or was re-sent). */
  | { kind: 'not-found' }
  /** Expired, revoked or already used. */
  | { kind: 'unavailable'; status: 'expired' | 'accepted' | 'revoked'; organizationName: string }
  /** Signed in (as the invited address, on the token path): the Accept button. */
  | { kind: 'accept'; organizationName: string; inviterName: string | null; invitationId: string }
  /** Token path, signed in as someone else: say so and offer switching accounts. */
  | { kind: 'wrong-account'; organizationName: string; signedInAs: string; invitedEmail: string }
  /** Token path, not signed in, the address has an account: go to sign-in, come back to Accept. */
  | { kind: 'sign-in'; organizationName: string; email: string }
  /** Token path, not signed in, no account yet: create a password — that is the accept. */
  | { kind: 'create-password'; organizationName: string; email: string }
  /** Old `?id=` link, not signed in: sign in or sign up with the invited email, then Accept. */
  | { kind: 'sign-in-to-accept'; organizationName: string; invitationId: string }
  /** The preview could not be read: offer a retry (never an automatic accept). */
  | { kind: 'error' }

export type InvitationLandingInput = {
  link: InvitationLink | null
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

function idLinkView(
  link: { kind: 'id'; id: string },
  input: InvitationLandingInput,
  preview: InvitationPreview | undefined
): InvitationLandingView {
  const organizationName = preview?.organizationName ?? 'this organization'
  if (input.sessionEmail !== null) {
    return {
      kind: 'accept',
      organizationName,
      inviterName: preview?.inviterName ?? null,
      invitationId: link.id,
    }
  }
  return { kind: 'sign-in-to-accept', organizationName, invitationId: link.id }
}

/** The preview route failed: a gone invitation, or a retry (an id link can still sign in). */
function previewFailureView(
  link: InvitationLink,
  input: InvitationLandingInput
): InvitationLandingView {
  if (isInvitationNotFound(input.previewError)) return { kind: 'not-found' }
  // An old id link can still be accepted after sign-in; the server checks the email.
  return link.kind === 'id' ? idLinkView(link, input, undefined) : { kind: 'error' }
}

/** A pending invitation reached by its secret token. */
function tokenLinkView(
  input: InvitationLandingInput,
  preview: InvitationPreview
): InvitationLandingView {
  const organizationName = preview.organizationName
  const invitedEmail = preview.email ?? ''
  const invitationId = preview.invitationId ?? ''
  if (input.sessionEmail !== null) {
    if (invitedEmail && !sameEmail(input.sessionEmail, invitedEmail)) {
      return {
        kind: 'wrong-account',
        organizationName,
        signedInAs: input.sessionEmail,
        invitedEmail,
      }
    }
    return { kind: 'accept', organizationName, inviterName: preview.inviterName, invitationId }
  }
  return preview.accountExists
    ? { kind: 'sign-in', organizationName, email: invitedEmail }
    : { kind: 'create-password', organizationName, email: invitedEmail }
}

export function invitationLandingView(input: InvitationLandingInput): InvitationLandingView {
  const link = input.link
  if (!link) return { kind: 'missing-link' }
  if (input.sessionLoading || input.previewLoading) return { kind: 'loading' }

  if (input.previewError !== undefined && input.previewError !== null) {
    return previewFailureView(link, input)
  }
  const preview = input.preview
  if (!preview) return { kind: 'loading' }

  if (preview.status !== 'pending') {
    return {
      kind: 'unavailable',
      status: preview.status,
      organizationName: preview.organizationName,
    }
  }
  return link.kind === 'id' ? idLinkView(link, input, preview) : tokenLinkView(input, preview)
}

/** One line for the expired / revoked / already-used states. */
export function unavailableInvitationCopy(
  status: 'expired' | 'accepted' | 'revoked',
  organizationName: string
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
  if (/HTTP 410\b/.test(message)) {
    return 'This invitation link has expired, was re-sent, or has already been used.'
  }
  if (/HTTP 429\b/.test(message)) return 'Too many attempts. Wait a minute and try again.'
  return message || 'Could not accept this invitation.'
}

/** The create-password submit found an existing account after all (raced sign-up). */
export function isAccountExistsError(err: unknown): boolean {
  return (
    err instanceof Error && /HTTP 409\b/.test(err.message) && err.message.includes('account_exists')
  )
}
