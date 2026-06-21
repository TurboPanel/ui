import type { AccessScopeKind } from '@/lib/instance-api'

export const authQueryKeys = {
  authStatus: ['auth-status'] as const,
  accessProfiles: ['access-profiles'] as const,
  permissions: ['permissions'] as const,
  accessGrants: (entityType: string, entityId: string) =>
    ['access-grants', entityType, entityId] as const,
}

export const visibilityQueryKeys = {
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
  can: (entityType: string, entityId: string, permissionKey: string) =>
    ['can', entityType, entityId, permissionKey] as const,
}

export function isVisibilityQuery(query: {
  queryKey: readonly unknown[]
}): boolean {
  const root = query.queryKey[0]
  return (
    root === 'org-servers' ||
    root === 'visible-workspaces' ||
    root === 'visible-environments' ||
    root === 'visible-projects' ||
    root === 'visible-services' ||
    root === 'visible-hostings' ||
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
