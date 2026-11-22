import type { AccessScopeKind, PermissionKey } from '@/lib/instance-api'

/**
 * The permissions a grant can carry on each scope, in the order the form lists
 * them. Container terminals are granted on the organization only: the control
 * plane rejects the key on any other kind of grant.
 */
export const PERMISSIONS_BY_SCOPE: Record<AccessScopeKind, PermissionKey[]> = {
  organization: [
    'organization:own',
    'organization:manage',
    'environments.deploy_network_shares',
    'terminal:container',
  ],
  team: ['team:own', 'team:manage'],
}

const PERMISSION_LABELS: Record<string, string> = {
  'environments.deploy_network_shares': 'Deploy network shares',
  'terminal:container': 'Open container terminal',
}

/** A grant's permission in words where it has a display name; the key for the older ones. */
export function grantPermissionLabel(key: string): string {
  return PERMISSION_LABELS[key] ?? key
}

/** The picker's title: our wording where we have one, else the control plane's display name. */
export function permissionTitle(key: string, displayName: string): string {
  return PERMISSION_LABELS[key] ?? displayName
}
