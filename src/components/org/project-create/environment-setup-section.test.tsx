// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DeployHealthCheckMissingError } from '@/lib/instance-api'
import { ProjectEnvironmentSetupSection } from './environment-setup-section'

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  context: vi.fn(),
  updateRun: vi.fn(),
  variableRun: vi.fn(),
  deployRun: vi.fn(),
  result: { current: null as unknown },
}))

vi.mock('react-native', async () => (await import('@/components/ui/v4/rn-stub')).reactNativeStub)
vi.mock('expo-router', () => ({ useRouter: () => ({ replace: mocks.replace }) }))
vi.mock('@/components/org/project/project-context', () => ({
  useProjectContext: mocks.context,
}))
vi.mock('@/components/ui', () => ({
  LoadingState: ({ label }: { label: string }) => <p>{label}</p>,
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
  useOrgServers: () => ({ data: { servers: [{ id: 's1', name: 'web-1', connected: true }] } }),
  useUpdateEnvironment: () => ({ run: mocks.updateRun }),
  useCreateVariable: () => ({ run: mocks.variableRun }),
  useDeployEnvironment: () => ({ run: mocks.deployRun, isPending: false }),
}))
vi.mock('@/components/org/project-create/environment-setup-form', () => ({
  EnvironmentSetupForm: ({
    error,
    onSubmit,
  }: {
    error?: string | null
    onSubmit: (result: unknown, intent: 'save' | 'deploy') => void
  }) => (
    <div>
      {error ? <p role="alert">{error}</p> : null}
      <button onClick={() => onSubmit(mocks.result.current, 'save')}>Save</button>
      <button onClick={() => onSubmit(mocks.result.current, 'deploy')}>Deploy</button>
    </div>
  ),
}))
vi.mock('@/components/org/project/preview-deployment-modal', () => ({
  PreviewDeploymentModal: ({
    visible,
    placementServerLabel,
    onConfirm,
  }: {
    visible: boolean
    placementServerLabel?: string | null
    onConfirm: () => void
  }) =>
    visible ? (
      <div role="dialog">
        <p>{placementServerLabel}</p>
        <button onClick={onConfirm}>Confirm deploy</button>
      </div>
    ) : null,
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
})
