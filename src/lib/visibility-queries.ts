import type { AccessScopeKind } from '@/lib/instance-api'

export const authQueryKeys = {
  authStatus: ['auth-status'] as const,
  roles: ['roles'] as const,
  permissions: ['permissions'] as const,
  accessGrants: (resourceId: string) => ['access-grants', resourceId] as const,
}

export const visibilityQueryKeys = {
  orgServers: ['org-servers'] as const,
  realms: ['visible-realms'] as const,
  environments: (realmId?: string) =>
    ['visible-environments', realmId ?? 'all'] as const,
  projects: (environmentId?: string) =>
    ['visible-projects', environmentId ?? 'all'] as const,
  services: (projectId?: string) =>
    ['visible-services', projectId ?? 'all'] as const,
  hostings: (projectId?: string) =>
    ['visible-hostings', projectId ?? 'all'] as const,
  resourceId: (kind: AccessScopeKind, itemId: string) =>
    ['resource-id', kind, itemId] as const,
  can: (resourceId: string, permissionKey: string) =>
    ['can', resourceId, permissionKey] as const,
}

export function isVisibilityQuery(query: {
  queryKey: readonly unknown[]
}): boolean {
  const root = query.queryKey[0]
  return (
    root === 'org-servers' ||
    root === 'visible-realms' ||
    root === 'visible-environments' ||
    root === 'visible-projects' ||
    root === 'visible-services' ||
    root === 'visible-hostings' ||
    root === 'resource-id' ||
    root === 'access-grants' ||
    root === 'can'
  )
}

export function getAccessManagementPermissionKey(
  kind: AccessScopeKind,
): string {
  if (kind === 'organization') return 'organization:members'
  return `${kind}:rw`
}
