// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { applyScenario, SCENARIOS } from '@/components/ui/v4/rn-stub'
import type { ConfigViewSide, EnvironmentConfigViewResponse } from '@/lib/instance-api'
import { ProjectEnvironmentsTab } from './project-environments-tab'

const state = vi.hoisted(() => ({
  push: vi.fn(),
  ctx: {} as Record<string, unknown>,
  containersLoading: false,
  containersByEnv: {} as Record<string, unknown[]>,
  views: {} as Record<string, unknown>,
  latest: {} as Record<string, unknown>,
  servers: undefined as unknown[] | undefined,
  sheet: undefined as Record<string, unknown> | undefined,
  invalidate: vi.fn(),
}))

vi.mock('react-native', async () => (await import('@/components/ui/v4/rn-stub')).reactNativeStub)
vi.mock('react-native-svg', async () => (await import('@/components/ui/v4/rn-stub')).svgStub)
vi.mock('@/lib/theme-preference', async () => (await import('@/components/ui/v4/rn-stub')).themePreferenceStub)
vi.mock('expo-router', () => ({ useRouter: () => ({ push: state.push }) }))
vi.mock('@/components/org/project/project-context', () => ({ useProjectContext: () => state.ctx }))
vi.mock('@/lib/queries/containers', () => ({
  useContainersByProject: () => ({
    isLoading: state.containersLoading,
    containersByEnv: state.containersByEnv,
  }),
}))
vi.mock('@/lib/queries/environment-cards', () => ({
  useEnvironmentConfigViews: () => ({ views: state.views, isLoading: false }),
  useLatestDeployments: () => ({ latest: state.latest }),
}))
vi.mock('@/lib/queries/servers', () => ({
  useOrgServers: () => ({ data: state.servers ? { servers: state.servers } : undefined }),
}))
vi.mock('@/components/org/project/new-environment-sheet', () => ({
  NewEnvironmentSheet: (props: Record<string, unknown>) => {
    state.sheet = props
    return (
      <div role="dialog" aria-label="New environment sheet">
        <button type="button" onClick={() => (props.onCreated as (id: string) => void)('new-env')}>
          finish
        </button>
        <button type="button" onClick={props.onClose as () => void}>
          close
        </button>
      </div>
    )
  },
}))

const BASE: ConfigViewSide = {
  services: [
    {
      name: 'web',
      serviceId: null,
      kind: 'node',
      source: 'base',
      rows: [
        { key: 'a', area: 'domain', field: 'domain:shop.example.com', label: 'Domain', value: 'shop.example.com', masked: false, source: 'base' },
        { key: 'b', area: 'service', field: 'panel.source.branch', label: 'Branch', value: 'main', masked: false, source: 'base' },
      ],
    },
  ],
  variables: [],
  linuxUsers: [{ name: 'shop', access: 'sftp', description: null, source: 'base', usedBy: ['web'] }],
}

function view(followsBase: boolean, changes: number): EnvironmentConfigViewResponse {
  return {
    ok: true,
    environmentId: 'e',
    projectId: 'p',
    followsBase,
    base: BASE,
    effective: BASE,
    changes: Array.from({ length: changes }, (_, index) => ({
      key: `svc:web:c${index}`,
      area: 'service' as const,
      label: 'x',
      field: 'c',
      serviceName: 'web',
      serviceId: null,
      kind: 'changed' as const,
      baseValue: 'a',
      baseSource: 'base' as const,
      envValue: 'b',
      envSource: 'environment' as const,
      masked: false,
    })),
  }
}

function environment(id: string, name: string, serverId: string | null = null) {
  return { id, name, projectId: 'p', serverId }
}

afterEach(cleanup)

describe.each(SCENARIOS)('project Environments tab ($name)', (scenario) => {
  beforeEach(() => {
    applyScenario(scenario)
    state.push.mockReset()
    state.invalidate.mockReset()
    state.invalidate.mockResolvedValue(undefined)
    state.sheet = undefined
    state.containersLoading = false
    state.containersByEnv = {
      e1: [{ status: 'running', containerId: 'c', role: 'service', composeServiceName: 'web' }],
      e2: [],
    }
    state.views = { e1: view(true, 0), e2: view(true, 2), e3: view(false, 0) }
    state.latest = {}
    state.servers = [{ id: 's1', name: 'Frankfurt 1', hostname: null }]
    state.ctx = {
      orgId: 'o',
      projectId: 'p',
      project: { id: 'p', options: { defaultServerId: 's1' } },
      environments: [environment('e1', 'Production'), environment('e2', 'Staging'), environment('e3', 'Preview', 's1')],
      loading: false,
      canManage: true,
      projectAllowsMutations: true,
      invalidateEnvironments: state.invalidate,
    }
  })

  it('draws the Base band and a card per environment', () => {
    render(<ProjectEnvironmentsTab />)
    const band = screen.getByRole('button', { name: /^Base, 1 service · 1 Linux user$/ })
    expect(band.textContent).toContain('Production and Staging follow it · Preview stands alone')
    expect(screen.getByRole('heading', { name: 'Production' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Staging' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Preview' })).toBeTruthy()
    expect(screen.getByLabelText('Follows the Base')).toBeTruthy()
    expect(screen.getByLabelText('Follows the Base · 2 changes')).toBeTruthy()
    expect(screen.getByLabelText('Stands alone')).toBeTruthy()
  })

  it("shows each environment's running word from its containers", () => {
    render(<ProjectEnvironmentsTab />)
    const statuses = screen.getAllByRole('group', { name: 'Status' })
    expect(statuses[0]?.textContent).toContain('Running')
    expect(statuses[1]?.textContent).toContain('Not deployed yet')
  })

  it('says Checking while the containers load', () => {
    state.containersLoading = true
    render(<ProjectEnvironmentsTab />)
    expect(screen.getAllByRole('group', { name: 'Status' })[0]?.textContent).toContain('Checking…')
  })

  it('names the server in words', () => {
    render(<ProjectEnvironmentsTab />)
    expect(screen.getByText('Frankfurt 1')).toBeTruthy()
    expect(screen.getAllByText("Frankfurt 1 (the project's server)").length).toBe(2)
  })

  it('goes quiet about what the control plane has not answered', () => {
    state.views = {}
    render(<ProjectEnvironmentsTab />)
    expect(screen.queryByLabelText(/Follows the Base/)).toBeNull()
    expect(screen.queryByLabelText('Stands alone')).toBeNull()
    expect(screen.getByRole('button', { name: 'Base' })).toBeTruthy()
  })

  it('opens the Base tab and an environment', () => {
    render(<ProjectEnvironmentsTab />)
    fireEvent.click(screen.getByRole('button', { name: /^Base, / }))
    expect(state.push).toHaveBeenLastCalledWith('/o/projects/p/base')
    fireEvent.click(screen.getByRole('button', { name: 'Open Staging' }))
    expect(state.push).toHaveBeenLastCalledWith('/o/projects/p/environments/e2')
  })

  it('opens the New environment sheet from the header, then opens what was created', async () => {
    render(<ProjectEnvironmentsTab />)
    expect(screen.queryByRole('dialog')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'New environment' }))
    expect(screen.getByRole('dialog', { name: 'New environment sheet' })).toBeTruthy()
    expect(state.sheet).toMatchObject({ orgId: 'o', projectId: 'p', hasProjectServer: true })
    expect((state.sheet?.base as ConfigViewSide).services).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: 'finish' }))
    await waitFor(() => expect(state.push).toHaveBeenCalledWith('/o/projects/p/environments/new-env'))
    expect(state.invalidate).toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('closes the sheet again', () => {
    render(<ProjectEnvironmentsTab />)
    fireEvent.click(screen.getByRole('button', { name: 'New environment' }))
    fireEvent.click(screen.getByRole('button', { name: 'close' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('offers no way to add one without permission', () => {
    state.ctx = { ...state.ctx, canManage: false }
    render(<ProjectEnvironmentsTab />)
    expect(screen.queryByRole('button', { name: 'New environment' })).toBeNull()
  })

  it('nudges a one-environment project towards a second', () => {
    state.ctx = { ...state.ctx, environments: [environment('e1', 'Production')] }
    render(<ProjectEnvironmentsTab />)
    expect(screen.getByText('This project has one environment')).toBeTruthy()
    expect(screen.getAllByRole('button', { name: 'New environment' })).toHaveLength(2)
  })

  it('does not nudge someone who cannot add one', () => {
    state.ctx = { ...state.ctx, environments: [environment('e1', 'Production')], canManage: false }
    render(<ProjectEnvironmentsTab />)
    expect(screen.queryByText('This project has one environment')).toBeNull()
  })

  it('says it is loading, then says there are none', () => {
    state.ctx = { ...state.ctx, environments: [], loading: true }
    const { unmount } = render(<ProjectEnvironmentsTab />)
    expect(screen.getByText('Loading environments…')).toBeTruthy()
    unmount()
    state.ctx = { ...state.ctx, loading: false }
    render(<ProjectEnvironmentsTab />)
    expect(screen.getByRole('heading', { name: 'No environments yet' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'New environment' })).toBeTruthy()
  })

  it('tells the sheet the project has no server of its own', () => {
    state.ctx = { ...state.ctx, project: { id: 'p', options: null } }
    render(<ProjectEnvironmentsTab />)
    fireEvent.click(screen.getByRole('button', { name: 'New environment' }))
    expect(state.sheet).toMatchObject({ hasProjectServer: false })
  })

  it('has no Base figures before any environment has been read', () => {
    state.views = {}
    state.ctx = { ...state.ctx, project: null }
    render(<ProjectEnvironmentsTab />)
    fireEvent.click(screen.getByRole('button', { name: 'New environment' }))
    expect(state.sheet?.base).toBeNull()
  })
})
