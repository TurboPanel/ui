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
  environments: (workspaceId?: string) =>
    ['visible-environments', workspaceId ?? 'all'] as const,
  projects: (environmentId?: string) =>
    ['visible-projects', environmentId ?? 'all'] as const,
  services: (projectId?: string) =>
    ['visible-services', projectId ?? 'all'] as const,
  hostings: (projectId?: string) =>
    ['visible-hostings', projectId ?? 'all'] as const,
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
