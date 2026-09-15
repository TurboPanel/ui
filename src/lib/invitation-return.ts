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

export function signInForInvitationHref(invitationId: string): string {
  return signInWithReturnHref(acceptInvitationPath(invitationId))
}
