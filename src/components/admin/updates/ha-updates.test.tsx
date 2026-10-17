// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { InstanceUpdates } from '@/lib/instance-api'
import { HighAvailabilityUpdates } from './ha-updates'

type MockProps = {
  label?: string
  title?: string
  body?: string
  disabled?: boolean
  busy?: boolean
  onPress?: () => void
  onConfirm?: () => void
  headerRight?: ReactNode
  children?: ReactNode
  hideAutoUpdate?: boolean
}

vi.mock('react-native', async () => (await import('@/components/ui/v4/rn-stub')).reactNativeStub)
vi.mock('react-native-svg', async () => (await import('@/components/ui/v4/rn-stub')).svgStub)
vi.mock(
  '@/lib/theme-preference',
  async () => (await import('@/components/ui/v4/rn-stub')).themePreferenceStub
)

vi.mock('@/components/ui', () => ({
  Badge: (props: MockProps) => <span>{props.label}</span>,
  Button: (props: MockProps) => (
    <button type="button" disabled={Boolean(props.disabled || props.busy)} onClick={props.onPress}>
      {props.label}
    </button>
  ),
  ConfirmButton: (props: MockProps & { confirmLabel?: string; dismissLabel?: string }) => (
    <div>
      <button type="button" disabled={Boolean(props.busy)} onClick={props.onConfirm}>
        {props.label}
      </button>
      <span>{props.confirmLabel}</span>
      <span>{props.dismissLabel}</span>
    </div>
  ),
  InlineNotice: (props: MockProps) => (
    <p>
      {props.title} {props.body}
    </p>
  ),
  SectionPanel: (props: MockProps) => (
    <section>
      <h2>{props.title}</h2>
      {props.headerRight}
      {props.children}
    </section>
  ),
  SegmentedControl: () => <div data-testid="status-filter" />,
}))

vi.mock('@/components/admin/updates/upgrade-fleet-table', () => ({
  UpgradeFleetTable: () => <div data-testid="fleet-table" />,
}))
vi.mock('@/components/admin/updates/upgrade-history-panel', () => ({
  UpgradeHistoryPanel: () => <div data-testid="history-panel" />,
}))
vi.mock('@/components/admin/updates/upgrade-preflight-sheet', () => ({
  UpgradePreflightSheet: () => null,
}))
vi.mock('@/components/admin/updates/upgrade-settings-card', () => ({
  UpgradeSettingsCard: (props: MockProps) =>
    props.hideAutoUpdate ? null : <span>Auto-update servers</span>,
}))

const {
  useUpgradeActiveRun,
  useUpgradeHistory,
  useUpgradeServersPage,
  useUpgradeSettings,
  useSaveUpgradeSettings,
  useRetryUpgradeStep,
  useCancelUpgradeRun,
  useRunUpgradePreflight,
  useStartPlatformUpgrade,
  preflightMutateAsync,
} = vi.hoisted(() => {
  const preflightMutateAsync = vi.fn()
  return {
    useUpgradeActiveRun: vi.fn(),
    useUpgradeHistory: vi.fn(),
    useUpgradeServersPage: vi.fn(),
    useUpgradeSettings: vi.fn(),
    useSaveUpgradeSettings: vi.fn(),
    useRetryUpgradeStep: vi.fn(),
    useCancelUpgradeRun: vi.fn(),
    useRunUpgradePreflight: vi.fn(),
    useStartPlatformUpgrade: vi.fn(),
    preflightMutateAsync,
  }
})

vi.mock('@/lib/queries/admin', () => ({
  useUpgradeActiveRun,
  useUpgradeHistory,
  useUpgradeServersPage,
  useUpgradeSettings,
  useSaveUpgradeSettings,
  useRetryUpgradeStep,
  useCancelUpgradeRun,
  useRunUpgradePreflight,
  useStartPlatformUpgrade,
}))

const DATA: InstanceUpdates = {
  ok: true,
  channel: 'release',
  units: {
    instance: {
      installed: { version: '1.0.0', commit: 'abc' },
      target: null,
      uiTarget: null,
    },
    daemon: {
      installed: null,
      target: null,
      serverId: null,
      connected: true,
    },
  },
}

function idleQueries() {
  useUpgradeHistory.mockReturnValue({ data: { runs: [] } })
  useUpgradeServersPage.mockReturnValue({ data: { servers: [], total: 0 } })
  useUpgradeSettings.mockReturnValue({ data: { settings: null }, isLoading: false })
  useSaveUpgradeSettings.mockReturnValue({ mutate: vi.fn(), isPending: false })
  useRetryUpgradeStep.mockReturnValue({ mutate: vi.fn() })
  useCancelUpgradeRun.mockReturnValue({ mutate: vi.fn(), isPending: false })
  useRunUpgradePreflight.mockReturnValue({
    mutateAsync: preflightMutateAsync,
    isPending: false,
  })
  useStartPlatformUpgrade.mockReturnValue({ mutateAsync: vi.fn() })
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('HighAvailabilityUpdates', () => {
  beforeEach(() => {
    idleQueries()
    preflightMutateAsync.mockResolvedValue({ canStart: true, runId: 'run-1' })
  })

  it('shows the Auto-update servers toggle', () => {
    useUpgradeActiveRun.mockReturnValue({ data: { run: null }, refetch: vi.fn() })
    render(<HighAvailabilityUpdates data={DATA} />)
    expect(screen.getByText('Auto-update servers')).toBeTruthy()
  })

  it('shows an enabled Update fleet now button when no run is active', () => {
    useUpgradeActiveRun.mockReturnValue({ data: { run: null }, refetch: vi.fn() })
    render(<HighAvailabilityUpdates data={DATA} />)
    const button = screen.getByRole('button', { name: 'Update fleet now' })
    expect(button).toBeTruthy()
    expect((button as HTMLButtonElement).disabled).toBe(false)
  })

  it('disables Update fleet now when the active run is in progress', () => {
    useUpgradeActiveRun.mockReturnValue({
      data: {
        run: {
          id: 'run-1',
          status: 'running',
          steps: [{ status: 'installing' }, { status: 'waiting' }],
        },
      },
      refetch: vi.fn(),
    })
    render(<HighAvailabilityUpdates data={DATA} />)
    const button = screen.getByRole('button', { name: 'Update fleet now' })
    expect((button as HTMLButtonElement).disabled).toBe(true)
  })

  it('keeps Update fleet now enabled when the run is only waiting on offline servers', () => {
    useUpgradeActiveRun.mockReturnValue({
      data: {
        run: {
          id: 'run-1',
          status: 'running',
          steps: [
            { status: 'done' },
            { status: 'waiting' },
            { status: 'pending', connected: false },
          ],
        },
      },
      refetch: vi.fn(),
    })
    render(<HighAvailabilityUpdates data={DATA} />)
    const button = screen.getByRole('button', { name: 'Update fleet now' })
    expect((button as HTMLButtonElement).disabled).toBe(false)
  })

  it('explains that leftover steps are waiting on offline servers', () => {
    useUpgradeActiveRun.mockReturnValue({
      data: {
        run: {
          id: 'run-1',
          status: 'running',
          steps: [{ status: 'done' }, { status: 'waiting' }],
        },
      },
      refetch: vi.fn(),
    })
    render(<HighAvailabilityUpdates data={DATA} />)
    expect(
      screen.getByText(
        /1 server is offline, so this update is waiting for them. They are skipped after 15 minutes/
      )
    ).toBeTruthy()
    expect(screen.getByText('Yes, cancel the update')).toBeTruthy()
    expect(screen.getByText('No, keep it')).toBeTruthy()
  })

  it('starts preflight when Update fleet now is pressed', async () => {
    useUpgradeActiveRun.mockReturnValue({ data: { run: null }, refetch: vi.fn() })
    render(<HighAvailabilityUpdates data={DATA} />)
    fireEvent.click(screen.getByRole('button', { name: 'Update fleet now' }))
    await waitFor(() => {
      expect(preflightMutateAsync).toHaveBeenCalledTimes(1)
    })
  })
})
