import { describe, expect, it } from 'vitest'
import {
  buildSearchItems,
  rankSearchItems,
  searchStatusChip,
  SEARCH_GROUP_ORDER,
  type SearchData,
} from '@/lib/search-index'

const base: SearchData = {
  billingEnabled: true,
  projectsScopeId: 'all',
  canManage: true,
  canOwn: true,
  isPlatformAdmin: true,
  servers: [
    {
      id: 's1',
      name: 'derp',
      hostname: 'derp.example.net',
      address: '10.0.0.5',
      connected: true,
      statusChangedAt: '2026-10-01T00:00:00Z',
    },
    {
      id: 's2',
      name: 'zed',
      hostname: null,
      address: null,
      connected: false,
      statusChangedAt: '2026-10-19T14:02:00Z',
    },
    {
      id: 's3',
      name: null,
      hostname: 'fresh.example.net',
      address: null,
      connected: false,
      statusChangedAt: null,
    },
  ],
  projects: [
    { id: 'p1', name: 'Blog', type: null },
    { id: 'p2', name: null, type: null },
    { id: 'p3', name: 'Hidden system', type: 'system' },
    { id: 'p4', name: 'Orders db', type: 'managed' },
  ],
  databases: [
    {
      id: 'm1',
      projectId: 'p4',
      name: 'Orders db',
      engineName: 'PostgreSQL',
      status: 'ready',
    },
    { id: 'm2', projectId: 'p5', name: null, engineName: null, status: 'failed' },
  ],
  datacenters: [
    { id: 'd1', name: 'Wichita' },
    { id: 'd2', name: null },
  ],
}

const items = (data: Partial<SearchData> = {}) => buildSearchItems('o1', { ...base, ...data })
const names = (list: readonly { name: string }[]) => list.map((i) => i.name)
const find = (list: ReturnType<typeof items>, id: string) => list.find((i) => i.id === id)

describe('buildSearchItems', () => {
  it('indexes servers with status and their address as a keyword', () => {
    const list = items()
    const derp = find(list, 'server-s1')
    expect(derp).toMatchObject({
      name: 'derp',
      group: 'Servers',
      type: 'Server',
      href: '/o1/servers/s1',
      status: 'online',
    })
    expect(derp?.keywords).toContain('10.0.0.5')
    expect(find(list, 'server-s2')?.status).toBe('offline')
    expect(find(list, 'server-s3')).toMatchObject({
      name: 'fresh.example.net',
      status: 'initializing',
    })
  })

  it('names a server by its id when it has no name or hostname', () => {
    const list = items({
      servers: [
        {
          id: 'abcdef123456',
          name: null,
          hostname: null,
          address: null,
          connected: true,
          statusChangedAt: null,
        },
      ],
    })
    expect(find(list, 'server-abcdef123456')?.name).toBe('Server abcdef12')
  })

  it('indexes projects, databases and datacenters, skipping system and managed projects', () => {
    const list = items()
    expect(find(list, 'project-p1')).toMatchObject({
      name: 'Blog',
      group: 'Projects',
      href: '/o1/projects/p1',
    })
    expect(find(list, 'project-p2')?.name).toBe('Untitled project')
    expect(find(list, 'project-p3')).toBeUndefined()
    expect(find(list, 'project-p4')).toBeUndefined()
    expect(find(list, 'database-m1')).toMatchObject({
      name: 'Orders db',
      group: 'Databases',
      type: 'Database',
      href: '/o1/projects/p4',
      status: 'ready',
    })
    expect(find(list, 'database-m1')?.keywords).toContain('PostgreSQL')
    expect(find(list, 'database-m2')).toMatchObject({ name: 'Managed database', status: 'failed' })
    expect(find(list, 'datacenter-d1')).toMatchObject({
      name: 'Wichita',
      group: 'Datacenters',
      href: '/o1/servers/datacenters/d1',
    })
    expect(find(list, 'datacenter-d2')?.name).toBe('Datacenter')
  })

  it('lists the sub-pages that exist, not just the top areas', () => {
    const list = items()
    const hrefs = Object.fromEntries(
      list.filter((i) => i.group === 'Pages').map((i) => [i.name, i.href])
    )
    expect(hrefs['Datacenters']).toBe('/o1/servers/datacenters')
    expect(hrefs['Pending Keys']).toBe('/o1/servers/keys')
    expect(hrefs['TLS Certificates']).toBe('/o1/servers/tls')
    expect(hrefs['Server Settings']).toBe('/o1/servers/settings')
    expect(hrefs['Firewall']).toBe('/o1/network/firewall')
    expect(hrefs['Members']).toBe('/o1/manage?tab=members')
    expect(hrefs['Domains & certificates']).toBe('/o1/manage?tab=domains')
    expect(hrefs['Git connections']).toBe('/o1/manage?tab=git')
    expect(hrefs['Principals']).toBe('/o1/manage?tab=principals')
    expect(hrefs['Managed Database Settings']).toBe('/o1/managed/settings')
    expect(hrefs['Billing']).toBe('/o1/billing')
  })

  it('adds a page for each server tab', () => {
    const list = items()
    expect(find(list, 'server-s1-tab-firewall')).toMatchObject({
      name: 'derp: Firewall',
      href: '/o1/servers/s1?tab=firewall',
      group: 'Pages',
    })
    expect(find(list, 'server-s1-tab-overview')).toBeUndefined()
  })

  it('offers the general actions to people who may run them', () => {
    const list = items()
    const actions = list.filter((i) => i.group === 'Actions' && !i.objectId)
    expect(Object.fromEntries(actions.map((a) => [a.name, a.href]))).toEqual({
      'Add server': '/o1/servers?add=1',
      'Add project': '/o1/projects/new',
      'Add database': '/o1/projects/new?type=managed',
      'Invite member': '/o1/manage?tab=members',
      'Update servers': '/o1/servers',
      'Update TurboPanel': '/admin/updates',
    })
  })

  it('hides actions the person may not run', () => {
    const list = items({ canManage: false, canOwn: false, isPlatformAdmin: false })
    const actionNames = names(list.filter((i) => i.group === 'Actions'))
    expect(actionNames).not.toContain('Add server')
    expect(actionNames).not.toContain('Invite member')
    expect(actionNames).not.toContain('Update servers')
    expect(actionNames).not.toContain('Update TurboPanel')
    expect(actionNames).not.toContain('Remove server derp')
    expect(actionNames).not.toContain('Reboot server derp')
    expect(actionNames).toContain('Add project')
    expect(actionNames).toContain('Open firewall for derp')
  })

  it('adds per-server actions that jump to the right tab', () => {
    const list = items()
    expect(find(list, 'action-firewall-s1')).toMatchObject({
      name: 'Open firewall for derp',
      href: '/o1/servers/s1?tab=firewall',
    })
    expect(find(list, 'action-reboot-s1')).toMatchObject({
      name: 'Reboot server derp',
      href: '/o1/servers/s1?tab=control',
      danger: true,
    })
    expect(find(list, 'action-remove-s1')).toMatchObject({
      name: 'Remove server derp',
      href: '/o1/servers/s1?tab=control',
      danger: true,
    })
    expect(find(list, 'action-remove-s1')?.confirm).toMatch(/Control tab/)
  })

  it('is status-aware: an offline server is removable, not rebootable', () => {
    const list = items()
    expect(find(list, 'action-reboot-s2')).toBeUndefined()
    expect(find(list, 'action-remove-s2')).toMatchObject({
      name: 'Remove server zed (host is gone)',
      priority: true,
    })
    expect(find(list, 'action-remove-s1')?.priority).toBeFalsy()
    // Initializing hosts have not connected yet: nothing to reboot either.
    expect(find(list, 'action-reboot-s3')).toBeUndefined()
  })

  it('hides Billing when the install has none', () => {
    expect(find(items({ billingEnabled: false }), 'billing')).toBeUndefined()
  })

  it('builds with no data loaded yet', () => {
    const list = items({ servers: [], projects: [], databases: [], datacenters: [] })
    expect(list.some((i) => i.group === 'Servers')).toBe(false)
    expect(list.some((i) => i.id === 'action-add-server')).toBe(true)
  })
})

describe('rankSearchItems', () => {
  const list = items()

  it('on an empty query shows the general actions then the pages, never per-object rows', () => {
    const ranked = rankSearchItems(list, '')
    expect(ranked[0]?.name).toBe('Add server')
    expect(ranked.some((i) => i.group === 'Servers')).toBe(false)
    expect(ranked.some((i) => i.objectId)).toBe(false)
    expect(ranked.some((i) => i.group === 'Pages')).toBe(true)
    expect(ranked.findIndex((i) => i.group === 'Pages')).toBeGreaterThan(
      ranked.map((i) => i.group).lastIndexOf('Actions')
    )
  })

  it('finds a server by name, hostname or address', () => {
    expect(names(rankSearchItems(list, 'derp')).slice(0, 1)).toEqual(['derp'])
    expect(names(rankSearchItems(list, 'derp.exa'))).toContain('derp')
    expect(names(rankSearchItems(list, '10.0.0'))).toEqual(['derp'])
  })

  it('matches word starts across words: "fire derp" finds the server firewall page', () => {
    const found = names(rankSearchItems(list, 'fire derp'))
    expect(found).toContain('derp: Firewall')
    expect(found).toContain('Open firewall for derp')
    expect(found).not.toContain('Firewall')
  })

  it('treats remove, delete and forget as the same word', () => {
    for (const q of ['remove zed', 'delete zed', 'forget zed']) {
      expect(names(rankSearchItems(list, q))[0]).toBe('Remove server zed (host is gone)')
    }
  })

  it('treats add, new and create as the same word', () => {
    for (const q of ['new server', 'create server']) {
      expect(names(rankSearchItems(list, q))).toContain('Add server')
    }
  })

  it('ranks the offline removal first when you type remove and its name', () => {
    const found = names(rankSearchItems(list, 'remove'))
    expect(found.indexOf('Remove server zed (host is gone)')).toBeLessThan(
      found.indexOf('Remove server derp')
    )
  })

  it('puts an exact name before a prefix, and objects before pages on a tie', () => {
    const found = rankSearchItems(items(), 'servers')
    expect(found[0]?.name).toBe('Servers')
    const tie = rankSearchItems(
      items({ projects: [{ id: 'px', name: 'Activity', type: null }] }),
      'activity'
    )
    expect(tie.map((i) => i.group)).toEqual(['Projects', 'Pages'])
  })

  it('returns nothing for text that matches nothing', () => {
    expect(rankSearchItems(list, 'zzzz')).toEqual([])
  })

  it('caps the rows so a huge fleet does not flood the list', () => {
    const many = Array.from({ length: 80 }, (_, i) => ({
      id: `x${i}`,
      name: `box-${i}`,
      hostname: null,
      address: null,
      connected: true,
      statusChangedAt: null,
    }))
    expect(rankSearchItems(items({ servers: many }), 'box').length).toBeLessThanOrEqual(30)
  })

  it('lists groups in a fixed order', () => {
    expect(SEARCH_GROUP_ORDER).toEqual([
      'Actions',
      'Servers',
      'Projects',
      'Databases',
      'Datacenters',
      'Pages',
    ])
  })
})

describe('searchStatusChip', () => {
  const chip = (status?: string) => searchStatusChip({ ...items()[0]!, status })
  it('maps server and database states to chips', () => {
    expect(chip(undefined)).toBeNull()
    expect(chip('online')).toEqual({ key: 'online' })
    expect(chip('offline')).toEqual({ key: 'offline' })
    expect(chip('initializing')).toEqual({ key: 'busy', label: 'Initializing' })
    expect(chip('ready')).toEqual({ key: 'running' })
    expect(chip('failed')).toEqual({ key: 'failed', label: 'Failed' })
    expect(chip('stopped')).toEqual({ key: 'stopped' })
    expect(chip('applying')).toEqual({ key: 'busy', label: 'Applying' })
    expect(chip('provisioning')).toEqual({ key: 'busy', label: 'Provisioning' })
  })
})
