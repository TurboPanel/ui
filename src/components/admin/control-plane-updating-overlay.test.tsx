// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ControlPlaneUpdatingOverlay } from './control-plane-updating-overlay'

const { useUpgradeActiveRun, markWatch } = vi.hoisted(() => ({
  useUpgradeActiveRun: vi.fn(),
  markWatch: vi.fn(),
}))

vi.mock('react-native', async () => (await import('@/components/ui/v4/rn-stub')).reactNativeStub)
vi.mock('react-native-svg', async () => (await import('@/components/ui/v4/rn-stub')).svgStub)
vi.mock(
  '@/lib/theme-preference',
  async () => (await import('@/components/ui/v4/rn-stub')).themePreferenceStub
)
vi.mock('@/components/ui', () => ({
  Button: (props: { label: string }) => <button type="button">{props.label}</button>,
  LoadingState: (props: { label: string }) => <p>{props.label}</p>,
}))
vi.mock('@/lib/auth-context', () => ({ useAuth: () => ({ session: {}, isLoading: false }) }))
vi.mock('@/lib/upgrade-status-query', () => ({ upgradeStatusQueryEnabled: () => true }))
vi.mock('@/lib/control-plane-accounts', () => ({ canQueryControlPlane: () => true }))
vi.mock('@/lib/queries/admin', () => ({ useUpgradeActiveRun }))
vi.mock('@/lib/use-control-plane-reconnect', () => ({
  useControlPlaneReconnect: () => ({ view: null, retryNow: vi.fn(), keepWaiting: vi.fn() }),
}))
vi.mock('@/lib/upgrade-reload', () => ({
  noteLoadedControlPlaneRevision: () => null,
  reloadWebClient: vi.fn(),
  shouldPromptControlPlaneReload: () => false,
}))
vi.mock('@/lib/upgrade-watch', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/upgrade-watch')>()),
  markControlPlaneUpgradeWatch: markWatch,
}))

function answered(run: unknown) {
  return { data: { run }, isSuccess: true, isFetching: false, isError: false, refetch: vi.fn() }
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('ControlPlaneUpdatingOverlay', () => {
  it('arms its own restart watch while the run is updating the control plane', () => {
    useUpgradeActiveRun.mockReturnValue(
      answered({
        id: 'run-1',
        status: 'running',
        phase: 'control_plane',
        steps: [{ unit: 'instance', status: 'installing' }],
      })
    )
    render(<ControlPlaneUpdatingOverlay />)
    expect(screen.getByText('TurboPanel is updating')).toBeTruthy()
    expect(markWatch).toHaveBeenCalled()
  })

  it('does not arm it while only servers are updating', () => {
    useUpgradeActiveRun.mockReturnValue(
      answered({
        id: 'run-1',
        status: 'running',
        phase: 'fleet',
        steps: [{ unit: 'daemon', status: 'installing' }],
      })
    )
    render(<ControlPlaneUpdatingOverlay />)
    expect(screen.queryByText('TurboPanel is updating')).toBeNull()
    expect(markWatch).not.toHaveBeenCalled()
  })

  it('does not arm it for a control-plane step that went quiet', () => {
    useUpgradeActiveRun.mockReturnValue(
      answered({
        id: 'run-1',
        status: 'running',
        phase: 'control_plane',
        steps: [{ unit: 'instance', status: 'needs_attention' }],
      })
    )
    render(<ControlPlaneUpdatingOverlay />)
    expect(markWatch).not.toHaveBeenCalled()
  })
})
