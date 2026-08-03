import { describe, expect, it } from 'vitest'
import {
  isVisibilityQuery,
  queryKeys,
  visibilityQueryKeys,
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

  it('matches legacy visibility roots', () => {
    expect(
      isVisibilityQuery({ queryKey: visibilityQueryKeys.orgServers }),
    ).toBe(true)
    expect(
      isVisibilityQuery({ queryKey: visibilityQueryKeys.workspaces }),
    ).toBe(true)
    expect(
      isVisibilityQuery({ queryKey: visibilityQueryKeys.environments('p-1') }),
    ).toBe(true)
    expect(
      isVisibilityQuery({ queryKey: visibilityQueryKeys.projects('ws-1') }),
    ).toBe(true)
    expect(
      isVisibilityQuery({ queryKey: visibilityQueryKeys.services('env-1') }),
    ).toBe(true)
    expect(
      isVisibilityQuery({
        queryKey: visibilityQueryKeys.hostings('svc-1'),
      }),
    ).toBe(true)
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

  it('accepts legacy flat roots for in-flight cache invalidation', () => {
    expect(isVisibilityQuery({ queryKey: ['org-servers'] })).toBe(true)
    expect(isVisibilityQuery({ queryKey: ['visible-teams'] })).toBe(true)
    expect(isVisibilityQuery({ queryKey: ['visible-workspaces'] })).toBe(true)
    expect(isVisibilityQuery({ queryKey: ['access-grants'] })).toBe(true)
    expect(isVisibilityQuery({ queryKey: ['can'] })).toBe(true)
    expect(isVisibilityQuery({ queryKey: ['resource-id'] })).toBe(true)
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
    expect(topology.networks().slice(0, prefix.length)).toEqual([...prefix])
    expect(topology.vpns.slice(0, prefix.length)).toEqual([...prefix])
    expect(topology.vpn('vpn-1').slice(0, prefix.length)).toEqual([...prefix])
    expect(topology.peers('vpn-1').slice(0, prefix.length)).toEqual([
      ...prefix,
    ])
  })
})
