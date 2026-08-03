import type { AccessScopeKind, VariableParentFilter } from '@/lib/instance-api'

/**
 * Hierarchical React Query key factory.
 *
 * Org-scoped prefixes (`['org', orgId]`) let a single invalidation clear an
 * entire org subtree. Prefer these helpers over ad-hoc string arrays.
 */

function variableParentKey(filter: VariableParentFilter): readonly [string, string] {
  if ('organizationId' in filter) return ['organizationId', filter.organizationId]
  if ('workspaceId' in filter) return ['workspaceId', filter.workspaceId]
  if ('projectId' in filter) return ['projectId', filter.projectId]
  if ('environmentId' in filter) return ['environmentId', filter.environmentId]
  if ('serviceId' in filter) return ['serviceId', filter.serviceId]
  if ('hostingId' in filter) return ['hostingId', filter.hostingId]
  return ['serverId', filter.serverId]
}

export type IpListFilters = Readonly<{
  organizationId?: string
  datacenterId?: string
  serverId?: string
  vpnId?: string
  scope?: string
  allocation?: string
}>

export type NetworkListFilters = Readonly<{
  organizationId?: string
  datacenterId?: string
  serverId?: string
  kind?: string
}>

export type ContainerListFilters = Readonly<{
  serviceId?: string
  environmentId?: string
  serverId?: string
  status?: string
}>

export type StorageParentFilter =
  | { environmentId: string }
  | { projectId: string }
  | { serviceId: string }

function storageParentKey(
  filter: StorageParentFilter,
): readonly [string, string] {
  if ('environmentId' in filter) return ['environmentId', filter.environmentId]
  if ('projectId' in filter) return ['projectId', filter.projectId]
  return ['serviceId', filter.serviceId]
}

export const queryKeys = {
  auth: {
    all: ['auth'] as const,
    status: ['auth', 'status'] as const,
    session: ['auth', 'session'] as const,
    organizations: ['auth', 'organizations'] as const,
    permissions: ['auth', 'permissions'] as const,
    resourceId: (kind: string, itemId: string) =>
      ['auth', 'resource-id', kind, itemId] as const,
    can: (resourceId: string, permissionKey: string) =>
      ['auth', 'can', resourceId, permissionKey] as const,
    accessGrants: (resourceId: string) =>
      ['auth', 'access-grants', resourceId] as const,
    teams: ['auth', 'teams'] as const,
  },

  recovery: ['recovery'] as const,

  timezones: ['timezones'] as const,

  org: (orgId: string) =>
    ({
      all: ['org', orgId] as const,

      servers: {
        /** Canonical org servers list — single O(1) fleet read. */
        list: ['org', orgId, 'servers'] as const,
        detail: (serverId: string) =>
          ['org', orgId, 'server', serverId] as const,
        status: (serverId: string) =>
          ['org', orgId, 'server', serverId, 'status'] as const,
        updateStatus: (serverId: string) =>
          ['org', orgId, 'server', serverId, 'update'] as const,
        updatesBatch: ['org', orgId, 'servers', 'updates'] as const,
        reporting: (serverId: string, window: string) =>
          ['org', orgId, 'server', serverId, 'reporting', window] as const,
        metricsSeries: (serverId: string, rangeId: string) =>
          ['org', orgId, 'server', serverId, 'metrics', 'series', rangeId] as const,
        metricsSummary: (serverId: string, rangeId: string) =>
          ['org', orgId, 'server', serverId, 'metrics', 'summary', rangeId] as const,
        ips: (serverId: string, filters?: IpListFilters) =>
          ['org', orgId, 'server', serverId, 'ips', filters ?? {}] as const,
      },

      settings: {
        all: ['org', orgId, 'settings'] as const,
        defaultTimezone: ['org', orgId, 'default-timezone'] as const,
        defaultEnvironment: ['org', orgId, 'default-environment'] as const,
        serverCapacity: ['org', orgId, 'server-capacity'] as const,
      },

      topology: {
        all: ['org', orgId, 'topology'] as const,
        datacenters: ['org', orgId, 'topology', 'datacenters'] as const,
        datacenter: (datacenterId: string) =>
          ['org', orgId, 'topology', 'datacenter', datacenterId] as const,
        nameSuggestions: [
          'org',
          orgId,
          'topology',
          'datacenter-name-suggestions',
        ] as const,
        ips: (filters?: IpListFilters) =>
          ['org', orgId, 'topology', 'ips', filters ?? {}] as const,
        ip: (ipId: string) =>
          ['org', orgId, 'topology', 'ip', ipId] as const,
        networks: (filters?: NetworkListFilters) =>
          ['org', orgId, 'topology', 'networks', filters ?? {}] as const,
        vpns: ['org', orgId, 'topology', 'vpns'] as const,
        vpn: (vpnId: string) =>
          ['org', orgId, 'topology', 'vpns', vpnId] as const,
        peers: (vpnId: string) =>
          ['org', orgId, 'topology', 'vpns', vpnId, 'peers'] as const,
      },

      tls: ['org', orgId, 'tls'] as const,

      workspaces: {
        all: ['org', orgId, 'workspaces'] as const,
        list: ['org', orgId, 'workspaces'] as const,
        detail: (workspaceId: string) =>
          ['org', orgId, 'workspace', workspaceId] as const,
      },

      projects: {
        all: ['org', orgId, 'projects'] as const,
        list: (workspaceId?: string) =>
          ['org', orgId, 'projects', workspaceId ?? 'all'] as const,
        detail: (projectId: string) =>
          ['org', orgId, 'project', projectId] as const,
        catalog: ['org', orgId, 'project-catalog'] as const,
        principals: (projectId: string) =>
          ['org', orgId, 'project', projectId, 'principals'] as const,
      },

      environments: {
        all: ['org', orgId, 'environments'] as const,
        list: (projectId?: string) =>
          ['org', orgId, 'environments', projectId ?? 'all'] as const,
        detail: (environmentId: string) =>
          ['org', orgId, 'environment', environmentId] as const,
        deployPreview: (environmentId: string) =>
          ['org', orgId, 'environment', environmentId, 'deploy-preview'] as const,
      },

      services: {
        all: ['org', orgId, 'services'] as const,
        list: (environmentId?: string) =>
          ['org', orgId, 'services', environmentId ?? 'all'] as const,
      },

      hostings: {
        all: ['org', orgId, 'hostings'] as const,
        list: (serviceId: string) =>
          ['org', orgId, 'hostings', serviceId] as const,
      },

      containers: {
        all: ['org', orgId, 'containers'] as const,
        list: (filters?: ContainerListFilters) =>
          ['org', orgId, 'containers', filters ?? {}] as const,
        detail: (containerId: string) =>
          ['org', orgId, 'container', containerId] as const,
      },

      variables: {
        all: ['org', orgId, 'variables'] as const,
        list: (filter: VariableParentFilter) =>
          ['org', orgId, 'variables', ...variableParentKey(filter)] as const,
        detail: (variableId: string) =>
          ['org', orgId, 'variable', variableId] as const,
      },

      storage: {
        all: ['org', orgId, 'storage'] as const,
        list: (filter: StorageParentFilter) =>
          ['org', orgId, 'storage', ...storageParentKey(filter)] as const,
      },

      managed: {
        all: ['org', orgId, 'managed'] as const,
        orgList: ['org', orgId, 'managed'] as const,
        environment: (environmentId: string) =>
          ['org', orgId, 'managed', environmentId] as const,
        status: (environmentId: string) =>
          ['org', orgId, 'managed', environmentId, 'status'] as const,
        users: (environmentId: string) =>
          ['org', orgId, 'managed', environmentId, 'users'] as const,
        databases: (environmentId: string) =>
          ['org', orgId, 'managed', environmentId, 'databases'] as const,
        backups: (environmentId: string) =>
          ['org', orgId, 'managed', environmentId, 'backups'] as const,
        logs: (environmentId: string) =>
          ['org', orgId, 'managed', environmentId, 'logs'] as const,
      },

      commands: {
        all: ['org', orgId, 'commands'] as const,
        batch: (entries: readonly { serverId: string; commandId: string }[]) =>
          [
            'org',
            orgId,
            'commands',
            'batch',
            [...entries]
              .map((e) => `${e.serverId}:${e.commandId}`)
              .sort((a, b) => a.localeCompare(b)),
          ] as const,
        detail: (serverId: string, commandId: string) =>
          ['org', orgId, 'commands', serverId, commandId] as const,
      },
    }) as const,

  admin: {
    all: ['admin'] as const,
    publicUrls: ['admin', 'public-urls'] as const,
    signup: ['admin', 'settings', 'signup'] as const,
    email: ['admin', 'settings', 'email'] as const,
  },
} as const

/** @deprecated Prefer {@link queryKeys.auth} — kept for import-stable re-exports. */
export const authQueryKeys = {
  authStatus: queryKeys.auth.status,
  session: queryKeys.auth.session,
  organizations: queryKeys.auth.organizations,
  permissions: queryKeys.auth.permissions,
  accessGrants: queryKeys.auth.accessGrants,
}

/**
 * @deprecated Prefer {@link queryKeys} — kept for import-stable re-exports.
 * `orgServers` is org-scoped; pass `orgId` when available, or use
 * `queryKeys.org(orgId).servers.list`.
 */
export const visibilityQueryKeys = {
  teams: queryKeys.auth.teams,
  /** Legacy unscoped root — prefer `queryKeys.org(orgId).servers.list`. */
  orgServers: ['org', 'servers'] as const,
  workspaces: ['org', 'workspaces', 'list'] as const,
  environments: (projectId?: string) =>
    ['org', 'environments', 'list', projectId ?? 'all'] as const,
  projects: (workspaceId?: string) =>
    ['org', 'projects', 'list', workspaceId ?? 'all'] as const,
  services: (environmentId?: string) =>
    ['org', 'services', 'list', environmentId ?? 'all'] as const,
  hostings: (serviceId: string) =>
    ['org', 'hostings', 'list', serviceId] as const,
  can: queryKeys.auth.can,
}

const VISIBILITY_ROOTS = new Set<unknown>([
  'org',
  'auth',
  // Legacy roots still accepted so in-flight caches invalidate on 403.
  'org-servers',
  'visible-teams',
  'visible-workspaces',
  'visible-environments',
  'visible-projects',
  'visible-services',
  'visible-hostings',
  'access-grants',
  'can',
  'resource-id',
])

/**
 * True when a query belongs to a visibility-scoped subtree that should be
 * invalidated on 403 recovery (org / project / workspace / server roots, plus
 * auth permission / grant keys).
 */
export function isVisibilityQuery(query: {
  queryKey: readonly unknown[]
}): boolean {
  const root = query.queryKey[0]
  if (VISIBILITY_ROOTS.has(root)) return true
  // Nested auth permission helpers
  if (root === 'auth') {
    const second = query.queryKey[1]
    return (
      second === 'can' ||
      second === 'access-grants' ||
      second === 'resource-id' ||
      second === 'permissions' ||
      second === 'teams'
    )
  }
  return false
}

/** Mirrors instance `getAccessManagementPermission()` in access-management.ts. */
export const ACCESS_MANAGEMENT_PERMISSION = 'organization:own' as const

export function getAccessManagementPermissionKey(
  _kind: AccessScopeKind,
): typeof ACCESS_MANAGEMENT_PERMISSION {
  return ACCESS_MANAGEMENT_PERMISSION
}
