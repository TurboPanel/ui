import type {
  AccessScopeKind,
  ContainerLogStream,
  IpAllocation,
  IpScope,
  NetworkKind,
  VariableParentFilter,
} from '@/lib/instance-api'

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
  scope?: IpScope
  allocation?: IpAllocation
}>

export type NetworkListFilters = Readonly<{
  organizationId?: string
  datacenterId?: string
  serverId?: string
  kind?: NetworkKind
}>

/**
 * Cache identity for one container-log read — every predicate the closed query
 * set allows, minus the cursor (pages of one filter share a cache entry).
 */
export type ContainerLogQueryKeyFilter = Readonly<{
  from: string
  to: string
  serverId?: string
  environmentId?: string
  serviceId?: string
  containerId?: string
  stream?: ContainerLogStream
  search?: string
  limit?: number
}>

export type ContainerListFilters = Readonly<{
  serviceId?: string
  environmentId?: string
  projectId?: string
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
        /** One O(1) fleet usage snapshot (CPU stack / load / memory / swap). */
        fleetUsage: ['org', orgId, 'servers', 'fleet-usage'] as const,
        /** Active registration keys (owner-only GET /licenses). */
        licenses: ['org', orgId, 'servers', 'licenses'] as const,
        reporting: (serverId: string, window: string) =>
          ['org', orgId, 'server', serverId, 'reporting', window] as const,
        metricsSeries: (serverId: string, rangeId: string) =>
          ['org', orgId, 'server', serverId, 'metrics', 'series', rangeId] as const,
        metricsSummary: (serverId: string, rangeId: string) =>
          ['org', orgId, 'server', serverId, 'metrics', 'summary', rangeId] as const,
        ips: (serverId: string, filters?: IpListFilters) =>
          ['org', orgId, 'server', serverId, 'ips', filters ?? {}] as const,
        /**
         * Combined server Network tab payload (IPs + networks + sites).
         * Not an `IpListFilters` key — do not reuse fake scopes here.
         */
        networkPanel: (serverId: string) =>
          ['org', orgId, 'server', serverId, 'network-panel'] as const,
        labels: (serverId: string) =>
          ['org', orgId, 'server', serverId, 'labels'] as const,
      },

      settings: {
        all: ['org', orgId, 'settings'] as const,
        defaultTimezone: ['org', orgId, 'default-timezone'] as const,
        hostDefaults: ['org', orgId, 'host-defaults'] as const,
        defaultEnvironment: ['org', orgId, 'default-environment'] as const,
        managedDefaults: ['org', orgId, 'managed-defaults'] as const,
        serverCapacity: ['org', orgId, 'server-capacity'] as const,
        fabric: ['org', orgId, 'fabric'] as const,
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
        networksAll: ['org', orgId, 'topology', 'networks'] as const,
        networks: (filters?: NetworkListFilters) =>
          ['org', orgId, 'topology', 'networks', filters ?? {}] as const,
      },

      tls: ['org', orgId, 'tls'] as const,
      /** Org CA sits under the tls prefix so one invalidation clears library + CA. */
      tlsCa: ['org', orgId, 'tls', 'ca'] as const,
      tlsCaRotation: ['org', orgId, 'tls', 'ca', 'rotation'] as const,

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
        /** Deploy history page (no interval — invalidated by deploy mutations). */
        deployments: (environmentId: string) =>
          ['org', orgId, 'environment', environmentId, 'deployments'] as const,
        /**
         * Git-backed releases for one compose service (or the whole
         * environment when unscoped). No interval, like deploy history — the
         * list changes only when a deploy or rollback command finishes.
         */
        releases: (environmentId: string, composeServiceName?: string) =>
          [
            'org',
            orgId,
            'environment',
            environmentId,
            'releases',
            composeServiceName ?? 'all',
          ] as const,
      },

      sources: {
        all: ['org', orgId, 'sources'] as const,
        list: ['org', orgId, 'sources'] as const,
        installations: ['org', orgId, 'sources', 'installations'] as const,
        repositories: (installationId: string) =>
          ['org', orgId, 'sources', 'installations', installationId, 'repositories'] as const,
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
        /** Identity-only cache key — members ride environment + status queries. */
        members: (environmentId: string) =>
          ['org', orgId, 'managed', environmentId, 'members'] as const,
        users: (environmentId: string) =>
          ['org', orgId, 'managed', environmentId, 'users'] as const,
        databases: (environmentId: string) =>
          ['org', orgId, 'managed', environmentId, 'databases'] as const,
        backups: (environmentId: string) =>
          ['org', orgId, 'managed', environmentId, 'backups'] as const,
        logs: (environmentId: string) =>
          ['org', orgId, 'managed', environmentId, 'logs'] as const,
      },

      bindings: {
        all: ['org', orgId, 'bindings'] as const,
        list: (
          filter:
            | { serviceId: string }
            | { environmentId: string }
            | { managedEnvironmentId: string },
        ) => {
          if ('serviceId' in filter) {
            return [
              'org',
              orgId,
              'bindings',
              'serviceId',
              filter.serviceId,
            ] as const
          }
          if ('managedEnvironmentId' in filter) {
            return [
              'org',
              orgId,
              'bindings',
              'managedEnvironmentId',
              filter.managedEnvironmentId,
            ] as const
          }
          return [
            'org',
            orgId,
            'bindings',
            'environmentId',
            filter.environmentId,
          ] as const
        },
      },

      containerLogs: {
        all: ['org', orgId, 'container-logs'] as const,
        settings: ['org', orgId, 'container-logs', 'settings'] as const,
        /**
         * Infinite-query key for one composed filter. The cursor is
         * deliberately **excluded**: pages of the same window/predicate set
         * share one cache entry, while changing a filter starts a fresh one.
         */
        query: (filter: ContainerLogQueryKeyFilter) =>
          ['org', orgId, 'container-logs', 'query', filter] as const,
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
        /** Execution-log transcript for one command (cursor-based tail). */
        log: (serverId: string, commandId: string) =>
          ['org', orgId, 'commands', serverId, commandId, 'log'] as const,
      },
    }) as const,

  admin: {
    all: ['admin'] as const,
    publicUrls: ['admin', 'public-urls'] as const,
    signup: ['admin', 'settings', 'signup'] as const,
    email: ['admin', 'settings', 'email'] as const,
  },
} as const

const VISIBILITY_ROOTS = new Set<unknown>(['org', 'auth'])

/**
 * True when a query belongs to a visibility-scoped subtree that should be
 * invalidated on 403 recovery (org / project / workspace / server roots, plus
 * auth permission / grant keys).
 */
export function isVisibilityQuery(query: {
  queryKey: readonly unknown[]
}): boolean {
  return VISIBILITY_ROOTS.has(query.queryKey[0])
}

/** Mirrors instance `getAccessManagementPermission()` in access-management.ts. */
export const ACCESS_MANAGEMENT_PERMISSION = 'organization:own' as const

export function getAccessManagementPermissionKey(
  _kind: AccessScopeKind,
): typeof ACCESS_MANAGEMENT_PERMISSION {
  return ACCESS_MANAGEMENT_PERMISSION
}
