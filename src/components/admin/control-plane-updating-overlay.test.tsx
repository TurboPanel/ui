// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, fireEvent, render as rtlRender, screen } from '@testing-library/react'
import type { ReactElement } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { dismissFlashNotice, postFlashNotice, resetFlashNoticesForTests } from '@/lib/flash-notice'
import { registerOpenDialog } from '@/lib/version-prompt-gate'
import { ControlPlaneUpdatingOverlay } from './control-plane-updating-overlay'

const { useUpgradeActiveRun, markWatch, needsReload } = vi.hoisted(() => ({
  needsReload: { value: false },
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
  Button: (props: { label: string; onPress?: () => void }) => (
    <button type="button" onClick={props.onPress}>
      {props.label}
    </button>
  ),
  LoadingState: (props: { label: string }) => <p>{props.label}</p>,
}))
vi.mock('@/lib/auth-context', () => ({ useAuth: () => ({ session: {}, isLoading: false }) }))
vi.mock('@/lib/use-step-up-open', () => ({ useStepUpOpen: () => false }))
vi.mock('@/lib/upgrade-status-query', () => ({ upgradeStatusQueryEnabled: () => true }))
vi.mock('@/lib/control-plane-accounts', () => ({ canQueryControlPlane: () => true }))
vi.mock('@/lib/queries/admin', () => ({ useUpgradeActiveRun }))
vi.mock('@/lib/use-control-plane-reconnect', () => ({
  useControlPlaneReconnect: () => ({ view: null, retryNow: vi.fn(), keepWaiting: vi.fn() }),
}))
vi.mock('@/lib/upgrade-reload', () => ({
  noteLoadedControlPlaneRevision: () => null,
  reloadWebClient: vi.fn(),
  shouldPromptControlPlaneReload: () => needsReload.value,
}))
vi.mock('@/lib/upgrade-watch', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/upgrade-watch')>()),
  markControlPlaneUpgradeWatch: markWatch,
}))

function render(ui: ReactElement) {
  const client = new QueryClient()
  return rtlRender(<QueryClientProvider client={client}>{ui}</QueryClientProvider>)
}

function answered(run: unknown) {
  return { data: { run }, isSuccess: true, isFetching: false, isError: false, refetch: vi.fn() }
}

afterEach(() => {
  cleanup()
  needsReload.value = false
  resetFlashNoticesForTests()
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

  describe('new version prompt', () => {
    const quietRun = () => useUpgradeActiveRun.mockReturnValue(answered(null))

    it('is a small notice with Reload and Dismiss, not a dimming dialog', () => {
      needsReload.value = true
      quietRun()
      render(<ControlPlaneUpdatingOverlay />)
      expect(screen.getByText('A newer TurboPanel version is live')).toBeTruthy()
      expect(screen.getByText('Reload')).toBeTruthy()
      expect(screen.getByText('Dismiss')).toBeTruthy()
      expect(screen.queryByText('Reload now')).toBeNull()
      // Announced politely, without taking focus.
      const toast = screen.getByRole('status')
      expect(toast.getAttribute('aria-live')).toBe('polite')
      expect(toast.textContent).toContain('A newer TurboPanel version is live')
      expect(document.querySelector('[aria-modal="true"]')).toBeNull()
    })

    it('waits while a dialog is open, then appears when it closes', () => {
      needsReload.value = true
      quietRun()
      let release = () => {}
      act(() => {
        release = registerOpenDialog()
      })
      render(<ControlPlaneUpdatingOverlay />)
      expect(screen.queryByText('A newer TurboPanel version is live')).toBeNull()
      act(() => release())
      expect(screen.getByText('A newer TurboPanel version is live')).toBeTruthy()
    })

    it('shows the result of what the person did first, then the new version', () => {
      needsReload.value = true
      quietRun()
      let id = 0
      act(() => {
        id = postFlashNotice('Deleted organization Acme.')
      })
      render(<ControlPlaneUpdatingOverlay />)
      expect(screen.queryByText('A newer TurboPanel version is live')).toBeNull()
      act(() => dismissFlashNotice(id))
      expect(screen.getByText('A newer TurboPanel version is live')).toBeTruthy()
    })

    it('stays away once dismissed', () => {
      needsReload.value = true
      quietRun()
      render(<ControlPlaneUpdatingOverlay />)
      fireEvent.click(screen.getByText('Dismiss'))
      expect(screen.queryByText('A newer TurboPanel version is live')).toBeNull()
    })
  })
})
