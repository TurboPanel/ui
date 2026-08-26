import { describe, expect, it } from 'vitest'
import {
  getAccessManagementPermissionKey,
  isVisibilityQuery,
  queryKeys,
} from './query-keys'

describe('isVisibilityQuery', () => {
  it('matches org-scoped hierarchical keys', () => {
    expect(
      isVisibilityQuery({ queryKey: queryKeys.org('org-1').servers.list }),
    ).toBe(true)
    expect(
      isVisibilityQuery({ queryKey: queryKeys.org('org-1').projects.list() }),
    ).toBe(true)
    expect(
      isVisibilityQuery({
        queryKey: queryKeys.org('org-1').workspaces.detail('ws-1'),
      }),
    ).toBe(true)
    expect(
      isVisibilityQuery({
        queryKey: queryKeys.org('org-1').settings.defaultEnvironment,
      }),
    ).toBe(true)
  })

  it('matches auth permission and grant keys', () => {
    expect(
      isVisibilityQuery({ queryKey: queryKeys.auth.permissions }),
    ).toBe(true)
    expect(
      isVisibilityQuery({
        queryKey: queryKeys.auth.accessGrants('resource-1'),
      }),
    ).toBe(true)
    expect(
      isVisibilityQuery({
        queryKey: queryKeys.auth.can('resource-1', 'organization:manage'),
      }),
    ).toBe(true)
    expect(
      isVisibilityQuery({
        queryKey: queryKeys.auth.resourceId('organization', 'org-1'),
      }),
    ).toBe(true)
    expect(isVisibilityQuery({ queryKey: queryKeys.auth.teams })).toBe(true)
  })

  it('rejects non-visibility keys', () => {
    expect(isVisibilityQuery({ queryKey: queryKeys.timezones })).toBe(false)
    expect(
      isVisibilityQuery({ queryKey: queryKeys.admin.publicUrls }),
    ).toBe(false)
    expect(
      isVisibilityQuery({ queryKey: queryKeys.recovery }),
    ).toBe(false)
  })

  it('treats all auth-root keys as visibility-scoped', () => {
    expect(
      isVisibilityQuery({ queryKey: queryKeys.auth.status }),
    ).toBe(true)
    expect(
      isVisibilityQuery({ queryKey: queryKeys.auth.session }),
    ).toBe(true)
  })

  it('rejects retired flat visibility roots', () => {
    expect(isVisibilityQuery({ queryKey: ['org-servers'] })).toBe(false)
    expect(isVisibilityQuery({ queryKey: ['visible-teams'] })).toBe(false)
    expect(isVisibilityQuery({ queryKey: ['visible-workspaces'] })).toBe(false)
    expect(isVisibilityQuery({ queryKey: ['access-grants'] })).toBe(false)
    expect(isVisibilityQuery({ queryKey: ['can'] })).toBe(false)
    expect(isVisibilityQuery({ queryKey: ['resource-id'] })).toBe(false)
  })
})

describe('queryKeys.org(…).topology', () => {
  it('nests all topology reads under topology.all so prefix invalidation works', () => {
    const topology = queryKeys.org('org-1').topology
    const prefix = topology.all

    expect(topology.datacenters.slice(0, prefix.length)).toEqual([...prefix])
    expect(topology.datacenter('dc-1').slice(0, prefix.length)).toEqual([
      ...prefix,
    ])
    expect(topology.nameSuggestions.slice(0, prefix.length)).toEqual([
      ...prefix,
    ])
    expect(topology.ips().slice(0, prefix.length)).toEqual([...prefix])
    expect(topology.ip('ip-1').slice(0, prefix.length)).toEqual([...prefix])
    expect(topology.networksAll).toEqual([
      'org',
      'org-1',
      'topology',
      'networks',
    ])
    expect(topology.networks().slice(0, topology.networksAll.length)).toEqual([
      ...topology.networksAll,
    ])
  })
})

describe('queryKeys.org(…).managed.members / bindings / tlsCa', () => {
  it('scopes members under the managed environment prefix', () => {
    const managed = queryKeys.org('org-1').managed
    expect(managed.members('env-1')).toEqual([
      'org',
      'org-1',
      'managed',
      'env-1',
      'members',
    ])
  })

  it('discriminates bindings list keys by serviceId / environmentId / managedEnvironmentId', () => {
    const bindings = queryKeys.org('org-1').bindings
    expect(bindings.list({ serviceId: 'svc-1' })).toEqual([
      'org',
      'org-1',
      'bindings',
      'serviceId',
      'svc-1',
    ])
    expect(bindings.list({ environmentId: 'env-1' })).toEqual([
      'org',
      'org-1',
      'bindings',
      'environmentId',
      'env-1',
    ])
    expect(bindings.list({ managedEnvironmentId: 'menv-1' })).toEqual([
      'org',
      'org-1',
      'bindings',
      'managedEnvironmentId',
      'menv-1',
    ])
    expect(bindings.all).toEqual(['org', 'org-1', 'bindings'])
  })

  it('nests tlsCa under the tls prefix for combined invalidation', () => {
    const org = queryKeys.org('org-1')
    expect(org.tlsCa).toEqual(['org', 'org-1', 'tls', 'ca'])
    expect(org.tlsCa.slice(0, org.tls.length)).toEqual([...org.tls])
    expect(org.tlsCaRotation).toEqual(['org', 'org-1', 'tls', 'ca', 'rotation'])
    expect(org.tlsCaRotation.slice(0, org.tls.length)).toEqual([...org.tls])
  })
})

describe('queryKeys.org(…).variables / storage / containers / commands', () => {
  it('discriminates variable and storage parent filters', () => {
    const org = queryKeys.org('org-1')
    expect(org.variables.list({ projectId: 'p1' })).toEqual([
      'org',
      'org-1',
      'variables',
      'projectId',
      'p1',
    ])
    expect(org.variables.list({ hostingId: 'h1' })).toEqual([
      'org',
      'org-1',
      'variables',
      'hostingId',
      'h1',
    ])
    expect(org.variables.list({ serverId: 's1' })).toEqual([
      'org',
      'org-1',
      'variables',
      'serverId',
      's1',
    ])
    expect(org.storage.list({ environmentId: 'e1' })).toEqual([
      'org',
      'org-1',
      'storage',
      'environmentId',
      'e1',
    ])
    expect(org.storage.list({ serviceId: 'svc-1' })).toEqual([
      'org',
      'org-1',
      'storage',
      'serviceId',
      'svc-1',
    ])
  })

  it('scopes containers and sorts command batch entries', () => {
    const org = queryKeys.org('org-1')
    expect(org.containers.list({ environmentId: 'e1' })).toEqual([
      'org',
      'org-1',
      'containers',
      { environmentId: 'e1' },
    ])
    expect(org.containers.logs('ctr-1', 50)).toEqual([
      'org',
      'org-1',
      'container',
      'ctr-1',
      'logs',
      50,
    ])
    expect(
      org.commands.batch([
        { serverId: 'b', commandId: '2' },
        { serverId: 'a', commandId: '1' },
      ]),
    ).toEqual([
      'org',
      'org-1',
      'commands',
      'batch',
      ['a:1', 'b:2'],
    ])
  })

  it('returns the fixed access-management permission key', () => {
    expect(getAccessManagementPermissionKey('organization')).toBe(
      'organization:own',
    )
    expect(getAccessManagementPermissionKey('team')).toBe('organization:own')
  })
})

describe('queryKeys.org(…) remaining factories', () => {
  it('builds variable parent keys for every scope', () => {
    const org = queryKeys.org('org-1')
    expect(org.variables.list({ organizationId: 'o1' })).toEqual([
      'org',
      'org-1',
      'variables',
      'organizationId',
      'o1',
    ])
    expect(org.variables.list({ workspaceId: 'w1' })).toEqual([
      'org',
      'org-1',
      'variables',
      'workspaceId',
      'w1',
    ])
    expect(org.variables.list({ environmentId: 'e1' })).toEqual([
      'org',
      'org-1',
      'variables',
      'environmentId',
      'e1',
    ])
    expect(org.variables.list({ serviceId: 's1' })).toEqual([
      'org',
      'org-1',
      'variables',
      'serviceId',
      's1',
    ])
    expect(org.variables.detail('var-1')).toEqual([
      'org',
      'org-1',
      'variable',
      'var-1',
    ])
  })

  it('builds storage, project, environment, and source keys', () => {
    const org = queryKeys.org('org-1')
    expect(org.storage.list({ projectId: 'p1' })).toEqual([
      'org',
      'org-1',
      'storage',
      'projectId',
      'p1',
    ])
    expect(org.projects.list('ws-1')).toEqual([
      'org',
      'org-1',
      'projects',
      'ws-1',
    ])
    expect(org.projects.list()).toEqual(['org', 'org-1', 'projects', 'all'])
    expect(org.environments.list('proj-1')).toEqual([
      'org',
      'org-1',
      'environments',
      'proj-1',
    ])
    expect(org.environments.deployPreview('env-1')).toEqual([
      'org',
      'org-1',
      'environment',
      'env-1',
      'deploy-preview',
    ])
    expect(org.environments.releases('env-1', 'web')).toEqual([
      'org',
      'org-1',
      'environment',
      'env-1',
      'releases',
      'web',
    ])
    expect(org.environments.releases('env-1')).toEqual([
      'org',
      'org-1',
      'environment',
      'env-1',
      'releases',
      'all',
    ])
    expect(org.sources.repositories('inst-1')).toEqual([
      'org',
      'org-1',
      'sources',
      'installations',
      'inst-1',
      'repositories',
    ])
  })

  it('builds command and server metric keys', () => {
    const org = queryKeys.org('org-1')
    expect(org.commands.detail('srv-1', 'cmd-1')).toEqual([
      'org',
      'org-1',
      'commands',
      'srv-1',
      'cmd-1',
    ])
    expect(org.commands.log('srv-1', 'cmd-1')).toEqual([
      'org',
      'org-1',
      'commands',
      'srv-1',
      'cmd-1',
      'log',
    ])
    expect(org.servers.metricsSeries('srv-1', '2026-01-01T00:00:00.000Z')).toEqual([
      'org',
      'org-1',
      'server',
      'srv-1',
      'metrics',
      'series',
      '2026-01-01T00:00:00.000Z',
    ])
    expect(org.servers.ips('srv-1', { scope: 'public' })).toEqual([
      'org',
      'org-1',
      'server',
      'srv-1',
      'ips',
      { scope: 'public' },
    ])
    expect(org.servers.networkPanel('srv-1')).toEqual([
      'org',
      'org-1',
      'server',
      'srv-1',
      'network-panel',
    ])
  })

  it('exposes stable auth and admin roots', () => {
    expect(queryKeys.auth.all).toEqual(['auth'])
    expect(queryKeys.admin.all).toEqual(['admin'])
    expect(queryKeys.org('org-1').all).toEqual(['org', 'org-1'])
  })

  it('builds auth.session and scope-separated git app keys', () => {
    expect(queryKeys.auth.session).toEqual(['auth', 'session'])
    expect(queryKeys.admin.gitApps).toEqual([
      'admin',
      'settings',
      'git',
      'apps',
    ])
    // The org collection also contains instance-wide apps, and its readOnly
    // flags differ per org, so it is keyed by organization — never shared with
    // the admin list or with another org's.
    expect(queryKeys.org('org-1').gitApps).toEqual([
      'org',
      'org-1',
      'git',
      'apps',
    ])
    expect(queryKeys.org('org-1').gitApps).not.toEqual(queryKeys.admin.gitApps)
  })

  it('builds managed leaf factories under the managed prefix', () => {
    const managed = queryKeys.org('org-1').managed
    expect(managed.orgList).toEqual(['org', 'org-1', 'managed'])
    expect(managed.environment('env-1')).toEqual([
      'org',
      'org-1',
      'managed',
      'env-1',
    ])
    expect(managed.status('env-1')).toEqual([
      'org',
      'org-1',
      'managed',
      'env-1',
      'status',
    ])
    expect(managed.users('env-1')).toEqual([
      'org',
      'org-1',
      'managed',
      'env-1',
      'users',
    ])
    expect(managed.databases('env-1')).toEqual([
      'org',
      'org-1',
      'managed',
      'env-1',
      'databases',
    ])
    expect(managed.backups('env-1')).toEqual([
      'org',
      'org-1',
      'managed',
      'env-1',
      'backups',
    ])
    expect(managed.logs('env-1')).toEqual([
      'org',
      'org-1',
      'managed',
      'env-1',
      'logs',
    ])
    expect(managed.status('env-1').slice(0, managed.all.length)).toEqual([
      ...managed.all,
    ])
  })

  it('builds services and hostings list keys', () => {
    const org = queryKeys.org('org-1')
    expect(org.services.list('env-1')).toEqual([
      'org',
      'org-1',
      'services',
      'env-1',
    ])
    expect(org.services.list()).toEqual(['org', 'org-1', 'services', 'all'])
    expect(org.services.all).toEqual(['org', 'org-1', 'services'])
    expect(org.hostings.list('svc-1')).toEqual([
      'org',
      'org-1',
      'hostings',
      'svc-1',
    ])
    expect(org.hostings.all).toEqual(['org', 'org-1', 'hostings'])
  })

  it('builds topology.networks with filter identity', () => {
    const topology = queryKeys.org('org-1').topology
    const filters = { kind: 'docker' as const, serverId: 'srv-1' }
    expect(topology.networks(filters)).toEqual([
      'org',
      'org-1',
      'topology',
      'networks',
      filters,
    ])
    expect(topology.networks()).toEqual([
      'org',
      'org-1',
      'topology',
      'networks',
      {},
    ])
    expect(topology.networks(filters).slice(0, topology.networksAll.length)).toEqual(
      [...topology.networksAll],
    )
  })
})
