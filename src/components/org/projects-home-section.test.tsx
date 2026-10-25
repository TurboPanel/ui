// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { applyScenario, env, SCENARIOS, styleOf } from '@/components/ui/v4/rn-stub'
import { getProjectsView, setProjectsView } from '@/lib/projects-view'
import { ProjectsHomeSection } from './projects-home-section'
import { WELCOME_LINES } from './projects-welcome-card'

const state = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  canOwn: true,
  repositories: { data: undefined, refetch: vi.fn() } as Record<string, unknown>,
  managed: { data: undefined, refetch: vi.fn() } as Record<string, unknown>,
  enabled: { repositories: undefined, managed: undefined } as Record<string, boolean | undefined>,
  scope: null as null | Record<string, unknown>,
  projects: { data: undefined, isLoading: false, error: null, refetch: vi.fn() } as Record<
    string,
    unknown
  >,
  workspaces: {
    data: { workspaces: [{ id: 'w1', name: 'Acme' }] },
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  } as Record<string, unknown>,
  environments: { data: undefined, refetch: vi.fn() } as Record<string, unknown>,
  containers: { data: undefined, refetch: vi.fn() } as Record<string, unknown>,
  servers: { data: undefined } as Record<string, unknown>,
  serversEnabled: undefined as boolean | undefined,
  latest: {} as Record<string, unknown>,
  readIds: { latest: [] as string[] },
  recent: [] as string[],
  platformIds: [] as string[],
  pullHandler: undefined as undefined | (() => Promise<void> | void),
}))

vi.mock('react-native', async () => (await import('@/components/ui/v4/rn-stub')).reactNativeStub)
vi.mock('react-native-svg', async () => (await import('@/components/ui/v4/rn-stub')).svgStub)
vi.mock(
  '@/lib/theme-preference',
  async () => (await import('@/components/ui/v4/rn-stub')).themePreferenceStub
)
vi.mock('expo-router', () => ({
  useRouter: () => ({ push: state.push, replace: state.replace }),
}))
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
vi.mock('@/lib/queries/servers', () => ({
  useOrgServers: (_org: string, options?: { enabled?: boolean }) => {
    state.serversEnabled = options?.enabled
    return state.servers
  },
}))
vi.mock('@/lib/queries/containers', () => ({ useContainers: () => state.containers }))
vi.mock('@/lib/queries/releases', () => ({
  useRepositories: (_org: string, options?: { enabled?: boolean }) => {
    state.enabled.repositories = options?.enabled
    return state.repositories
  },
}))
vi.mock('@/lib/queries/managed', () => ({
  useOrganizationManaged: (_org: string, options?: { enabled?: boolean }) => {
    state.enabled.managed = options?.enabled
    return state.managed
  },
}))
vi.mock('@/lib/queries/environment-cards', () => ({
  useLatestDeployments: (_org: string, ids: string[]) => {
    state.readIds.latest = ids
    return { latest: state.latest }
  },
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

function project(
  id: string,
  name: string,
  kind: string | null,
  workspaceId = 'w1',
  extra: Record<string, unknown> = {}
) {
  return {
    id,
    name,
    description: null,
    workspaceId,
    kind,
    metadata: null,
    repositoryId: null,
    ...extra,
  }
}

function environment(
  id: string,
  name: string,
  projectId: string,
  flags: { isPrimary?: boolean; pinned?: boolean; createdAt?: string } = {}
) {
  return { id, name, projectId, serverId: null, createdAt: '2026-01-01', ...flags }
}

afterEach(cleanup)

function expectWelcomeHeading() {
  const titles = WELCOME_LINES.map(([title]) => title)
  expect(screen.getAllByRole('heading').some((h) => titles.includes(h.textContent ?? ''))).toBe(
    true
  )
}

describe.each(SCENARIOS)('Projects home ($name)', (scenario) => {
  beforeEach(() => {
    applyScenario(scenario)
    state.push.mockReset()
    state.replace.mockReset()
    state.canOwn = true
    state.repositories = { data: undefined, refetch: vi.fn().mockResolvedValue(undefined) }
    state.managed = { data: undefined, refetch: vi.fn().mockResolvedValue(undefined) }
    state.enabled = { repositories: undefined, managed: undefined }
    state.servers = { data: undefined }
    state.scope = null
    state.recent = []
    state.platformIds = []
    setProjectsView('grid')
    state.latest = {}
    state.projects = {
      data: {
        projects: [
          project('p1', 'Shop', 'compose'),
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
          environment('e1', 'Production', 'p1', { isPrimary: true }),
          environment('e2', 'Production', 'p2'),
          environment('e3', 'Elsewhere', 'other'),
        ],
      },
      refetch: vi.fn().mockResolvedValue(undefined),
    }
    state.containers = {
      data: {
        containers: [
          {
            environmentId: 'e1',
            status: 'running',
            containerId: 'c',
            role: 'service',
            composeServiceName: 'web',
          },
        ],
      },
      refetch: vi.fn().mockResolvedValue(undefined),
    }
  })

  it('shows the title, the summary and a tile per project in this scope', () => {
    state.platformIds = ['p3']
    render(<ProjectsHomeSection orgId="o" />)
    expect(screen.getByRole('heading', { name: 'Projects' })).toBeTruthy()
    expect(screen.getByText('2 projects · 2 environments · 1 running')).toBeTruthy()
    expect(screen.getByRole('button', { name: /^Open Shop/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /^Open Orders DB/ })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Open Platform' })).toBeNull()
    expect(screen.getByTestId('workspace-switcher')).toBeTruthy()
  })

  it('shows the type filter with its counts, the workspace filter and the view switch', () => {
    render(<ProjectsHomeSection orgId="o" />)
    const types = screen.getByRole('tablist', { name: 'Project type' })
    expect(Array.from(types.querySelectorAll('[role="tab"]')).map((t) => t.textContent)).toEqual([
      'All 3',
      'Apps 2',
      'Managed databases 1',
    ])
    expect(screen.getByRole('tab', { name: 'All, 3 projects' }).getAttribute('aria-selected')).toBe(
      'true'
    )
    expect(screen.getByRole('radiogroup', { name: 'View' })).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'Managed database settings' })).toBeNull()
  })

  it('lists only managed databases with ?type=managed, with the settings link', () => {
    state.projects = {
      ...state.projects,
      data: {
        projects: [
          project('p1', 'Shop', 'compose'),
          project('p2', 'Orders DB', 'managed'),
          project('p4', 'New DB', 'managed', 'w1', { metadata: { code: 'postgres' } }),
        ],
      },
    }
    render(<ProjectsHomeSection orgId="o" type="managed" />)
    expect(screen.queryByRole('button', { name: /^Open Shop/ })).toBeNull()
    expect(screen.getByRole('button', { name: /^Open Orders DB/ })).toBeTruthy()
    // A database with no environment yet is still listed.
    expect(screen.getByRole('button', { name: /^Open New DB/ }).textContent).toContain(
      'Managed database · PostgreSQL · Acme'
    )
    expect(
      screen
        .getByRole('tab', { name: 'Managed databases, 2 projects' })
        .getAttribute('aria-selected')
    ).toBe('true')
    fireEvent.click(screen.getByRole('link', { name: 'Managed database settings' }))
    expect(state.push).toHaveBeenLastCalledWith('/o/managed/settings')
    fireEvent.click(screen.getByRole('button', { name: 'New project' }))
    expect(state.push).toHaveBeenLastCalledWith('/o/projects/new?type=managed')
  })

  it('lists every other project with ?type=apps', () => {
    render(<ProjectsHomeSection orgId="o" type="apps" />)
    expect(screen.getByRole('button', { name: /^Open Shop/ })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /^Open Orders DB/ })).toBeNull()
    expect(screen.queryByRole('link', { name: 'Managed database settings' })).toBeNull()
  })

  it('changes the type in the address and keeps the workspace', () => {
    render(<ProjectsHomeSection orgId="o" workspaceId="w1" />)
    fireEvent.click(screen.getByRole('tab', { name: /^Managed databases/ }))
    expect(state.replace).toHaveBeenLastCalledWith('/o/projects?workspaceId=w1&type=managed')
    fireEvent.click(screen.getByRole('tab', { name: /^All/ }))
    expect(state.replace).toHaveBeenLastCalledWith('/o/projects?workspaceId=w1')
  })

  it('says so when a type filter leaves nothing', () => {
    state.projects = { ...state.projects, data: { projects: [project('p1', 'Shop', 'compose')] } }
    render(<ProjectsHomeSection orgId="o" type="managed" />)
    expect(screen.getByText('No managed databases here yet.')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Managed database settings' })).toBeTruthy()
  })

  it('says what each project is: repository, Compose, and the managed engine and version', () => {
    state.projects = {
      ...state.projects,
      data: {
        projects: [
          project('p1', 'Shop', 'compose', 'w1', { repositoryId: 'r1' }),
          project('p5', 'Docs', 'compose'),
          project('p2', 'Orders DB', 'managed'),
        ],
      },
    }
    state.repositories = {
      ...state.repositories,
      data: {
        repositories: [{ id: 'r1', repositoryUrl: 'https://github.com/TurboPanel/website.git' }],
      },
    }
    state.managed = {
      ...state.managed,
      data: {
        managed: [
          {
            projectId: 'p2',
            engineDisplayName: 'PostgreSQL',
            options: { settings: { image: 'docker.io/library/postgres:18-alpine' } },
          },
        ],
      },
    }
    render(<ProjectsHomeSection orgId="o" />)
    expect(screen.getByRole('button', { name: /^Open Shop/ }).textContent).toContain(
      'Git repository · TurboPanel/website · Acme'
    )
    expect(screen.getByRole('button', { name: /^Open Docs/ }).textContent).toContain(
      'Compose · Acme'
    )
    expect(screen.getByRole('button', { name: /^Open Orders DB/ }).textContent).toContain(
      'Managed database · PostgreSQL 18 · Acme'
    )
    expect(state.enabled).toEqual({ repositories: true, managed: true })
  })

  it('reads the managed list only for managers and only when a database is listed', () => {
    state.canOwn = false
    render(<ProjectsHomeSection orgId="o" />)
    expect(state.enabled).toEqual({ repositories: false, managed: false })
  })

  it('gives each tile the status of its primary environment and no mood line', () => {
    render(<ProjectsHomeSection orgId="o" />)
    const shop = screen.getByRole('button', {
      name: 'Open Shop. Production (primary): Running',
    })
    expect(shop.textContent).toBe('ShopCompose · AcmeProduction')
  })

  it('gives a managed project the database sub line', () => {
    render(<ProjectsHomeSection orgId="o" />)
    const tile = screen.getByRole('button', { name: /^Open Orders DB/ })
    expect(tile.textContent).toContain('Managed database · Acme')
    expect(screen.getByRole('button', { name: /^Open Shop/ }).textContent).toContain(
      'Compose · Acme'
    )
  })

  it('shows the workspace of each project when every workspace is listed', () => {
    render(<ProjectsHomeSection orgId="o" />)
    expect(screen.getAllByText(/· Acme$/).length).toBeGreaterThan(0)
  })

  it('reads deploys only for Compose projects and never reads configuration per environment', () => {
    state.projects = {
      ...state.projects,
      data: {
        projects: [
          project('p1', 'Shop', 'compose'),
          project('p2', 'Orders DB', 'managed'),
          project('p3', 'Platform', 'system'),
        ],
      },
    }
    state.environments = {
      ...state.environments,
      data: {
        environments: [
          environment('e1', 'Production', 'p1'),
          environment('e2', 'Production', 'p2'),
          environment('e3', 'HTTP Ingress', 'p3'),
          environment('e4', 'HTTP Ingress', 'p3'),
        ],
      },
    }
    render(<ProjectsHomeSection orgId="o" workspaceId="platform" />)
    expect(state.readIds.latest).toEqual(['e1'])
  })

  it('omits the running count until containers arrive', () => {
    state.containers = { data: undefined, refetch: vi.fn() }
    render(<ProjectsHomeSection orgId="o" />)
    expect(screen.getByText('3 projects · 2 environments')).toBeTruthy()
  })

  it('opens a project from its tile', () => {
    render(<ProjectsHomeSection orgId="o" />)
    fireEvent.click(screen.getByRole('button', { name: /^Open Shop/ }))
    expect(state.push).toHaveBeenLastCalledWith('/o/projects/p1')
  })

  it('switches between grid and list and remembers the choice', () => {
    render(<ProjectsHomeSection orgId="o" />)
    expect(screen.queryByText('Environments')).toBeNull()
    fireEvent.click(screen.getByRole('radio', { name: 'List' }))
    expect(screen.getByText('Environments')).toBeTruthy()
    expect(screen.getByRole('radio', { name: 'List' }).getAttribute('aria-checked')).toBe('true')
    expect(getProjectsView()).toBe('list')
    fireEvent.click(screen.getByRole('radio', { name: 'Grid' }))
    expect(screen.queryByText('Environments')).toBeNull()
    expect(getProjectsView()).toBe('grid')
  })

  it('gives the type filter its own row on a phone, above the workspace filter', () => {
    env.width = 390
    render(<ProjectsHomeSection orgId="o" />)
    const types = screen.getByRole('tablist', { name: 'Project type' })
    const filter = screen.getByTestId('workspace-switcher')
    expect(types.compareDocumentPosition(filter) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(styleOf(types.parentElement as HTMLElement).flexBasis).toBe('100%')
  })

  it('hides the list header on a phone', () => {
    env.width = 400
    setProjectsView('list')
    render(<ProjectsHomeSection orgId="o" />)
    expect(screen.queryByText('Environments')).toBeNull()
    expect(screen.getByRole('button', { name: /^Open Shop/ })).toBeTruthy()
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
    expect(Array.from(links).map((link) => link.getAttribute('aria-label'))).toEqual([
      'Orders DB',
      'Shop',
    ])
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

  it('lists at most three deploys in progress and links the rest to Activity', () => {
    const group = (minutes: number) => ({
      id: 'g',
      generation: 1,
      commands: [],
      status: 'running',
      actorEntityType: 'user',
      trigger: null,
      strategy: null,
      strategyOutcome: null,
      startedAt: new Date(Date.now() - minutes * 60_000).toISOString(),
      durationMs: null,
    })
    const ids = ['e1', 'e4', 'e5', 'e6', 'e7']
    state.environments = {
      ...state.environments,
      data: {
        environments: [
          environment('e1', 'Production', 'p1', { isPrimary: true }),
          environment('e4', 'Staging', 'p1'),
          environment('e5', 'Preview', 'p1'),
          environment('e6', 'Review', 'p1'),
          environment('e7', 'Demo', 'p1'),
        ],
      },
    }
    state.latest = Object.fromEntries(ids.map((id, index) => [id, group(index + 1)]))
    render(<ProjectsHomeSection orgId="o" />)
    expect(screen.getAllByRole('button', { name: /^Shop · / })).toHaveLength(3)
    fireEvent.click(screen.getByRole('button', { name: 'View 2 more in Activity' }))
    expect(state.push).toHaveBeenLastCalledWith('/o/activity')
  })

  it('shows no more-link when three or fewer deploys are running', () => {
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
        startedAt: new Date().toISOString(),
        durationMs: null,
      },
    }
    render(<ProjectsHomeSection orgId="o" />)
    expect(screen.queryByText(/more in Activity/)).toBeNull()
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

  it('welcomes an organization with no projects: Add Server leads while there are no servers', () => {
    state.projects = { data: { projects: [] }, isLoading: false, error: null, refetch: vi.fn() }
    state.servers = { data: { servers: [] } }
    render(<ProjectsHomeSection orgId="o" />)
    expectWelcomeHeading()
    expect(screen.getByText(/No servers are connected yet\./)).toBeTruthy()
    // The header carries no New project button; the card does.
    expect(screen.queryByRole('button', { name: 'New project' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'New Project' }))
    expect(state.push).toHaveBeenLastCalledWith(expect.stringContaining('/o/projects/new'))
    fireEvent.click(screen.getByRole('button', { name: 'Add Server' }))
    expect(state.push).toHaveBeenLastCalledWith('/o/servers')
  })

  it('welcome shows the real server count, plural-aware', () => {
    state.projects = { data: { projects: [] }, isLoading: false, error: null, refetch: vi.fn() }
    state.servers = { data: { servers: [{ id: 's1' }] } }
    const { unmount } = render(<ProjectsHomeSection orgId="o" />)
    expect(screen.getByText('1 server connected')).toBeTruthy()
    unmount()
    state.servers = { data: { servers: [{ id: 's1' }, { id: 's2' }] } }
    render(<ProjectsHomeSection orgId="o" />)
    expect(screen.getByText('2 servers connected')).toBeTruthy()
  })

  it('welcome offers no buttons to non-owners and does not read servers', () => {
    state.canOwn = false
    state.projects = { data: { projects: [] }, isLoading: false, error: null, refetch: vi.fn() }
    render(<ProjectsHomeSection orgId="o" />)
    expectWelcomeHeading()
    expect(screen.queryByRole('button', { name: 'New Project' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Add Server' })).toBeNull()
    expect(state.serversEnabled).toBe(false)
  })

  const isPrimary = (name: string) =>
    styleOf(screen.getByRole('button', { name })).borderColor === 'transparent'

  it('welcome buttons are both secondary while the server count is unknown, then one leads', () => {
    state.projects = { data: { projects: [] }, isLoading: false, error: null, refetch: vi.fn() }
    state.servers = { data: undefined }
    const view = render(<ProjectsHomeSection orgId="o" />)
    expect(isPrimary('Add Server')).toBe(false)
    expect(isPrimary('New Project')).toBe(false)
    state.servers = { data: { servers: [] } }
    view.rerender(<ProjectsHomeSection orgId="o" />)
    expect(isPrimary('Add Server')).toBe(true)
    expect(isPrimary('New Project')).toBe(false)
    state.servers = { data: { servers: [{ id: 's1' }] } }
    view.rerender(<ProjectsHomeSection orgId="o" />)
    expect(isPrimary('Add Server')).toBe(false)
    expect(isPrimary('New Project')).toBe(true)
  })

  it('welcome buttons stay both secondary when the servers query failed', () => {
    state.projects = { data: { projects: [] }, isLoading: false, error: null, refetch: vi.fn() }
    state.servers = { data: undefined, error: new Error('down') }
    render(<ProjectsHomeSection orgId="o" />)
    expect(isPrimary('Add Server')).toBe(false)
    expect(isPrimary('New Project')).toBe(false)
  })

  it('welcome headline stays the same across re-renders', () => {
    state.projects = { data: { projects: [] }, isLoading: false, error: null, refetch: vi.fn() }
    state.servers = { data: undefined }
    const view = render(<ProjectsHomeSection orgId="o" />)
    const titles = WELCOME_LINES.map(([title]) => title)
    const read = () =>
      screen
        .getAllByRole('heading')
        .map((h) => h.textContent ?? '')
        .find((x) => titles.includes(x))
    const first = read()
    expect(first).toBeTruthy()
    state.servers = { data: { servers: [{ id: 's1' }] } }
    view.rerender(<ProjectsHomeSection orgId="o" />)
    view.rerender(<ProjectsHomeSection orgId="o" />)
    expect(read()).toBe(first)
  })

  it('keeps the header New project button when the projects load failed', () => {
    state.projects = {
      data: undefined,
      isLoading: false,
      error: new Error('Network down'),
      refetch: vi.fn(),
    }
    state.servers = { data: undefined }
    render(<ProjectsHomeSection orgId="o" />)
    expect(screen.getByRole('button', { name: 'New project' })).toBeTruthy()
  })

  it('shows the reason when projects cannot be loaded', () => {
    state.projects = {
      data: undefined,
      isLoading: false,
      error: new Error('Network down'),
      refetch: vi.fn(),
    }
    render(<ProjectsHomeSection orgId="o" />)
    expect(screen.getByText('Could not load projects')).toBeTruthy()
  })

  it('shows the reason when workspaces cannot be loaded', () => {
    state.workspaces = {
      data: undefined,
      isLoading: false,
      error: new Error('No workspaces'),
      refetch: vi.fn(),
    }
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
    expect(screen.getByRole('button', { name: 'Open Platform' })).toBeTruthy()
    expect(screen.queryByText(/· Acme$/)).toBeNull()
    expect(screen.queryByRole('button', { name: 'New project' })).toBeNull()
  })

  it('the platform workspace with no projects shows the welcome with no buttons', () => {
    state.scope = {
      scopeId: 'platform',
      workspaces: [{ id: 'platform', name: 'TurboPanel' }],
      scope: { label: 'TurboPanel', workspace: { id: 'platform', name: 'TurboPanel' } },
      refreshWorkspaces: vi.fn(),
    }
    state.projects = { data: { projects: [] }, isLoading: false, error: null, refetch: vi.fn() }
    render(<ProjectsHomeSection orgId="o" workspaceId="platform" />)
    expectWelcomeHeading()
    expect(screen.queryByRole('button')).toBeNull()
    expect(state.serversEnabled).toBe(false)
  })
})
