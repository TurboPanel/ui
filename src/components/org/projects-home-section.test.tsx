// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { applyScenario, SCENARIOS } from '@/components/ui/v4/rn-stub'
import type { ConfigViewSide, EnvironmentConfigViewResponse } from '@/lib/instance-api'
import { ProjectsHomeSection } from './projects-home-section'

const state = vi.hoisted(() => ({
  push: vi.fn(),
  canOwn: true,
  scope: null as null | Record<string, unknown>,
  projects: { data: undefined, isLoading: false, error: null, refetch: vi.fn() } as Record<string, unknown>,
  workspaces: { data: { workspaces: [{ id: 'w1', name: 'Acme' }] }, isLoading: false, error: null, refetch: vi.fn() } as Record<string, unknown>,
  environments: { data: undefined, refetch: vi.fn() } as Record<string, unknown>,
  containers: { data: undefined, refetch: vi.fn() } as Record<string, unknown>,
  views: {} as Record<string, unknown>,
  latest: {} as Record<string, unknown>,
  recent: [] as string[],
  platformIds: [] as string[],
  pullHandler: undefined as undefined | (() => Promise<void> | void),
}))

vi.mock('react-native', async () => (await import('@/components/ui/v4/rn-stub')).reactNativeStub)
vi.mock('react-native-svg', async () => (await import('@/components/ui/v4/rn-stub')).svgStub)
vi.mock('@/lib/theme-preference', async () => (await import('@/components/ui/v4/rn-stub')).themePreferenceStub)
vi.mock('expo-router', () => ({ useRouter: () => ({ push: state.push }) }))
vi.mock('@/components/org/workspace-switcher', () => ({
  WorkspaceSwitcher: () => <div data-testid="workspace-switcher" />,
}))
vi.mock('@/components/org/platform-badge', () => ({ PlatformBadge: () => <span /> }))
vi.mock('@/components/ui', () => ({ LoadingState: () => <div role="progressbar" /> }))
vi.mock('@/lib/query-client', () => ({ useCan: () => state.canOwn }))
vi.mock('@/lib/queries', () => ({
  useProjects: () => state.projects,
  useWorkspaces: () => state.workspaces,
}))
vi.mock('@/lib/queries/environments', () => ({ useEnvironments: () => state.environments }))
vi.mock('@/lib/queries/containers', () => ({ useContainers: () => state.containers }))
vi.mock('@/lib/queries/environment-cards', () => ({
  useEnvironmentConfigViews: () => ({ views: state.views, isLoading: false }),
  useLatestDeployments: () => ({ latest: state.latest }),
}))
vi.mock('@/lib/recent-projects', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/recent-projects')>()),
  useRecentProjectIds: () => state.recent,
}))
vi.mock('@/lib/pull-to-refresh', () => ({
  usePullToRefresh: (handler: () => Promise<void> | void) => {
    state.pullHandler = handler
  },
}))
vi.mock('@/lib/workspace-scope-context', () => ({ useOptionalWorkspaceScope: () => state.scope }))
vi.mock('@/lib/system-inventory', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/system-inventory')>()),
  isTurbopanelProject: (project: { id: string }) => state.platformIds.includes(project.id),
  isTurbopanelWorkspace: (workspace: { id: string }) => workspace.id === 'platform',
}))

const BASE: ConfigViewSide = {
  services: [
    {
      name: 'web',
      serviceId: null,
      kind: 'node',
      source: 'base',
      rows: [
        { key: 'u', area: 'linuxUser', field: 'linuxUser', label: 'Linux user', value: 'shop', masked: false, source: 'base' },
        { key: 'd', area: 'domain', field: 'domain:shop.example.com', label: 'Domain', value: 'shop.example.com', masked: false, source: 'base' },
      ],
    },
  ],
  variables: [],
  linuxUsers: [{ name: 'shop', access: 'sftp', description: null, source: 'base', usedBy: ['web'] }],
}

const VIEW: EnvironmentConfigViewResponse = {
  ok: true,
  environmentId: 'e1',
  projectId: 'p1',
  followsBase: true,
  base: BASE,
  effective: BASE,
  changes: [],
}

function project(id: string, name: string, type: string, workspaceId = 'w1') {
  return { id, name, description: null, workspaceId, metadata: { type } }
}

function environment(id: string, name: string, projectId: string) {
  return { id, name, projectId, serverId: null }
}

afterEach(cleanup)

describe.each(SCENARIOS)('Projects home ($name)', (scenario) => {
  beforeEach(() => {
    applyScenario(scenario)
    state.push.mockReset()
    state.canOwn = true
    state.scope = null
    state.recent = []
    state.platformIds = []
    state.views = { e1: VIEW }
    state.latest = {}
    state.projects = {
      data: {
        projects: [
          project('p1', 'Shop', 'docker-compose'),
          project('p2', 'Orders DB', 'managed'),
          project('p3', 'Platform', 'system', 'platform'),
        ],
      },
      isLoading: false,
      error: null,
      refetch: vi.fn().mockResolvedValue(undefined),
    }
    state.workspaces = {
      data: { workspaces: [{ id: 'w1', name: 'Acme' }] },
      isLoading: false,
      error: null,
      refetch: vi.fn().mockResolvedValue(undefined),
    }
    state.environments = {
      data: {
        environments: [
          environment('e1', 'Production', 'p1'),
          environment('e2', 'Production', 'p2'),
          environment('e3', 'Elsewhere', 'other'),
        ],
      },
      refetch: vi.fn().mockResolvedValue(undefined),
    }
    state.containers = {
      data: { containers: [{ environmentId: 'e1', status: 'running', containerId: 'c', role: 'service', composeServiceName: 'web' }] },
      refetch: vi.fn().mockResolvedValue(undefined),
    }
  })

  it('shows the title, the summary and a card per project in this scope', () => {
    state.platformIds = ['p3']
    render(<ProjectsHomeSection orgId="o" />)
    expect(screen.getByRole('heading', { name: 'Projects' })).toBeTruthy()
    expect(screen.getByText('2 projects · 2 environments · 1 running')).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Shop' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Orders DB' })).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'Platform' })).toBeNull()
    expect(screen.getByTestId('workspace-switcher')).toBeTruthy()
  })

  it('gives the Compose project its Base line, who runs it and its relation to the Base', () => {
    render(<ProjectsHomeSection orgId="o" />)
    expect(screen.getByText('Base · 1 service · 1 Linux user')).toBeTruthy()
    expect(screen.getByRole('group', { name: 'Who runs it' }).textContent).toContain('shop')
    const row = screen.getByRole('button', { name: 'Open Production in Shop' })
    expect(row.textContent).toContain('Follows the Base · shop.example.com')
    expect(row.textContent).toContain('Running')
  })

  it('gives a managed project a plain card', () => {
    render(<ProjectsHomeSection orgId="o" />)
    const row = screen.getByRole('button', { name: 'Open Production in Orders DB' })
    expect(row.textContent).not.toContain('Follows')
    expect(screen.getByText(/Managed database · 1 environment/)).toBeTruthy()
  })

  it('shows the workspace of each project when every workspace is listed', () => {
    render(<ProjectsHomeSection orgId="o" />)
    expect(screen.getAllByText(/· Acme$/).length).toBeGreaterThan(0)
  })

  it('omits the running count until containers arrive', () => {
    state.containers = { data: undefined, refetch: vi.fn() }
    render(<ProjectsHomeSection orgId="o" />)
    expect(screen.getByText('3 projects · 2 environments')).toBeTruthy()
  })

  it('opens a project, its Base and an environment', () => {
    render(<ProjectsHomeSection orgId="o" />)
    fireEvent.click(screen.getByRole('button', { name: 'Open Shop' }))
    expect(state.push).toHaveBeenLastCalledWith('/o/projects/p1')
    fireEvent.click(screen.getByRole('link', { name: 'Shop: Base · 1 service · 1 Linux user' }))
    expect(state.push).toHaveBeenLastCalledWith('/o/projects/p1/base')
    fireEvent.click(screen.getByRole('button', { name: 'Open Production in Shop' }))
    expect(state.push).toHaveBeenLastCalledWith('/o/projects/p1/environments/e1')
  })

  it('offers New project to organization owners only', () => {
    const { unmount } = render(<ProjectsHomeSection orgId="o" />)
    fireEvent.click(screen.getByRole('button', { name: 'New project' }))
    expect(state.push).toHaveBeenCalledWith(expect.stringContaining('/o/projects/new'))
    unmount()
    state.canOwn = false
    render(<ProjectsHomeSection orgId="o" />)
    expect(screen.queryByRole('button', { name: 'New project' })).toBeNull()
  })

  it('lists the projects opened last, newest first, skipping any that are gone', () => {
    state.recent = ['p2', 'gone', 'p1']
    render(<ProjectsHomeSection orgId="o" />)
    const recent = screen.getByRole('group', { name: 'Recent projects' })
    const links = recent.querySelectorAll('button')
    expect(Array.from(links).map((link) => link.getAttribute('aria-label'))).toEqual(['Orders DB', 'Shop'])
    fireEvent.click(screen.getByRole('link', { name: 'Shop' }))
    expect(state.push).toHaveBeenLastCalledWith('/o/projects/p1/environments/e1')
    fireEvent.click(screen.getByRole('link', { name: 'Orders DB' }))
    expect(state.push).toHaveBeenLastCalledWith('/o/projects/p2')
  })

  it('shows no recent row when nothing was opened', () => {
    render(<ProjectsHomeSection orgId="o" />)
    expect(screen.queryByRole('group', { name: 'Recent projects' })).toBeNull()
  })

  it('lists deploys in progress and opens that environment Deployments tab', () => {
    state.latest = {
      e1: {
        id: 'g',
        generation: 1,
        commands: [],
        status: 'running',
        actorEntityType: 'user',
        trigger: null,
        strategy: null,
        strategyOutcome: null,
        startedAt: new Date(Date.now() - 120_000).toISOString(),
        durationMs: null,
      },
    }
    render(<ProjectsHomeSection orgId="o" />)
    expect(screen.getByRole('heading', { name: 'Deploys in progress' })).toBeTruthy()
    const row = screen.getByRole('button', { name: 'Shop · Production' })
    expect(row.textContent).toContain('Deploying')
    expect(row.textContent).toContain('Started 2m ago')
    fireEvent.click(row)
    expect(state.push).toHaveBeenLastCalledWith('/o/projects/p1/environments/e1/deployments')
  })

  it('shows no in-progress list when nothing is deploying', () => {
    render(<ProjectsHomeSection orgId="o" />)
    expect(screen.queryByRole('heading', { name: 'Deploys in progress' })).toBeNull()
  })

  it('says it is loading', () => {
    state.projects = { data: undefined, isLoading: true, error: null, refetch: vi.fn() }
    render(<ProjectsHomeSection orgId="o" />)
    expect(screen.getByRole('progressbar')).toBeTruthy()
  })

  it('has a friendly empty state with a way to start', () => {
    state.projects = { data: { projects: [] }, isLoading: false, error: null, refetch: vi.fn() }
    render(<ProjectsHomeSection orgId="o" />)
    expect(screen.getByRole('heading', { name: 'No projects yet' })).toBeTruthy()
    expect(screen.getAllByRole('button', { name: 'New project' })).toHaveLength(2)
  })

  it('shows the reason when projects cannot be loaded', () => {
    state.projects = { data: undefined, isLoading: false, error: new Error('Network down'), refetch: vi.fn() }
    render(<ProjectsHomeSection orgId="o" />)
    expect(screen.getByText('Could not load projects')).toBeTruthy()
  })

  it('shows the reason when workspaces cannot be loaded', () => {
    state.workspaces = { data: undefined, isLoading: false, error: new Error('No workspaces'), refetch: vi.fn() }
    render(<ProjectsHomeSection orgId="o" />)
    expect(screen.getByText('Could not load projects')).toBeTruthy()
  })

  it('refreshes everything on pull to refresh', async () => {
    const refreshWorkspaces = vi.fn().mockResolvedValue(undefined)
    state.scope = { scopeId: 'all', workspaces: [], scope: { label: 'All' }, refreshWorkspaces }
    render(<ProjectsHomeSection orgId="o" />)
    await state.pullHandler?.()
    expect(state.projects.refetch).toHaveBeenCalled()
    expect(state.environments.refetch).toHaveBeenCalled()
    expect(state.containers.refetch).toHaveBeenCalled()
    expect(state.workspaces.refetch).toHaveBeenCalled()
    expect(refreshWorkspaces).toHaveBeenCalled()
  })

  it('in one workspace: no workspace labels, platform projects not hidden, no New project in the platform workspace', () => {
    state.scope = {
      scopeId: 'platform',
      workspaces: [{ id: 'platform', name: 'TurboPanel' }],
      scope: { label: 'TurboPanel', workspace: { id: 'platform', name: 'TurboPanel' } },
      refreshWorkspaces: vi.fn(),
    }
    state.platformIds = ['p3']
    render(<ProjectsHomeSection orgId="o" workspaceId="platform" />)
    expect(screen.getByRole('heading', { name: 'Platform' })).toBeTruthy()
    expect(screen.queryByText(/· Acme$/)).toBeNull()
    expect(screen.queryByRole('button', { name: 'New project' })).toBeNull()
  })
})
