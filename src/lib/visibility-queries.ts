import type { AccessScopeKind } from '@/lib/instance-api'

export const authQueryKeys = {
  authStatus: ['auth-status'] as const,
  permissions: ['permissions'] as const,
  accessGrants: (resourceId: string) =>
    ['access-grants', resourceId] as const,
}

export const visibilityQueryKeys = {
  teams: ['visible-teams'] as const,
  orgServers: ['org-servers'] as const,
  workspaces: ['visible-workspaces'] as const,
  environments: (projectId?: string) =>
    ['visible-environments', projectId ?? 'all'] as const,
  projects: (workspaceId?: string) =>
    ['visible-projects', workspaceId ?? 'all'] as const,
  services: (environmentId?: string) =>
    ['visible-services', environmentId ?? 'all'] as const,
  hostings: (serviceId: string) =>
    ['visible-hostings', serviceId] as const,
  can: (resourceId: string, permissionKey: string) =>
    ['can', resourceId, permissionKey] as const,
}

export function isVisibilityQuery(query: {
  queryKey: readonly unknown[]
}): boolean {
  const root = query.queryKey[0]
  return (
    root === 'org-servers' ||
    root === 'visible-teams' ||
    root === 'visible-workspaces' ||
    root === 'visible-environments' ||
    root === 'visible-projects' ||
    root === 'visible-services' ||
    root === 'visible-hostings' ||
    root === 'access-grants' ||
    root === 'can'
  )
}

/** Mirrors instance `getAccessManagementPermission()` in access-management.ts. */
export const ACCESS_MANAGEMENT_PERMISSION = 'organization:own' as const

export function getAccessManagementPermissionKey(
  _kind: AccessScopeKind,
): typeof ACCESS_MANAGEMENT_PERMISSION {
  return ACCESS_MANAGEMENT_PERMISSION
}
