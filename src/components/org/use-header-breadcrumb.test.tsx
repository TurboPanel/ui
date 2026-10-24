// @vitest-environment happy-dom
import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  pathname: '/o1/servers/s1',
  server: undefined as unknown,
  project: undefined as unknown,
  containersLoading: false,
}))

vi.mock('expo-router', () => ({ usePathname: () => state.pathname }))
vi.mock('@/lib/queries/servers', () => ({
  useServerDetail: () => ({ data: state.server }),
}))
vi.mock('@/lib/queries/projects', () => ({
  useProject: () => ({ data: state.project ? { project: state.project } : undefined }),
}))
vi.mock('@/lib/queries/environments', () => ({
  useEnvironments: () => ({
    data: { environments: [{ id: 'e1', projectId: 'p1', name: 'prod' }] },
  }),
}))
vi.mock('@/lib/queries/containers', () => ({
  useContainersByProject: () => ({
    isLoading: state.containersLoading,
    containersByEnv: {
      e1: [{ id: 'c1', environmentId: 'e1', state: 'running', status: 'running' }],
    },
  }),
}))
vi.mock('@/lib/queries/environment-cards', () => ({
  useEnvironmentConfigViews: () => ({ views: {} }),
  useLatestDeployments: () => ({ latest: {} }),
}))
vi.mock('@/lib/v4/projects-home', () => ({
  wantsConfigView: (project: { kind?: string | null }) => project.kind !== 'managed',
  homeProject: ({ project }: { project: { name: string; kind?: string | null } }) => ({
    name: project.name,
    kind: project.kind === 'managed' ? 'managed' : 'compose',
    status: 'running',
    environments: [{ id: 'e1', name: 'prod', status: 'deploying', isPrimary: true, pinned: false }],
  }),
}))

beforeEach(() => {
  state.pathname = '/o1/servers/s1'
  state.server = undefined
  state.project = undefined
})

async function run() {
  const { useHeaderBreadcrumb } = await import('@/components/org/use-header-breadcrumb')
  return renderHook(() => useHeaderBreadcrumb('o1')).result.current
}

describe('useHeaderBreadcrumb', () => {
  it('builds the server crumb once the server has loaded', async () => {
    expect(await run()).toBeNull()
    state.server = { id: 's1', name: 'derp', hostname: null, connected: true, statusChangedAt: 'x' }
    expect(await run()).toMatchObject({
      trail: [{ label: 'Servers', href: '/o1/servers' }],
      current: { label: 'derp', chip: { key: 'online' } },
    })
  })

  it('builds the project crumb', async () => {
    state.pathname = '/o1/projects/p1/services'
    expect(await run()).toBeNull()
    state.project = { id: 'p1', name: 'Blog', metadata: null }
    expect(await run()).toMatchObject({
      trail: [{ label: 'Projects', href: '/o1/projects' }],
      current: { label: 'Blog', chip: { key: 'running' } },
    })
  })

  it('goes down to the environment, with the environment status', async () => {
    state.pathname = '/o1/projects/p1/environments/e1/deployments'
    state.project = { id: 'p1', name: 'Blog', metadata: null }
    expect(await run()).toEqual({
      trail: [
        { label: 'Projects', href: '/o1/projects' },
        { label: 'Blog', href: '/o1/projects/p1/overview' },
      ],
      current: { label: 'prod', chip: { key: 'deploying' } },
    })
  })

  it('adds the page name on a page deeper than a tab', async () => {
    state.pathname = '/o1/projects/p1/environments/e1/configuration/storage'
    state.project = { id: 'p1', name: 'Blog', metadata: null }
    const crumb = await run()
    expect(crumb?.trail.map((entry) => entry.label)).toEqual(['Projects', 'Blog', 'prod'])
    expect(crumb?.trail[2]?.href).toBe('/o1/projects/p1/environments/e1')
    expect(crumb?.current.label).toBe('Storage')
  })

  it('stops at the project when the path names an unknown environment', async () => {
    state.pathname = '/o1/projects/p1/environments/gone'
    state.project = { id: 'p1', name: 'Blog', metadata: null }
    expect(await run()).toMatchObject({ current: { label: 'Blog' } })
  })

  it('builds the database crumb for a managed project', async () => {
    state.pathname = '/o1/projects/p1'
    state.project = { id: 'p1', name: 'Orders db', kind: 'managed' }
    expect(await run()).toMatchObject({
      trail: [{ label: 'Managed', href: '/o1/managed' }],
      current: { label: 'Orders db' },
    })
  })

  it('waits for containers before judging a project status', async () => {
    state.pathname = '/o1/projects/p1'
    state.project = { id: 'p1', name: 'Blog', metadata: null }
    state.containersLoading = true
    expect(await run()).not.toBeNull()
    state.containersLoading = false
  })

  it('is null on other pages', async () => {
    state.pathname = '/o1/activity'
    expect(await run()).toBeNull()
  })
})
