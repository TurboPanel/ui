/**
 * Preserve invitation context across the guest sign-in / sign-up handoff.
 *
 * Accept lives on `/accept-invitation?id=…`. Guests leave that screen to
 * authenticate, then must land back there so the signed-in effect can call
 * `acceptInvitation(id)`.
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
  const params = new URLSearchParams({ redirectTo: acceptInvitationPath(invitationId) })
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
