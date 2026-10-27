// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { UpdateCheckTooSoonError, type InstanceUpdates } from '@/lib/instance-api'
import { HighAvailabilityUpdates } from './ha-updates'

type MockProps = {
  label?: string
  title?: string
  body?: string
  prompt?: string
  confirmLabel?: string
  disabled?: boolean
  busy?: boolean
  onPress?: () => void
  onConfirm?: () => void
  headerRight?: ReactNode
  children?: ReactNode
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
  ConfirmButton: (props: MockProps) => (
    <div>
      <button type="button" disabled={Boolean(props.busy)}>
        {props.label}
      </button>
      <span>{props.prompt}</span>
      <button type="button" onClick={props.onConfirm}>
        {props.confirmLabel}
      </button>
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
  StatusDot: () => <span />,
}))

vi.mock('@/components/admin/updates/console-build', () => ({ readConsoleBuild: () => null }))
vi.mock('@/components/admin/updates/upgrade-fleet-table', () => ({
  UpgradeFleetTable: () => <div data-testid="fleet-table" />,
}))
vi.mock('@/components/admin/updates/upgrade-history-panel', () => ({
  RECENT_UPDATE_RUNS: 5,
  UpgradeHistoryPanel: () => <div data-testid="history-panel" />,
}))
vi.mock('@/components/admin/updates/upgrade-settings-card', () => ({
  UpgradeSettingsCard: () => <div data-testid="settings-card" />,
}))
// Local time depends on the machine; the words around it are what is tested.
vi.mock('@/lib/format-datetime', () => ({
  formatLocalDateTime: (iso: string) => `<${iso}>`,
}))

const {
  useUpgradeActiveRun,
  useUpgradeHistory,
  useUpgradeServersPage,
  useUpgradeSettings,
  useSaveUpgradeSettings,
  usePauseUpdates,
  useResumeUpdates,
  useCheckForUpdates,
  pauseRun,
  resumeRun,
  checkRun,
} = vi.hoisted(() => ({
  useUpgradeActiveRun: vi.fn(),
  useUpgradeHistory: vi.fn(),
  useUpgradeServersPage: vi.fn(),
  useUpgradeSettings: vi.fn(),
  useSaveUpgradeSettings: vi.fn(),
  usePauseUpdates: vi.fn(),
  useResumeUpdates: vi.fn(),
  useCheckForUpdates: vi.fn(),
  pauseRun: vi.fn(),
  resumeRun: vi.fn(),
  checkRun: vi.fn(),
}))

vi.mock('@/lib/queries/admin', () => ({
  useUpgradeActiveRun,
  useUpgradeHistory,
  useUpgradeServersPage,
  useUpgradeSettings,
  useSaveUpgradeSettings,
  usePauseUpdates,
  useResumeUpdates,
  useCheckForUpdates,
}))

const DATA: InstanceUpdates = {
  ok: true,
  channel: 'release',
  automatic: true,
  updatesPaused: false,
  pausedAt: null,
  pausedBy: null,
  daemonsBehind: false,
  updateWaiting: false,
  nextCheckAt: '2026-10-27T11:17:00.000Z',
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

const PAUSED: InstanceUpdates = {
  ...DATA,
  updatesPaused: true,
  pausedAt: '2026-10-27T09:30:00.000Z',
  pausedBy: { userId: 'u1', email: 'ops@example.com', name: 'Dana Ops' },
}

function idleQueries() {
  useUpgradeActiveRun.mockReturnValue({ data: { run: null } })
  useUpgradeHistory.mockReturnValue({ data: { runs: [] } })
  useUpgradeServersPage.mockReturnValue({ data: { servers: [], total: 0 } })
  useUpgradeSettings.mockReturnValue({ data: { settings: null }, isLoading: false })
  useSaveUpgradeSettings.mockReturnValue({ mutate: vi.fn(), isPending: false })
  pauseRun.mockResolvedValue({ ok: true, value: { updatesPaused: true } })
  resumeRun.mockResolvedValue({ ok: true, value: { updatesPaused: false } })
  usePauseUpdates.mockReturnValue({ run: pauseRun, isPending: false })
  useResumeUpdates.mockReturnValue({ run: resumeRun, isPending: false })
  checkRun.mockResolvedValue({ ok: true, value: DATA })
  useCheckForUpdates.mockReturnValue({ run: checkRun, isPending: false })
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('HighAvailabilityUpdates', () => {
  beforeEach(idleQueries)

  it('has no manual start, auto-update switch, retry or cancel', () => {
    useUpgradeActiveRun.mockReturnValue({
      data: { run: { id: 'run-1', status: 'running', steps: [{ status: 'failed' }] } },
    })
    render(<HighAvailabilityUpdates data={DATA} />)
    for (const name of [
      'Update fleet now',
      'Update now',
      'Check now',
      'Cancel update',
      'Retry step',
    ]) {
      expect(screen.queryByRole('button', { name })).toBeNull()
    }
    expect(screen.queryByText(/Auto-update/)).toBeNull()
    expect(screen.getByTestId('settings-card')).toBeTruthy()
  })

  it('says updates run on their own and when the next check is', () => {
    render(<HighAvailabilityUpdates data={DATA} />)
    expect(screen.getByText('TurboPanel is up to date')).toBeTruthy()
    expect(screen.getByText('Next check: <2026-10-27T11:17:00.000Z>')).toBeTruthy()
    expect(screen.getByText(/update on their own/)).toBeTruthy()
  })

  it('names what waits when a connected daemon is behind', () => {
    render(<HighAvailabilityUpdates data={{ ...DATA, daemonsBehind: true, updateWaiting: true }} />)
    expect(screen.getByText('Update Waiting')).toBeTruthy()
    expect(
      screen.getByText(
        'Waiting to update: the daemon on some servers. It starts on its own at the next check.'
      )
    ).toBeTruthy()
  })

  it('does not claim daemons are behind when only something else waits', () => {
    render(
      <HighAvailabilityUpdates data={{ ...DATA, daemonsBehind: false, updateWaiting: true }} />
    )
    expect(screen.queryByText(/the daemon on some servers/)).toBeNull()
    expect(
      screen.getByText('An update is waiting. It starts on its own at the next check.')
    ).toBeTruthy()
  })

  it('pauses after the confirmation that a run in progress finishes its servers', async () => {
    render(<HighAvailabilityUpdates data={DATA} />)
    expect(screen.getByRole('button', { name: 'Pause All Updates' })).toBeTruthy()
    expect(
      screen.getByText(/An update in progress finishes the servers it is updating, then stops/)
    ).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Yes, Pause' }))
    await waitFor(() => {
      expect(pauseRun).toHaveBeenCalledTimes(1)
    })
    expect(resumeRun).not.toHaveBeenCalled()
  })

  it('shows who paused updates and since when, and resumes at the next check', async () => {
    render(<HighAvailabilityUpdates data={PAUSED} />)
    expect(screen.getByText('Updates Paused')).toBeTruthy()
    expect(
      screen.getByText('Updates paused since <2026-10-27T09:30:00.000Z> by Dana Ops')
    ).toBeTruthy()
    expect(screen.queryByText(/^Next check:/)).toBeNull()
    expect(
      screen.getByText(
        'Resume updates? They start again at the next check (<2026-10-27T11:17:00.000Z>).'
      )
    ).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Yes, Resume' }))
    await waitFor(() => {
      expect(resumeRun).toHaveBeenCalledTimes(1)
    })
    expect(pauseRun).not.toHaveBeenCalled()
  })

  it('falls back to the email, then to "an administrator"', () => {
    const { unmount } = render(
      <HighAvailabilityUpdates
        data={{ ...PAUSED, pausedBy: { userId: 'u1', email: 'ops@example.com', name: null } }}
      />
    )
    expect(screen.getByText(/by ops@example\.com$/)).toBeTruthy()
    unmount()
    render(<HighAvailabilityUpdates data={{ ...PAUSED, pausedBy: null }} />)
    expect(screen.getByText(/by an administrator$/)).toBeTruthy()
  })

  it('says a refused pause beside the button', async () => {
    pauseRun.mockResolvedValueOnce({ ok: false, error: 'Only instance admins can pause updates' })
    render(<HighAvailabilityUpdates data={DATA} />)
    fireEvent.click(screen.getByRole('button', { name: 'Yes, Pause' }))
    expect(await screen.findByText('Only instance admins can pause updates')).toBeTruthy()
  })

  it('explains that leftover steps are waiting on offline servers', () => {
    useUpgradeActiveRun.mockReturnValue({
      data: {
        run: {
          id: 'run-1',
          status: 'running',
          steps: [{ status: 'done' }, { status: 'waiting', connected: false, attempts: 0 }],
        },
      },
    })
    render(<HighAvailabilityUpdates data={DATA} />)
    expect(screen.getByText('Updating…')).toBeTruthy()
    expect(
      screen.getByText(
        /1 server is offline, so this update is waiting for it. It is skipped if it stays offline/
      )
    ).toBeTruthy()
  })

  it('labels its controls in title case', () => {
    render(<HighAvailabilityUpdates data={DATA} />)
    for (const title of ['Status', 'Control Plane', 'Connected Daemons']) {
      expect(screen.getByRole('heading', { name: title })).toBeTruthy()
    }
    expect(screen.getByRole('button', { name: 'Check Now' })).toBeTruthy()
  })
})

describe('Check Now', () => {
  beforeEach(idleQueries)

  it('only checks: it says so and shows the last check', async () => {
    render(<HighAvailabilityUpdates data={{ ...DATA, lastCheckAt: '2026-10-27T10:17:00.000Z' }} />)
    expect(screen.getByText('Last checked <2026-10-27T10:17:00.000Z>')).toBeTruthy()
    expect(
      screen.getByText(
        'Check Now only looks for new builds. The next scheduled check starts the update.'
      )
    ).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Check Now' }))
    await waitFor(() => {
      expect(checkRun).toHaveBeenCalledTimes(1)
    })
    expect(pauseRun).not.toHaveBeenCalled()
    expect(resumeRun).not.toHaveBeenCalled()
  })

  it('says when to try again after a check under a minute ago, and stays usable', async () => {
    checkRun.mockResolvedValueOnce({
      ok: false,
      error: 'too soon',
      cause: new UpdateCheckTooSoonError('too soon', 42),
    })
    render(<HighAvailabilityUpdates data={DATA} />)
    fireEvent.click(screen.getByRole('button', { name: 'Check Now' }))
    expect(await screen.findByText('Checked a moment ago. Try again in 42 seconds.')).toBeTruthy()
    const button = screen.getByRole('button', { name: 'Check Now' }) as HTMLButtonElement
    expect(button.disabled).toBe(false)
    fireEvent.click(button)
    await waitFor(() => {
      expect(checkRun).toHaveBeenCalledTimes(2)
    })
  })

  it('names the check interval when it is not an hour', () => {
    render(<HighAvailabilityUpdates data={{ ...DATA, checkIntervalMinutes: 5 }} />)
    expect(screen.getByText(/TurboPanel checks every 5 minutes/)).toBeTruthy()
  })
})
