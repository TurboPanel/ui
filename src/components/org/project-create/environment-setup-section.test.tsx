// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import { DeployHealthCheckMissingError } from '@/lib/instance-api'
import { ProjectEnvironmentSetupSection } from './environment-setup-section'

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  context: vi.fn(),
  updateRun: vi.fn(),
  variableRun: vi.fn(),
  deployRun: vi.fn(),
  result: { current: null as unknown },
  waiting: { current: false },
  history: {
    current: { data: { deployments: [] }, isError: false } as {
      data: { deployments: unknown[] } | undefined
      isError: boolean
    },
  },
}))

vi.mock('react-native', async () => (await import('@/components/ui/v4/rn-stub')).reactNativeStub)
vi.mock('expo-router', () => ({ useRouter: () => ({ replace: mocks.replace }) }))
vi.mock('@/components/org/project/project-context', () => ({
  useProjectContext: mocks.context,
}))
vi.mock('@/components/ui', () => ({
  LoadingState: ({ label }: { label: string }) => <p>{label}</p>,
}))
vi.mock('@/components/org/project-detail-section', () => ({
  useProjectAccountWaiting: () => mocks.waiting.current,
  ProjectPrincipalsSection: () => <p>Hosting Account list</p>,
}))
vi.mock('@/components/ui/v4', () => ({
  SectionHeading: ({ title }: { title: string }) => <h2>{title}</h2>,
}))
vi.mock('@/lib/org-default-environment', () => ({
  useOrgDefaultEnvironmentName: () => ({ customDefaultEnvironmentName: null }),
}))
vi.mock('@/lib/queries', () => ({
  useEnvironment: () => ({
    data: {
      environment: {
        id: 'e1',
        name: 'production',
        serverId: null,
        options: { compose: { version: 1, data: {} }, primaryHostname: 'example.com' },
      },
    },
    error: null,
  }),
  useEnvironmentDeployments: () => mocks.history.current,
  useOrgServers: () => ({ data: { servers: [{ id: 's1', name: 'web-1', connected: true }] } }),
  useUpdateEnvironment: () => ({ run: mocks.updateRun }),
  useCreateVariable: () => ({ run: mocks.variableRun }),
  useDeployEnvironment: () => ({ run: mocks.deployRun, isPending: false }),
}))
vi.mock('@/components/org/project-create/environment-setup-form', () => ({
  EnvironmentSetupForm: ({
    error,
    accountsSlot,
    onSubmit,
  }: {
    error?: string | null
    accountsSlot?: ReactNode
    onSubmit: (result: unknown, intent: 'save' | 'deploy') => void
  }) => (
    <div>
      {error ? <p role="alert">{error}</p> : null}
      {accountsSlot}
      <button onClick={() => onSubmit(mocks.result.current, 'save')}>Save</button>
      <button onClick={() => onSubmit(mocks.result.current, 'deploy')}>Deploy</button>
    </div>
  ),
}))
vi.mock('@/components/org/project/preview-deployment-modal', () => ({
  PreviewDeploymentModal: ({
    visible,
    placementServerId,
    placementServerLabel,
    onConfirm,
  }: {
    visible: boolean
    placementServerId: string | null
    placementServerLabel?: string | null
    onConfirm: () => void
  }) =>
    visible ? (
      <div role="dialog">
        <p>{placementServerLabel}</p>
        <button onClick={onConfirm}>Confirm deploy</button>
      </div>
    ) : (
      <p data-testid="closed-dialog-server">{placementServerId ?? 'none'}</p>
    ),
}))

const COMPOSE = { version: 1, data: { services: { web: {} } } }

beforeEach(() => {
  mocks.context.mockReturnValue({
    orgId: 'o',
    loading: false,
    canManage: true,
    project: { id: 'p', name: 'website', options: { compose: null } },
    environments: [{ id: 'e1', isPrimary: true }],
  })
  mocks.updateRun.mockResolvedValue({ ok: true, value: { ok: true } })
  mocks.variableRun.mockResolvedValue({ ok: true, value: { ok: true, id: 'v' } })
  mocks.deployRun.mockResolvedValue({ ok: true, value: {} })
  mocks.waiting.current = false
  mocks.history.current = { data: { deployments: [] }, isError: false }
  mocks.result.current = {
    name: 'live',
    serverId: 's1',
    compose: COMPOSE,
    variables: [{ key: 'A', value: '1', secret: false, use: 'run' }],
  }
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

async function press(name: string) {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name }))
    await Promise.resolve()
  })
}

describe('ProjectEnvironmentSetupSection', () => {
  it('saves the environment once, then each variable, then opens it', async () => {
    render(<ProjectEnvironmentSetupSection />)
    await press('Save')
    expect(mocks.updateRun).toHaveBeenCalledWith({
      name: 'live',
      serverId: 's1',
      options: { compose: COMPOSE, primaryHostname: 'example.com' },
    })
    expect(mocks.variableRun).toHaveBeenCalledWith({
      key: 'A',
      value: '1',
      isSecret: false,
      forBuild: false,
      forRuntime: true,
    })
    expect(mocks.replace).toHaveBeenCalledWith('/o/projects/p/environments/e1')
  })

  it('saves, asks to confirm, then deploys and opens the environment', async () => {
    render(<ProjectEnvironmentSetupSection />)
    await press('Deploy')
    expect(mocks.replace).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog').textContent).toContain('web-1')
    await press('Confirm deploy')
    expect(mocks.deployRun).toHaveBeenCalledTimes(1)
    expect(mocks.replace).toHaveBeenCalledWith('/o/projects/p/environments/e1')
  })

  it('words a refused deploy in plain words, not its code', async () => {
    mocks.deployRun.mockResolvedValue({
      ok: false,
      error: 'health_check_missing',
      cause: new DeployHealthCheckMissingError(true, ['web']),
    })
    render(<ProjectEnvironmentSetupSection />)
    await press('Deploy')
    await press('Confirm deploy')
    expect(screen.getByRole('alert').textContent).toMatch(/requires a compose healthcheck/)
    expect(mocks.replace).not.toHaveBeenCalled()
  })

  it('keeps the chosen server on the dialog while it closes after a refusal', async () => {
    mocks.deployRun.mockResolvedValue({
      ok: false,
      error: 'health_check_missing',
      cause: new DeployHealthCheckMissingError(true, ['web']),
    })
    render(<ProjectEnvironmentSetupSection />)
    await press('Deploy')
    await press('Confirm deploy')
    expect(screen.getByTestId('closed-dialog-server').textContent).toBe('s1')
  })

  it('offers the Hosting Account form when a deploy is refused for one', async () => {
    mocks.deployRun.mockResolvedValue({
      ok: false,
      error: 'principal_required_for_service_kind',
      cause: new Error('HTTP 409: principal_required_for_service_kind'),
    })
    render(<ProjectEnvironmentSetupSection />)
    expect(screen.queryByText('Hosting Account list')).toBeNull()
    await press('Deploy')
    await press('Confirm deploy')
    expect(screen.getByRole('alert').textContent).toBe(
      'This app needs a Hosting Account to run as. Add one below, then deploy again.'
    )
    expect(screen.getByRole('heading', { name: 'Hosting Account' })).toBeTruthy()
    expect(screen.getByText('Hosting Account list')).toBeTruthy()
  })

  it('shows the Hosting Account form up front while an app waits for one', () => {
    mocks.waiting.current = true
    render(<ProjectEnvironmentSetupSection />)
    expect(screen.getByText('Hosting Account list')).toBeTruthy()
  })

  it('stays with the error when a save is refused, and does not add a variable twice', async () => {
    mocks.variableRun
      .mockResolvedValueOnce({ ok: true, value: { ok: true, id: 'v' } })
      .mockResolvedValueOnce({ ok: false, error: 'B is taken' })
    mocks.result.current = {
      name: 'production',
      serverId: null,
      compose: { version: 1, data: {} },
      variables: [
        { key: 'A', value: '1', secret: false, use: 'run' },
        { key: 'B', value: '2', secret: false, use: 'run' },
      ],
    }
    render(<ProjectEnvironmentSetupSection />)
    await press('Save')
    expect(screen.getByRole('alert').textContent).toBe('B is taken')
    expect(mocks.replace).not.toHaveBeenCalled()
    await press('Save')
    const keys = mocks.variableRun.mock.calls.map(([body]) => (body as { key: string }).key)
    expect(keys).toEqual(['A', 'B', 'B'])
  })

  it('says so when the project has no environment', () => {
    mocks.context.mockReturnValue({
      orgId: 'o',
      loading: false,
      canManage: true,
      project: { id: 'p', name: 'website', options: null },
      environments: [],
    })
    render(<ProjectEnvironmentSetupSection />)
    expect(screen.getByText('This project has no environment to set up.')).toBeTruthy()
  })

  it('waits for the deploy history before showing the form', () => {
    mocks.history.current = { data: undefined, isError: false }
    render(<ProjectEnvironmentSetupSection />)
    expect(screen.getByText('Loading environment…')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull()
    expect(mocks.replace).not.toHaveBeenCalled()
  })

  it('opens the environment instead when it has deployed before', () => {
    mocks.history.current = { data: { deployments: [{ id: 'd1' }] }, isError: false }
    render(<ProjectEnvironmentSetupSection />)
    expect(mocks.replace).toHaveBeenCalledWith('/o/projects/p/environments/e1')
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull()
  })

  it('shows the form for an environment that never deployed', () => {
    render(<ProjectEnvironmentSetupSection />)
    expect(screen.getByRole('button', { name: 'Save' })).toBeTruthy()
    expect(mocks.replace).not.toHaveBeenCalled()
  })

  it('keeps the form when the deploy history cannot be read', () => {
    mocks.history.current = { data: undefined, isError: true }
    render(<ProjectEnvironmentSetupSection />)
    expect(screen.getByRole('button', { name: 'Save' })).toBeTruthy()
    expect(mocks.replace).not.toHaveBeenCalled()
  })
})
