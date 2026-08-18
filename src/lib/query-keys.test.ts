import { describe, expect, it } from 'vitest'
import { isVisibilityQuery, queryKeys } from './query-keys'

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
  })
})
