import { describe, expect, it } from 'vitest'
import {
  BREADCRUMB_MIN_WIDTH,
  breadcrumbRoute,
  databaseBreadcrumb,
  environmentBreadcrumb,
  environmentDeeperPage,
  projectBreadcrumb,
  serverBreadcrumb,
  showsBreadcrumb,
} from '@/lib/header-breadcrumb'

describe('breadcrumbRoute', () => {
  it('reads the server and project an address names', () => {
    expect(breadcrumbRoute('/o1/servers/s1', 'o1')).toEqual({ kind: 'server', id: 's1' })
    expect(breadcrumbRoute('/o1/servers/s1/metrics', 'o1')).toEqual({ kind: 'server', id: 's1' })
    expect(breadcrumbRoute('/o1/projects/p1', 'o1')).toEqual({ kind: 'project', id: 'p1' })
    expect(breadcrumbRoute('/o1/projects/p1/environments/e1/settings', 'o1')).toEqual({
      kind: 'project',
      id: 'p1',
    })
    expect(breadcrumbRoute('/o1/projects/p1?tab=x', 'o1')).toEqual({ kind: 'project', id: 'p1' })
  })

  it('shows nothing on the list pages, other areas and other organizations', () => {
    for (const path of [
      '/o1/servers',
      '/o1/servers/datacenters',
      '/o1/servers/datacenters/d1',
      '/o1/servers/keys',
      '/o1/servers/settings',
      '/o1/servers/tls',
      '/o1/projects',
      '/o1/projects/new',
      '/o1/projects/settings',
      '/o1/projects/git-sources',
      '/o1/projects/repositories',
      '/o1/activity',
      '/o1/managed',
      '/o1',
      '/',
      '/o2/servers/s1',
      '/admin/updates',
    ]) {
      expect(breadcrumbRoute(path, 'o1'), path).toBeNull()
    }
  })
})

describe('breadcrumb builders', () => {
  it('builds the server trail and its status chip', () => {
    expect(
      serverBreadcrumb('o1', {
        id: 's1',
        name: 'derp',
        hostname: 'h',
        connected: true,
        statusChangedAt: 'x',
      })
    ).toEqual({
      trail: [{ label: 'Servers', href: '/o1/servers' }],
      current: { label: 'derp', chip: { key: 'online' } },
    })
    expect(
      serverBreadcrumb('o1', {
        id: 's1',
        name: null,
        hostname: 'h.example',
        connected: false,
        statusChangedAt: 'x',
      }).current
    ).toEqual({ label: 'h.example', chip: { key: 'offline' } })
    expect(
      serverBreadcrumb('o1', {
        id: 'abcdef123456',
        name: ' ',
        hostname: null,
        connected: false,
        statusChangedAt: null,
      }).current
    ).toEqual({ label: 'Server abcdef12', chip: { key: 'busy', label: 'Initializing' } })
  })

  it('builds the project trail with the status of its environments', () => {
    expect(projectBreadcrumb('o1', 'Blog', 'running')).toEqual({
      trail: [{ label: 'Projects', href: '/o1/projects' }],
      current: { label: 'Blog', chip: { key: 'running' } },
    })
    expect(projectBreadcrumb('o1', ' ', 'failed').current.label).toBe('Unnamed project')
    // Nothing is known yet while containers load: no chip rather than "Unknown".
    expect(projectBreadcrumb('o1', 'Blog', 'unknown').current.chip).toBeNull()
  })

  it('builds the database trail back to Projects with the Managed Databases filter', () => {
    expect(databaseBreadcrumb('o1', 'Orders db', 'running')).toEqual({
      trail: [{ label: 'Projects', href: '/o1/projects?type=managed' }],
      current: { label: 'Orders db', chip: { key: 'running' } },
    })
  })
})

describe('showsBreadcrumb', () => {
  it('keeps phones as they are', () => {
    expect(showsBreadcrumb(BREADCRUMB_MIN_WIDTH - 1)).toBe(false)
    expect(showsBreadcrumb(BREADCRUMB_MIN_WIDTH)).toBe(true)
  })
})

describe('environmentBreadcrumb', () => {
  const base = {
    orgId: 'o1',
    projectId: 'p1',
    projectName: 'website',
    environmentId: 'e1',
    environmentName: 'production',
    status: 'running',
  }

  it('reads Projects › project › environment on a tab', () => {
    expect(environmentBreadcrumb({ ...base, page: null })).toEqual({
      trail: [
        { label: 'Projects', href: '/o1/projects' },
        { label: 'website', href: '/o1/projects/p1/overview' },
      ],
      current: { label: 'production', chip: { key: 'running' } },
    })
  })

  it('links the environment and names the page when deeper', () => {
    const crumb = environmentBreadcrumb({ ...base, page: 'Storage', status: 'unknown' })
    expect(crumb.trail.map((entry) => entry.label)).toEqual(['Projects', 'website', 'production'])
    expect(crumb.trail[2]?.href).toBe('/o1/projects/p1/environments/e1')
    expect(crumb.current).toEqual({ label: 'Storage', chip: null })
  })

  it('names an unnamed project', () => {
    expect(environmentBreadcrumb({ ...base, projectName: ' ', page: null }).trail[1]?.label).toBe(
      'Unnamed project'
    )
  })
})

describe('environmentDeeperPage', () => {
  it('names pages below a tab and nothing on the tabs themselves', () => {
    const root = '/o1/projects/p1/environments/e1'
    expect(environmentDeeperPage(`${root}/configuration/storage`, 'e1')).toBe('Storage')
    expect(environmentDeeperPage(`${root}/storage/?x=1`, 'e1')).toBe('Storage')
    for (const tab of [
      '',
      '/deployments',
      '/configuration',
      '/configuration/hosting',
      '/settings',
    ]) {
      expect(environmentDeeperPage(`${root}${tab}`, 'e1')).toBeNull()
    }
    expect(environmentDeeperPage('/o1/projects/p1/storage', 'e1')).toBeNull()
  })
})
