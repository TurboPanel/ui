/**
 * Preserve invitation context across the guest sign-in / sign-up handoff.
 *
 * The landing page is `/accept-invitation?token=…` (or `?id=…` for links sent
 * before link secrets). Guests leave it to sign in, then land back there to
 * press Accept.
 */

/** Same-origin path a signed-in user may be returned to after auth. */
export function safeAuthReturnPath(value: string | undefined): string | null {
  if (!value) return null
  const trimmed = value.trim()
  if (!trimmed.startsWith('/')) return null
  if (trimmed.startsWith('//')) return null
  if (trimmed.includes('\\')) return null
  if (trimmed.includes('://')) return null
  return trimmed
}

export function acceptInvitationPath(invitationId: string): string {
  return `/accept-invitation?id=${encodeURIComponent(invitationId)}`
}

/** The landing page for an emailed link secret (`?token=`). */
export function acceptInvitationTokenPath(token: string): string {
  return `/accept-invitation?token=${encodeURIComponent(token)}`
}

/** The landing page for whichever link brought the person here. */
export function invitationLandingPath(
  link: { kind: 'token'; token: string } | { kind: 'id'; id: string },
): string {
  return link.kind === 'token' ? acceptInvitationTokenPath(link.token) : acceptInvitationPath(link.id)
}

export function signInWithReturnHref(returnPath: string): string {
  return `/sign-in?redirectTo=${encodeURIComponent(returnPath)}`
}

/** What the sign-in page shows for an invitation hand-off: prefill + heading. */
export type InvitationSignInContext = {
  email?: string
  organizationName?: string
}

/**
 * Sign-in that returns to the invitation. With `context`, the sign-in page
 * prefills the invited email and says which organization the invitation is to.
 */
export function signInForInvitationHref(
  invitationId: string,
  context: InvitationSignInContext = {},
): string {
  return signInReturningTo(acceptInvitationPath(invitationId), context)
}

/** Sign-in that returns to `landingPath` (an `/accept-invitation?…` page). */
export function signInReturningTo(
  landingPath: string,
  context: InvitationSignInContext = {},
): string {
  const params = new URLSearchParams({ redirectTo: landingPath })
  if (context.email) params.set('email', context.email)
  if (context.organizationName) params.set('org', context.organizationName)
  return `/sign-in?${params.toString()}`
}

/**
 * The invitation context the sign-in page may show — only when it will return
 * to an invitation, so `?org=` cannot put arbitrary copy on the plain page.
 */
export function invitationSignInContext(params: {
  redirectTo?: string
  email?: string
  org?: string
}): InvitationSignInContext | null {
  const returnTo = safeAuthReturnPath(params.redirectTo)
  if (!returnTo?.startsWith('/accept-invitation?')) return null
  const context: InvitationSignInContext = {}
  const email = params.email?.trim()
  if (email && email.length <= 255 && email.includes('@')) context.email = email
  const org = params.org?.trim()
  if (org && org.length <= 200) context.organizationName = org
  return context
}

/** Heading copy for a sign-in that will accept an invitation. */
export function invitationSignInDescription(context: InvitationSignInContext | null): string | undefined {
  if (!context) return undefined
  return context.organizationName
    ? `Sign in to accept your invitation to ${context.organizationName}.`
    : 'Sign in to accept your invitation.'
}
