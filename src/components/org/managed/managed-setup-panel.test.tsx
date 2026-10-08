// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ManagedSetupPanel } from './managed-project-section'

vi.mock('react-native', async () => (await import('@/components/ui/v4/rn-stub')).reactNativeStub)
vi.mock('react-native-svg', async () => (await import('@/components/ui/v4/rn-stub')).svgStub)
vi.mock('@/lib/theme-preference', async () => (await import('@/components/ui/v4/rn-stub')).themePreferenceStub)
vi.mock('@/components/ui/panel-styles', () => ({ panelStyles: {} }))
vi.mock('@/components/ui', () => ({
  SectionPanel: ({ children }: { children?: unknown }) => <div>{children as never}</div>,
  LoadingState: () => null,
  Button: ({ label, disabled, onPress }: { label: string; disabled?: boolean; onPress?: () => void }) => (
    <button disabled={disabled} onClick={onPress}>
      {label}
    </button>
  ),
}))
vi.mock('@/components/org/managed/managed-version-picker', () => ({
  ManagedVersionPicker: () => null,
  defaultManagedVersionSelection: () => null,
}))
vi.mock('@/components/org/managed/managed-external-access-switch', () => ({
  ManagedExternalAccessSwitch: ({
    value,
    disabled,
    onChange,
  }: {
    value: boolean
    disabled?: boolean
    onChange: (next: boolean) => void
  }) => (
    <button role="switch" aria-checked={value} disabled={disabled} onClick={() => onChange(!value)}>
      external access
    </button>
  ),
}))

vi.mock('@/components/org/managed/managed-backups-panel', () => ({}))
vi.mock('@/components/org/managed/managed-backup-schedules-panel', () => ({}))
vi.mock('@/components/org/managed/managed-bindings-panel', () => ({}))
vi.mock('@/components/org/managed/managed-cluster-panel', () => ({}))
vi.mock('@/components/org/managed/managed-connection-panel', () => ({}))
vi.mock('@/components/org/managed/managed-credentials-panel', () => ({}))
vi.mock('@/components/org/managed/managed-lifecycle-panel', () => ({}))
vi.mock('@/components/org/managed/managed-settings-panel', () => ({}))
vi.mock('@/components/org/managed/managed-status-panel', () => ({}))
vi.mock('@/components/org/managed/managed-users-panel', () => ({}))
vi.mock('@/components/org/managed/secret-reveal', () => ({}))
vi.mock('@/lib/queries/commands', () => ({}))

const mocks = vi.hoisted(() => ({
  calls: new Array<string>(),
  canEditServer: true,
  saveRun: vi.fn(),
  pinRun: vi.fn(),
  createRun: vi.fn(),
}))

vi.mock('@/lib/query-client', () => ({ useCan: () => mocks.canEditServer }))
vi.mock('@/lib/queries/servers', () => ({
  useOrgServers: () => ({
    isLoading: false,
    data: { servers: [{ id: 'srv-1', name: 'host-1', connected: true }] },
  }),
}))
vi.mock('@/lib/queries/environments', () => ({
  useUpdateEnvironment: () => ({ isPending: false, actionError: null, run: mocks.pinRun }),
}))
vi.mock('@/lib/queries/managed', () => ({
  useCreateEnvironmentManaged: () => ({ isPending: false, actionError: null, run: mocks.createRun }),
  useServerManagedExternalAccess: () => ({
    isLoading: false,
    data: { enabled: false, pending: false, clusterCount: 2 },
  }),
  useSaveServerManagedExternalAccess: () => ({ isPending: false, actionError: null, run: mocks.saveRun }),
}))

function renderPanel(canManage = true) {
  render(
    <ManagedSetupPanel
      orgId="org-1"
      environmentId="env-1"
      engineCode="postgres"
      canManage={canManage}
      onCreated={vi.fn()}
    />,
  )
}

beforeEach(() => {
  mocks.calls.length = 0
  mocks.canEditServer = true
  mocks.pinRun.mockReset().mockImplementation(async () => ({ ok: true, value: {} }))
  mocks.saveRun.mockReset().mockImplementation(async () => {
    mocks.calls.push('save')
    return { ok: true, value: {} }
  })
  mocks.createRun.mockReset().mockImplementation(async () => {
    mocks.calls.push('create')
    return { ok: true, value: { rootPassword: 'p', rootUsername: 'u' } }
  })
})
afterEach(cleanup)

describe('managed setup panel external access', () => {
  it('saves the changed switch before it creates the service', async () => {
    renderPanel()
    fireEvent.click(screen.getByRole('switch'))
    fireEvent.click(screen.getByText('Create service'))
    await waitFor(() => expect(mocks.createRun).toHaveBeenCalled())
    expect(mocks.calls).toEqual(['save', 'create'])
    expect(mocks.saveRun).toHaveBeenCalledWith({ serverId: 'srv-1', enabled: true })
  })

  it('does not save an untouched switch', async () => {
    renderPanel()
    fireEvent.click(screen.getByText('Create service'))
    await waitFor(() => expect(mocks.createRun).toHaveBeenCalled())
    expect(mocks.saveRun).not.toHaveBeenCalled()
  })

  it('shows the failed save message and does not create', async () => {
    mocks.saveRun.mockImplementation(async () => ({ ok: false, error: 'HTTP 502: not delivered', cause: null }))
    renderPanel()
    fireEvent.click(screen.getByRole('switch'))
    fireEvent.click(screen.getByText('Create service'))
    await waitFor(() => expect(screen.getByText('HTTP 502: not delivered')).toBeTruthy())
    expect(mocks.createRun).not.toHaveBeenCalled()
  })

  it('falls back to a plain message when the save has no error text', async () => {
    mocks.saveRun.mockImplementation(async () => ({ ok: false, error: null, cause: null }))
    renderPanel()
    fireEvent.click(screen.getByRole('switch'))
    fireEvent.click(screen.getByText('Create service'))
    await waitFor(() => expect(screen.getByText('Failed to save external access')).toBeTruthy())
    expect(mocks.createRun).not.toHaveBeenCalled()
  })

  it('disables the switch for people who cannot manage the server', () => {
    mocks.canEditServer = false
    renderPanel()
    expect((screen.getByRole('switch') as HTMLButtonElement).disabled).toBe(true)
  })
})
