// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BaseTabBody, ProjectBaseTab } from '@/components/org/project/base-tab/base-tab'
import { applyScenario, SCENARIOS } from '@/components/ui/v4/rn-stub'
import { configView, row, viewService } from '@/lib/v4/environment-overview.fixtures'
import type { BaseEnvironment } from '@/lib/v4/project-base'
import { baseEnvironmentRows } from '@/lib/v4/project-base'

const push = vi.hoisted(() => vi.fn())
const model = vi.hoisted(() => ({ current: { state: 'loading' } as Record<string, unknown> }))

vi.mock('react-native', async () => (await import('@/components/ui/v4/rn-stub')).reactNativeStub)
vi.mock('react-native-svg', async () => (await import('@/components/ui/v4/rn-stub')).svgStub)
vi.mock('@/lib/theme-preference', async () => (await import('@/components/ui/v4/rn-stub')).themePreferenceStub)
vi.mock('expo-router', () => ({
  Link: ({ children }: Readonly<{ href: string; children: ReactNode }>) => <>{children}</>,
  useRouter: () => ({ push }),
}))
vi.mock('@/components/org/project/project-context', () => ({
  useProjectContext: () => ({ orgId: 'o', projectId: 'p' }),
}))
vi.mock('@/components/org/project/base-tab/use-base-tab', () => ({ useBaseTabModel: () => model.current }))
vi.mock('@/components/org/project/project-overview-tab', () => ({
  ProjectOverviewTab: () => <div data-testid="old-screen" />,
}))

afterEach(cleanup)
beforeEach(() => push.mockClear())

const view = configView({
  environmentId: 'e1',
  changes: [],
  base: {
    services: [
      viewService('web', 'node', [row('web', 'linuxUser', 'website')]),
      viewService('redis', 'container', [row('redis', 'image', 'redis:8')]),
    ],
    variables: [
      { key: 'var:API_URL', name: 'API_URL', variableId: 'v1', value: 'https://x', isSecret: false, forBuild: false, forRuntime: true, source: 'project' },
      { key: 'var:TOKEN', name: 'TOKEN', variableId: 'v2', value: null, isSecret: true, forBuild: false, forRuntime: true, source: 'project' },
    ],
    linuxUsers: [{ name: 'website', access: 'sftp', description: null, source: 'base', usedBy: ['web'] }],
  },
  effective: {
    services: [viewService('web', 'node', [row('web', 'linuxUser', 'website')])],
    variables: [],
    linuxUsers: [],
  },
})
const stagingView = configView({ environmentId: 'e2' })
const environments: BaseEnvironment[] = [
  { id: 'e1', name: 'Production', view },
  { id: 'e2', name: 'Staging', view: stagingView },
  { id: 'e3', name: 'Preview', view: configView({ environmentId: 'e3', followsBase: false, changes: [] }) },
]

function ready(extra: Record<string, unknown> = {}) {
  return {
    state: 'ready',
    base: view.base,
    view,
    environments,
    rows: baseEnvironmentRows(environments),
    principals: [],
    ...extra,
  }
}

describe('ProjectBaseTab states', () => {
  it('waits with a spinner while the data loads', () => {
    model.current = { state: 'loading' }
    render(<ProjectBaseTab />)
    expect(screen.getByRole('progressbar')).toBeTruthy()
  })

  it('keeps the old screen when no configuration can be read', () => {
    model.current = { state: 'unavailable' }
    render(<ProjectBaseTab />)
    expect(screen.getByTestId('old-screen')).toBeTruthy()
  })

  it('says a project with no environment has no Base to show yet', () => {
    model.current = { state: 'empty' }
    render(<ProjectBaseTab />)
    expect(screen.getByText('No environments yet')).toBeTruthy()
  })
})

describe.each(SCENARIOS)('Base tab ($name)', (scenario) => {
  beforeEach(() => applyScenario(scenario))

  it('shows the map, the services, the variables, the Linux users and the environments', () => {
    model.current = ready()
    render(<ProjectBaseTab />)
    expect(screen.getByRole('heading', { name: 'Base map' })).toBeTruthy()
    expect(screen.getByRole('group', { name: /^Map of the Base/ })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Services in the Base' })).toBeTruthy()
    expect(screen.getByText('Node.js app')).toBeTruthy()
    expect(screen.getByText('Data store · redis:8')).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Project variables' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Linux users' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Environments built from this Base' })).toBeTruthy()
  })

  it('shows a variable value but never a secret', () => {
    model.current = ready()
    render(<ProjectBaseTab />)
    expect(screen.getByText('https://x')).toBeTruthy()
    expect(screen.getByText('••••••••')).toBeTruthy()
    expect(screen.getByLabelText('TOKEN, secret, Run only')).toBeTruthy()
  })

  it('says which apps run as each Linux user', () => {
    model.current = ready()
    render(<ProjectBaseTab />)
    expect(screen.getByText(/SFTP on · No SSH keys/)).toBeTruthy()
    expect(screen.getByText(/web in Production/)).toBeTruthy()
  })
})

describe('environments built from this Base', () => {
  it('says how each one relates to the Base and offers its changes', () => {
    model.current = ready()
    render(<ProjectBaseTab />)
    expect(screen.getByText('Production and Staging follow it · Preview stands alone')).toBeTruthy()
    expect(screen.getByText('Follows the Base · 4 changes')).toBeTruthy()
    expect(screen.getByText('Stands alone')).toBeTruthy()
    expect(screen.getAllByRole('link', { name: /^See / })).toHaveLength(1)
    expect(screen.getAllByRole('link', { name: /^Open / })).toHaveLength(3)
  })

  it('opens an environment, and its changes on the Configuration tab', () => {
    model.current = ready()
    render(<ProjectBaseTab />)
    fireEvent.click(screen.getByRole('link', { name: "See Staging's changes" }))
    expect(push).toHaveBeenCalledWith('/o/projects/p/environments/e2/configuration')
    fireEvent.click(screen.getByRole('link', { name: 'Open Preview' }))
    expect(push).toHaveBeenCalledWith('/o/projects/p/environments/e3')
  })

  it('names an environment whose configuration is not known without a claim', () => {
    const list: BaseEnvironment[] = [...environments, { id: 'e4', name: 'Testing', view: undefined }]
    render(
      <BaseTabBody
        orgId="o"
        projectId="p"
        base={view.base}
        view={view}
        environments={list}
        rows={baseEnvironmentRows(list)}
        principals={undefined}
      />,
    )
    expect(screen.getByRole('link', { name: 'Open Testing' })).toBeTruthy()
    expect(screen.getByLabelText('Testing')).toBeTruthy()
  })
})

describe('Linux users of an environment that could not be read', () => {
  it('names no claim about who uses a user, rather than saying nobody does', () => {
    const list: BaseEnvironment[] = [{ id: 'e4', name: 'Testing', view: undefined }]
    render(
      <BaseTabBody
        orgId="o"
        projectId="p"
        base={view.base}
        view={view}
        environments={list}
        rows={baseEnvironmentRows(list)}
        principals={[]}
      />,
    )
    expect(screen.queryByText(/No app runs as this user yet/)).toBeNull()
    expect(screen.getByText(/web in the Base/)).toBeTruthy()
  })
})

describe('empty Base sections', () => {
  it('says so when the Base holds no services, variables or Linux users', () => {
    const bare = configView({ base: { services: [], variables: [], linuxUsers: [] }, effective: { services: [], variables: [], linuxUsers: [] }, changes: [] })
    render(
      <BaseTabBody
        orgId="o"
        projectId="p"
        base={bare.base}
        view={bare}
        environments={[{ id: 'e1', name: 'Production', view: bare }]}
        rows={baseEnvironmentRows([{ id: 'e1', name: 'Production', view: bare }])}
        principals={[]}
      />,
    )
    expect(screen.getByText('No services in the Base')).toBeTruthy()
    expect(screen.getByText('No project variables')).toBeTruthy()
    expect(screen.getByText('No Linux users yet')).toBeTruthy()
  })
})

describe('the Compose files link', () => {
  it('opens the Compose file editor, for experts', () => {
    model.current = ready()
    render(<ProjectBaseTab />)
    const link = screen.getByRole('link', { name: 'As Compose files (for experts)' })
    fireEvent.click(link)
    expect(push).toHaveBeenCalledWith('/o/projects/p/base/compose')
    expect(within(link).getByText('As Compose files')).toBeTruthy()
  })
})
