import { describe, expect, it } from 'vitest'
import {
  adjacentOrgTabHref,
  isOrgAreaActive,
  isOrgTabOverviewPath,
  isOrgTabOverviewRouteName,
  orgTabIndexFromPathname,
  orgAreaFromPathname,
  defaultOrgDashboardHref,
  orgManageHref,
  organizationsHref,
  orgTabHref,
  datacenterHref,
  datacenterNewHref,
  networkAddressesHref,
  networkDockerHref,
  serversDatacentersHref,
  serversPendingKeysHref,
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

  it('resolves Pending keys under Servers instead of server detail', () => {
    const resolved = orgAreaFromPathname('/org/servers/keys')
    expect(resolved?.area.id).toBe('servers')
    expect(resolved?.subRoute?.id).toBe('keys')
    expect(resolved?.subRoute?.pathSegment).toBe('keys')
  })

  it('does not treat Manage Organization as a sidebar area', () => {
    expect(orgAreaFromPathname('/org/manage')).toBeNull()

    const managed = orgAreaFromPathname('/org/managed')
    expect(managed?.area.id).toBe('managed')
    expect(managed?.subRoute).toBeNull()
  })
})

describe('orgTabIndexFromPathname', () => {
  it('returns 0, 1, 2 for Overview · Projects · Servers', () => {
    expect(orgTabIndexFromPathname('/org/overview', 'org')).toBe(0)
    expect(orgTabIndexFromPathname('/org/projects', 'org')).toBe(1)
    expect(orgTabIndexFromPathname('/org/servers', 'org')).toBe(2)
  })

  it('returns -1 off a tab overview', () => {
    expect(orgTabIndexFromPathname('/org/servers/srv-1', 'org')).toBe(-1)
    expect(orgTabIndexFromPathname('/org/projects/p-1', 'org')).toBe(-1)
  })
})

describe('isOrgTabOverviewRouteName', () => {
  it('matches nested-stack names for the three tab overviews', () => {
    expect(isOrgTabOverviewRouteName('overview')).toBe(true)
    expect(isOrgTabOverviewRouteName('overview/index')).toBe(true)
    expect(isOrgTabOverviewRouteName('projects/index')).toBe(true)
    expect(isOrgTabOverviewRouteName('[orgId]/servers')).toBe(true)
  })

  it('does not match project Overview or other nested routes', () => {
    expect(isOrgTabOverviewRouteName('projects/[projectId]/overview')).toBe(
      false,
    )
    expect(isOrgTabOverviewRouteName('servers/[serverId]')).toBe(false)
    expect(isOrgTabOverviewRouteName('servers/datacenters')).toBe(false)
    expect(isOrgTabOverviewRouteName('projects/new')).toBe(false)
    expect(isOrgTabOverviewRouteName('manage/index')).toBe(false)
  })
})

describe('isOrgTabOverviewPath', () => {
  it('matches each native tab overview, including a projects query', () => {
    expect(isOrgTabOverviewPath('/org/overview', 'org')).toBe(true)
    expect(isOrgTabOverviewPath('/org/projects', 'org')).toBe(true)
    expect(
      isOrgTabOverviewPath('/org/projects?workspaceId=ws-1', 'org'),
    ).toBe(true)
    expect(isOrgTabOverviewPath('/org/servers', 'org')).toBe(true)
  })

  it('does not match nested routes or other org areas', () => {
    expect(isOrgTabOverviewPath('/org/servers/srv-1', 'org')).toBe(false)
    expect(isOrgTabOverviewPath('/org/servers/datacenters', 'org')).toBe(false)
    expect(isOrgTabOverviewPath('/org/projects/new', 'org')).toBe(false)
    expect(isOrgTabOverviewPath('/org/projects/p-1', 'org')).toBe(false)
    expect(isOrgTabOverviewPath('/org/network', 'org')).toBe(false)
    expect(isOrgTabOverviewPath('/org/overview/extra', 'org')).toBe(false)
  })
})

describe('orgTabHref', () => {
  it('builds overview and servers area paths', () => {
    expect(orgTabHref('org-1', 'overview', 'all')).toBe('/org-1/overview')
    expect(orgTabHref('org-1', 'servers', 'all')).toBe('/org-1/servers')
  })

  it('keeps the projects workspace filter', () => {
    expect(orgTabHref('org-1', 'projects', 'all')).toBe('/org-1/projects')
    expect(orgTabHref('org-1', 'projects', 'ws-1')).toBe(
      '/org-1/projects?workspaceId=ws-1',
    )
  })
})

describe('adjacentOrgTabHref', () => {
  it('moves Overview → Projects → Servers and does not wrap', () => {
    expect(adjacentOrgTabHref('/org/overview', 'org', 'next', 'all')).toBe(
      '/org/projects',
    )
    expect(adjacentOrgTabHref('/org/projects', 'org', 'next', 'all')).toBe(
      '/org/servers',
    )
    expect(adjacentOrgTabHref('/org/servers', 'org', 'next', 'all')).toBeNull()
    expect(
      adjacentOrgTabHref('/org/overview', 'org', 'previous', 'all'),
    ).toBeNull()
    expect(adjacentOrgTabHref('/org/servers', 'org', 'previous', 'all')).toBe(
      '/org/projects',
    )
    expect(
      adjacentOrgTabHref('/org/projects?workspaceId=ws-1', 'org', 'next', 'all'),
    ).toBe('/org/servers')
  })

  it('preserves the projects workspace filter when swiping onto Projects', () => {
    expect(
      adjacentOrgTabHref('/org/overview', 'org', 'next', 'ws-9'),
    ).toBe('/org/projects?workspaceId=ws-9')
    expect(
      adjacentOrgTabHref('/org/servers', 'org', 'previous', 'ws-9'),
    ).toBe('/org/projects?workspaceId=ws-9')
  })

  it('returns null on nested routes even inside a tab area', () => {
    expect(
      adjacentOrgTabHref('/org/servers/srv-1', 'org', 'previous', 'all'),
    ).toBeNull()
    expect(
      adjacentOrgTabHref('/org/projects/p-1', 'org', 'next', 'all'),
    ).toBeNull()
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
    expect(isOrgAreaActive('/org/managed', 'org', 'manage')).toBe(false)
    expect(isOrgAreaActive('/org/manage', 'org', 'managed')).toBe(false)
  })

  it('matches projects base paths that carry a workspace query', () => {
    // Helper strips `?…`; Expo `usePathname()` already omits the query.
    expect(
      isOrgAreaActive('/org/projects?workspaceId=ws-1', 'org', 'projects'),
    ).toBe(true)
  })
})

describe('orgManageHref', () => {
  it('builds the Manage href', () => {
    expect(orgManageHref('org-1')).toBe('/org-1/manage')
  })
})

describe('defaultOrgDashboardHref', () => {
  it('opens the organization Overview', () => {
    expect(defaultOrgDashboardHref('org-1')).toBe('/org-1/overview')
  })
})

describe('organizationsHref', () => {
  it('builds the organization switcher path', () => {
    expect(organizationsHref()).toBe('/organizations')
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
    expect(serversPendingKeysHref('org-1')).toBe('/org-1/servers/keys')
  })
})
