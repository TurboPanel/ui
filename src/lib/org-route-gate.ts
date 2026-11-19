/**
 * What the organization route renders while it settles. The route draws its
 * chrome with placeholders as soon as it mounts and only shows organization
 * data once the signed-in person is known to be a member.
 */
export type OrgRouteGate = 'pending' | 'install' | 'sign-in' | 'organizations' | 'ready'

export type OrgRouteGateInput = Readonly<{
  /** The session is still being read. */
  isLoading: boolean
  needsInstall: boolean
  hasSession: boolean
  orgId: string | undefined
  /** `null` while the organization list has not answered; otherwise whether `orgId` is in it. */
  orgAllowed: boolean | null
}>

export function orgRouteGate(input: OrgRouteGateInput): OrgRouteGate {
  const { isLoading, needsInstall, hasSession, orgId, orgAllowed } = input
  if (isLoading) return 'pending'
  if (needsInstall) return 'install'
  if (!hasSession) return 'sign-in'
  if (!orgId) return 'organizations'
  if (orgAllowed === null) return 'pending'
  return orgAllowed ? 'ready' : 'organizations'
}

/**
 * Whether `orgId` is one of the organizations the person belongs to.
 * `null` until the list has answered; a failed read counts as not a member,
 * so a 403 or 404 still sends the person to the organization list.
 */
export function orgMembership(
  input: Readonly<{
    orgId: string | undefined
    hasSession: boolean
    isPending: boolean
    isError: boolean
    /**
     * The list came from browser storage and no live answer has replaced it.
     * It is never proof of membership.
     */
    isRestored?: boolean
    organizations: readonly { id: string }[] | undefined
  }>
): boolean | null {
  const { orgId, hasSession, isPending, isError, isRestored = false, organizations } = input
  if (!orgId || !hasSession) return null
  if (isError) return false
  if (isPending || isRestored) return null
  if (!organizations) return false
  return organizations.some((org) => org.id === orgId)
}
