import type { AccessScopeKind, PermissionKey } from '@/lib/instance-api'

/** The permissions a grant can carry on each scope, in the order the form lists them. */
export const PERMISSIONS_BY_SCOPE: Record<AccessScopeKind, PermissionKey[]> = {
  organization: ['organization:own', 'organization:manage', 'environments.deploy_network_shares'],
  team: ['team:own', 'team:manage'],
}

/** A grant's permission in words where it has a display name; the key for the older ones. */
export function grantPermissionLabel(key: string): string {
  return key === 'environments.deploy_network_shares' ? 'Deploy network shares' : key
}
