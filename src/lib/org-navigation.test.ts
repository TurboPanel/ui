import { describe, expect, it } from 'vitest'
import {
  isOrgAreaActive,
  orgAreaFromPathname,
  datacenterHref,
  datacenterNewHref,
  networkAddressesHref,
  networkDockerHref,
  serversDatacentersHref,
} from './org-navigation'

describe('orgAreaFromPathname', () => {
  it('does not treat retired Links paths as a Network sub-route', () => {
    const resolved = orgAreaFromPathname('/org/network/links/vpn-id')
    expect(resolved).not.toBeNull()
    expect(resolved?.area.id).toBe('network')
    expect(resolved?.subRoute).toBeNull()
  })

  it('resolves TurboFabric under Network', () => {
    const resolved = orgAreaFromPathname('/org/network/fabric')
    expect(resolved).not.toBeNull()
    expect(resolved?.area.id).toBe('network')
    expect(resolved?.subRoute?.id).toBe('fabric')
    expect(resolved?.subRoute?.pathSegment).toBe('fabric')
  })

  it('resolves new datacenter under Servers Datacenters', () => {
    const resolved = orgAreaFromPathname('/org/servers/datacenters/new')
    expect(resolved?.area.id).toBe('servers')
    expect(resolved?.subRoute?.id).toBe('datacenter-new')
    expect(resolved?.subRoute?.pathSegment).toBe('datacenters')
  })

  it('resolves datacenter detail under Servers Datacenters', () => {
    const resolved = orgAreaFromPathname('/org/servers/datacenters/dc-1')
    expect(resolved?.area.id).toBe('servers')
    expect(resolved?.subRoute?.id).toBe('datacenter-detail')
    expect(resolved?.subRoute?.pathSegment).toBe('datacenters')
  })

  it('resolves legacy site detail under Network', () => {
    const resolved = orgAreaFromPathname('/org/network/sites/site-1')
    expect(resolved?.area.id).toBe('network')
    expect(resolved?.subRoute?.id).toBe('site-detail')
  })

  it('resolves Datacenters under Servers instead of server detail', () => {
    const resolved = orgAreaFromPathname('/org/servers/datacenters')
    expect(resolved?.area.id).toBe('servers')
    expect(resolved?.subRoute?.id).toBe('datacenters')
    expect(resolved?.subRoute?.pathSegment).toBe('datacenters')
  })
})

describe('isOrgAreaActive', () => {
  it('matches the exact area path', () => {
    expect(isOrgAreaActive('/org/servers', 'org', 'servers')).toBe(true)
  })

  it('matches a nested child path', () => {
    expect(isOrgAreaActive('/org/servers/dc-1', 'org', 'servers')).toBe(true)
  })

  it('does not match a sibling area', () => {
    expect(isOrgAreaActive('/org/servers', 'org', 'projects')).toBe(false)
    expect(isOrgAreaActive('/org/projects', 'org', 'servers')).toBe(false)
  })

  it('matches projects base paths that carry a workspace query', () => {
    // Helper strips `?…`; Expo `usePathname()` already omits the query.
    expect(
      isOrgAreaActive('/org/projects?workspaceId=ws-1', 'org', 'projects'),
    ).toBe(true)
  })
})

describe('serversDatacentersHref', () => {
  it('builds the Servers Datacenters href', () => {
    expect(serversDatacentersHref('org-1')).toBe('/org-1/servers/datacenters')
    expect(datacenterHref('org-1', 'dc-9')).toBe(
      '/org-1/servers/datacenters/dc-9',
    )
    expect(datacenterNewHref('org-1')).toBe('/org-1/servers/datacenters/new')
    expect(networkAddressesHref('org-1')).toBe('/org-1/network/addresses')
    expect(networkDockerHref('org-1')).toBe('/org-1/network/docker')
  })
})
