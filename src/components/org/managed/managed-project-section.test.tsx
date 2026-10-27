// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ManagedEnvironmentReadyPanels } from './managed-project-section'

const h = vi.hoisted(() => ({
  liveStatus: 'stopped' as string | undefined,
  register: vi.fn(),
  lifecycleRun: vi.fn(),
  lifecycleProps: null as null | {
    status: string
    onLifecycle: (action: 'start' | 'stop' | 'restart') => Promise<void>
  },
}))

vi.mock('react-native', async () => (await import('@/components/ui/v4/rn-stub')).reactNativeStub)
vi.mock('react-native-svg', async () => (await import('@/components/ui/v4/rn-stub')).svgStub)
vi.mock(
  '@/lib/theme-preference',
  async () => (await import('@/components/ui/v4/rn-stub')).themePreferenceStub
)
vi.mock('expo-router', () => ({ Link: () => null, useRouter: () => ({}) }))
vi.mock('expo-clipboard', () => ({ setStringAsync: vi.fn() }))
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({}) }))
vi.mock('@/lib/query-client', () => ({ useCan: () => true }))
vi.mock('@/lib/queries/servers', () => ({ useOrgServers: () => ({ data: undefined }) }))
vi.mock('@/lib/queries/environments', () => ({}))
vi.mock('@/lib/org-default-environment', () => ({ useOrgDefaultEnvironmentName: () => '' }))
vi.mock('@/components/org/managed/managed-environment-context', () => ({
  invalidateEnvironmentManagedQueries: vi.fn(),
  ManagedCommandsProvider: () => null,
  useOptionalManagedEnvironment: () => null,
  useManagedEnvironment: () => ({
    registerCommand: h.register,
    applyCommand: null,
    inFlight: false,
  }),
}))
vi.mock('@/lib/queries/managed', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/queries/managed')>()
  const stub = () => ({ data: undefined, run: vi.fn(), mutateAsync: vi.fn(), isPending: false })
  const hooks = Object.fromEntries(
    Object.keys(actual)
      .filter((name) => name.startsWith('use'))
      .map((name) => [name, stub])
  )
  return {
    ...actual,
    ...hooks,
    useManagedStatus: () => ({ data: h.liveStatus ? { status: h.liveStatus } : undefined }),
    useRunManagedLifecycle: () => ({ run: h.lifecycleRun }),
  }
})
vi.mock('@/components/org/managed/managed-lifecycle-panel', () => ({
  ManagedLifecyclePanel: (props: NonNullable<typeof h.lifecycleProps>) => {
    h.lifecycleProps = props
    return <p data-testid="danger-zone">{props.status}</p>
  },
}))
vi.mock('@/components/org/managed/managed-settings-panel', () => ({
  ManagedSettingsPanel: () => null,
}))
vi.mock('@/components/org/managed/managed-status-panel', () => ({ ManagedStatusPanel: () => null }))
vi.mock('@/components/org/managed/managed-cluster-panel', () => ({
  ManagedClusterPanel: () => null,
}))
vi.mock('@/components/org/managed/managed-backups-panel', () => ({
  ManagedBackupsPanel: () => null,
}))
vi.mock('@/components/org/managed/managed-backup-schedules-panel', () => ({
  ManagedBackupSchedulesPanel: () => null,
}))
vi.mock('@/components/org/managed/managed-bindings-panel', () => ({
  ManagedBindingsPanel: () => null,
}))
vi.mock('@/components/org/managed/managed-connection-panel', () => ({
  ManagedConnectionPanel: () => null,
}))
vi.mock('@/components/org/managed/managed-credentials-panel', () => ({
  ManagedCredentialsPanel: () => null,
}))
vi.mock('@/components/org/managed/managed-external-access-switch', () => ({
  ManagedExternalAccessSwitch: () => null,
}))
vi.mock('@/components/org/managed/managed-users-panel', () => ({ ManagedUsersPanel: () => null }))
vi.mock('@/components/org/managed/managed-version-picker', () => ({
  defaultManagedVersionSelection: () => null,
  ManagedVersionPicker: () => null,
}))
vi.mock('@/components/org/managed/secret-reveal', () => ({ SecretReveal: () => null }))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  h.liveStatus = 'stopped'
})

function renderSettings() {
  return render(
    <ManagedEnvironmentReadyPanels
      orgId="o"
      environmentId="e"
      focus="settings"
      projectName="Orders db"
      supportsBackup={false}
      canManage
      detail={
        {
          managed: { id: 'm', status: 'applying', engine: 'postgres', serverId: 'srv-detail' },
          members: [],
          settings: null,
        } as never
      }
    />
  )
}

describe('ManagedEnvironmentReadyPanels danger zone', () => {
  it('reads the live status, not the stored row that still says applying', () => {
    renderSettings()
    expect(screen.getByTestId('danger-zone').textContent).toBe('stopped')
  })

  it('falls back to the stored row before the live status has loaded', () => {
    h.liveStatus = undefined
    renderSettings()
    expect(screen.getByTestId('danger-zone').textContent).toBe('applying')
  })

  it('tracks a lifecycle command on the server that took it', async () => {
    h.lifecycleRun.mockResolvedValue({
      ok: true,
      value: { ok: true, commandId: 'cmd-stop', status: 'queued', serverId: 'srv-member' },
    })
    renderSettings()
    await h.lifecycleProps?.onLifecycle('stop')
    expect(h.register).toHaveBeenCalledWith('cmd-stop', 'stop', 'srv-member')
  })
})
