// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { applyScenario, SCENARIOS, styleOf, token } from '@/components/ui/v4/rn-stub'
import { plainView, stagingView } from '@/lib/v4/config-view-model.fixtures'
import {
  EnvironmentConfigurationScreen,
  EnvironmentConfigurationView,
} from './environment-configuration'
import { buildConfigViewModel } from '@/lib/v4/config-view-model'

const state = vi.hoisted(() => ({
  ctx: {} as Record<string, unknown>,
  query: {} as Record<string, unknown>,
  hostingsByService: {} as Record<string, unknown[]>,
  hostingsLoading: false,
  hostingsError: false,
  push: vi.fn(),
  openURL: vi.fn(() => Promise.resolve()),
}))

vi.mock('react-native', async () => ({
  ...(await import('@/components/ui/v4/rn-stub')).reactNativeStub,
  Linking: { openURL: state.openURL },
}))
vi.mock('react-native-svg', async () => (await import('@/components/ui/v4/rn-stub')).svgStub)
vi.mock(
  '@/lib/theme-preference',
  async () => (await import('@/components/ui/v4/rn-stub')).themePreferenceStub
)
vi.mock('expo-router', () => ({ useRouter: () => ({ push: state.push }) }))
vi.mock('@/components/org/project/project-context', () => ({
  useProjectContext: () => state.ctx,
}))
vi.mock('@/lib/queries/environments', () => ({
  useEnvironmentConfigView: () => state.query,
}))
vi.mock('@/lib/queries/services', () => ({
  useHostingsByServices: () => ({
    hostingsByService: state.hostingsByService,
    isLoading: state.hostingsLoading,
    hasError: state.hostingsError,
  }),
}))
vi.mock('@/lib/queries/variables', () => ({
  useVariables: () => ({ data: { variables: [] } }),
}))
vi.mock('@/lib/queries/configuration', () => ({
  useSaveConfiguration: () => ({ run: vi.fn(), isPending: false, actionError: null }),
}))
vi.mock('@/components/ui', () => ({
  LoadingState: ({ label }: Readonly<{ label: string }>) => <div role="progressbar">{label}</div>,
}))

const model = () => buildConfigViewModel({ envName: 'Staging', view: stagingView() })

function renderView(overrides: Partial<Parameters<typeof EnvironmentConfigurationView>[0]> = {}) {
  const handlers = {
    onOpenApp: vi.fn(),
    onOpenUrl: vi.fn(),
    onManageHosting: vi.fn(),
    onOpenBase: vi.fn(),
  }
  render(<EnvironmentConfigurationView model={model()} multiple {...handlers} {...overrides} />)
  return handlers
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe.each(SCENARIOS)('EnvironmentConfigurationView ($name)', (scenario) => {
  beforeEach(() => applyScenario(scenario))

  it('lists the sections in order with a source tag on every row', () => {
    renderView()
    const headings = screen.getAllByRole('heading').map((node) => node.textContent)
    expect(headings).toEqual(['Apps', 'Hosting', 'Variables', 'Hosting Accounts', 'Data'])
    expect(
      screen.getByText(/^Staging uses the Base for anything it does not set itself\./)
    ).toBeTruthy()
    const web = screen.getByLabelText(/^web, Node.js app, Staging changes/)
    expect(within(web).getByText('Staging change')).toBeTruthy()
    const api = screen.getByLabelText(/^api, Container/)
    expect(within(api).getByText('From the Base')).toBeTruthy()
    expect(screen.queryByText('Project')).toBeNull()
  })

  it('marks inherited rows "From the Base" and leaves environment-set rows unmarked', () => {
    renderView()
    const api = screen.getByLabelText(/^api, Container/)
    expect(within(api).getByText('From the Base')).toBeTruthy()
    const web = screen.getByLabelText(/^web, Node.js app/)
    expect(within(web).queryByText('From the Base')).toBeNull()
    expect(screen.getAllByText('From the Base').length).toBeGreaterThan(0)
  })

  it('paints a change tag in the Base colour and says who runs each app', () => {
    renderView()
    const web = screen.getByLabelText(/^web, Node.js app/)
    const tag = within(web).getByText('Staging change')
    expect(styleOf(tag).color).toBe(token(scenario, 'base'))
    expect(screen.getAllByLabelText('Runs as staging-web').length).toBeGreaterThan(0)
    expect(screen.getByLabelText('Runs inside its container')).toBeTruthy()
  })

  it('masks secrets and shows the other values', () => {
    renderView()
    const secret = screen.getByLabelText(/^SECRET_KEY, secret/)
    expect(within(secret).getByText('••••••••')).toBeTruthy()
    expect(screen.getByText('https://api.staging.example.com')).toBeTruthy()
    expect(
      screen.getByText(
        'Build and run · '.slice(0, 0) +
          'Run only · Base: https://api.example.com · Staging: https://api.staging.example.com'
      )
    ).toBeTruthy()
  })

  it('opens an app, a domain and the domain manager', () => {
    const handlers = renderView()
    fireEvent.click(screen.getByLabelText(/^web, Node.js app/))
    expect(handlers.onOpenApp).toHaveBeenCalledWith('id-web')
    fireEvent.click(screen.getByLabelText('Open shop.example.com in a new tab'))
    expect(handlers.onOpenUrl).toHaveBeenCalledWith('https://shop.example.com')
    fireEvent.click(screen.getByLabelText('Add or change hostnames'))
    expect(handlers.onManageHosting).toHaveBeenCalled()
  })

  it('swaps to one row per change with the filter switch, and back', () => {
    renderView()
    const filter = screen.getByRole('switch', { name: 'Only changes from Base (4)' })
    expect(filter.getAttribute('aria-checked')).toBe('false')
    fireEvent.click(filter)
    expect(screen.getByRole('switch').getAttribute('aria-checked')).toBe('true')
    expect(screen.queryByText('Apps')).toBeNull()
    const row = screen.getByLabelText('Start command: npm start to npm run staging')
    expect(within(row).getByText('Staging change')).toBeTruthy()
    expect(within(row).getByText('App web')).toBeTruthy()
    expect(screen.getByLabelText('worker: Not set to node')).toBeTruthy()
    fireEvent.click(screen.getByRole('switch'))
    expect(screen.getByText('Apps')).toBeTruthy()
  })

  it('says there are no changes and offers Show everything', () => {
    renderView({ model: buildConfigViewModel({ envName: 'Staging', view: plainView() }) })
    fireEvent.click(screen.getByRole('switch'))
    expect(screen.getByText('No changes from the Base')).toBeTruthy()
    expect(screen.getByText('Staging runs exactly what the Base says.')).toBeTruthy()
    fireEvent.click(screen.getByLabelText('Show everything'))
    expect(screen.getByText('Apps')).toBeTruthy()
  })

  it('shows the first five rows and then all of them', () => {
    const view = stagingView()
    view.effective.variables = Array.from({ length: 8 }, (_, index) => ({
      ...view.effective.variables[0],
      key: `var:V${index}`,
      name: `V${index}`,
    }))
    renderView({ model: buildConfigViewModel({ envName: 'Staging', view }) })
    expect(screen.queryByText('V5')).toBeNull()
    fireEvent.click(screen.getByLabelText('Show all 8'))
    expect(screen.getByText('V7')).toBeTruthy()
    expect(screen.queryByLabelText('Show all 8')).toBeNull()
  })

  it('has empty states for hostnames and variables', () => {
    const view = plainView()
    view.effective = { ...view.effective, services: [], variables: [] }
    renderView({ model: buildConfigViewModel({ envName: 'Staging', view }) })
    expect(screen.getByText('No hostnames yet')).toBeTruthy()
    expect(screen.getByText('No variables')).toBeTruthy()
    expect(screen.queryByText('Apps')).toBeNull()
    expect(screen.queryByText('Hosting Accounts')).toBeNull()
    expect(screen.queryByText('Data')).toBeNull()
  })

  it('says a stand-alone environment keeps its own settings', () => {
    const standalone = { ...model(), standsAlone: true }
    renderView({ model: standalone })
    expect(
      screen.getByText("Staging stands alone: it keeps its own apps and does not use the Base's.")
    ).toBeTruthy()
    expect(screen.queryByText(/anything it does not set itself/)).toBeNull()
  })

  it('keeps the lede and the Open the Base button in a single-environment project, with no filter', () => {
    const handlers = renderView({ multiple: false })
    expect(
      screen.getByText(/^Staging uses the Base for anything it does not set itself\./)
    ).toBeTruthy()
    expect(screen.queryByText('This project has one environment')).toBeNull()
    expect(screen.queryByRole('switch')).toBeNull()
    fireEvent.click(screen.getByLabelText('Open the Base'))
    expect(handlers.onOpenBase).toHaveBeenCalled()
  })

  it('does not make an app without a saved row a link', () => {
    const view = stagingView()
    view.effective.services[1] = { ...view.effective.services[1], serviceId: null }
    renderView({ model: buildConfigViewModel({ envName: 'Staging', view }) })
    expect(screen.getByLabelText(/^worker, Node.js app/).tagName).not.toBe('BUTTON')
  })
})

describe('EnvironmentConfigurationScreen', () => {
  beforeEach(() => {
    applyScenario(SCENARIOS[0])
    state.ctx = {
      orgId: 'o',
      projectId: 'p',
      environments: [
        { id: 'e', name: 'Staging' },
        { id: 'e2', name: 'Production' },
      ],
      selectedEnvironment: null,
      pathEnvironmentId: 'e',
    }
    state.query = { isPending: false, error: null, data: stagingView(), refetch: vi.fn() }
    state.hostingsByService = {}
    state.hostingsLoading = false
    state.hostingsError = false
  })

  it('shows a loading state, then the sections', () => {
    state.query = { isPending: true, error: null, data: undefined, refetch: vi.fn() }
    render(<EnvironmentConfigurationScreen />)
    expect(screen.getByText('Loading configuration…')).toBeTruthy()
    cleanup()
    state.query = { isPending: false, error: null, data: stagingView(), refetch: vi.fn() }
    render(<EnvironmentConfigurationScreen />)
    expect(screen.getByText('Apps')).toBeTruthy()
  })

  it('says it could not load and offers Try again', () => {
    const refetch = vi.fn()
    state.query = { isPending: false, error: new Error('Boom'), data: undefined, refetch }
    render(<EnvironmentConfigurationScreen />)
    expect(screen.getByText('Could not load this configuration')).toBeTruthy()
    expect(screen.getByText('Boom')).toBeTruthy()
    fireEvent.click(screen.getByLabelText('Try again'))
    expect(refetch).toHaveBeenCalled()
  })

  it('uses a plain message for a non-Error failure', () => {
    state.query = { isPending: false, error: 'x', data: undefined, refetch: vi.fn() }
    render(<EnvironmentConfigurationScreen />)
    expect(screen.getByText('Try again in a moment.')).toBeTruthy()
  })

  it('opens the service page, the domain manager and external domains', () => {
    render(<EnvironmentConfigurationScreen />)
    fireEvent.click(screen.getByLabelText(/^web, Node.js app/))
    expect(state.push).toHaveBeenLastCalledWith('/o/projects/p/services/id-web')
    fireEvent.click(screen.getByLabelText('Add or change hostnames'))
    expect(state.push).toHaveBeenLastCalledWith(
      '/o/projects/p/environments/e/configuration/hosting'
    )
    fireEvent.click(screen.getByLabelText('Open shop.example.com in a new tab'))
    expect(state.openURL).toHaveBeenCalledWith('https://shop.example.com')
  })

  it('lists a hostname that was added on the Hosting screen and not in compose', () => {
    const view = plainView()
    view.effective.services = view.effective.services.map((service) => ({
      ...service,
      rows: service.rows.filter((row) => row.area !== 'domain'),
    }))
    state.query = { isPending: false, error: null, data: view, refetch: vi.fn() }
    state.hostingsByService = {
      'id-web': [
        {
          id: 'h1',
          name: null,
          description: null,
          serviceId: 'id-web',
          options: { hostnames: ['app.example.com'] },
          createdAt: '2026-10-19T00:00:00Z',
          updatedAt: '2026-10-19T00:00:00Z',
        },
      ],
    }
    render(<EnvironmentConfigurationScreen />)
    expect(screen.getByText('app.example.com')).toBeTruthy()
    expect(screen.getByText('1 hostname')).toBeTruthy()
    expect(screen.queryByText('No hostnames yet')).toBeNull()
  })

  function viewWithoutHostnames() {
    const view = plainView()
    view.effective.services = view.effective.services.map((service) => ({
      ...service,
      rows: service.rows.filter((row) => row.area !== 'domain'),
    }))
    return view
  }

  it('does not say there are no hostnames while the Hosting screen ones are still loading', () => {
    state.query = { isPending: false, error: null, data: viewWithoutHostnames(), refetch: vi.fn() }
    state.hostingsLoading = true
    render(<EnvironmentConfigurationScreen />)
    expect(screen.getByText('Checking hostnames…')).toBeTruthy()
    expect(screen.queryByText('No hostnames yet')).toBeNull()
  })

  it('says so when the hostnames added on the Hosting screen could not be checked', () => {
    state.query = { isPending: false, error: null, data: viewWithoutHostnames(), refetch: vi.fn() }
    state.hostingsError = true
    render(<EnvironmentConfigurationScreen />)
    expect(
      screen.getByText(/Could not check the hostnames added on the Hosting screen/)
    ).toBeTruthy()
  })

  it('keeps the compose hostnames visible while the others load', () => {
    state.hostingsLoading = true
    render(<EnvironmentConfigurationScreen />)
    expect(screen.getByText('shop.example.com')).toBeTruthy()
    expect(screen.queryByText('Checking hostnames…')).toBeNull()
  })

  it('opens the Base from a single-environment project and falls back to the selected environment', () => {
    state.ctx = {
      orgId: 'o',
      projectId: 'p',
      environments: [{ id: 'e', name: null }],
      selectedEnvironment: { id: 'e' },
      pathEnvironmentId: null,
    }
    render(<EnvironmentConfigurationScreen />)
    fireEvent.click(screen.getByLabelText('Open the Base'))
    expect(state.push).toHaveBeenLastCalledWith('/o/projects/p/base')
  })

  it('survives a blocked external link', async () => {
    state.openURL.mockRejectedValueOnce(new Error('blocked'))
    render(<EnvironmentConfigurationScreen />)
    fireEvent.click(screen.getByLabelText('Open shop.example.com in a new tab'))
    await Promise.resolve()
    expect(screen.getByText('Apps')).toBeTruthy()
  })
})
