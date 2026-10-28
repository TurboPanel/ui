// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { InstanceUpdates } from '@/lib/instance-api'
import { SelfHostedUpdates } from './self-hosted-updates'

type MockProps = {
  label?: string
  title?: string
  body?: string
  prompt?: string
  confirmLabel?: string
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
  Button: (props: MockProps) => <button type="button">{props.label}</button>,
  ConfirmButton: (props: MockProps) => (
    <div>
      <button type="button">{props.label}</button>
      <span>{props.prompt}</span>
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
  StatusDot: () => <span />,
}))

vi.mock('@/components/admin/updates/console-build', () => ({
  readConsoleBuild: () => ({ version: '1.0.0', commit: 'ui-old' }),
}))
vi.mock('@/components/admin/updates/upgrade-build-block', () => ({
  UpgradeBuildBlock: (props: MockProps) => <div>{props.title}</div>,
}))
vi.mock('@/components/admin/updates/upgrade-step-tracker', () => ({
  UpgradeStepTracker: (props: MockProps) => <div>{props.title}</div>,
}))
vi.mock('@/components/admin/updates/control-plane-recovery-block', () => ({
  ControlPlaneRecoveryBlock: (props: { recovery: { runId: string } | null | undefined }) =>
    props.recovery ? <div>Recovery for {props.recovery.runId}</div> : null,
}))
vi.mock('@/components/admin/updates/upgrade-failure-notice', () => ({
  UpgradeFailureNotice: () => <div data-testid="failure" />,
}))
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
vi.mock('@/lib/format-datetime', () => ({
  formatLocalDateTime: (iso: string) => `<${iso}>`,
}))

const queries = vi.hoisted(() => ({
  useUpgradeActiveRun: vi.fn(),
  useUpgradeHistory: vi.fn(),
  useUpgradeServersPage: vi.fn(),
  useUpgradeSettings: vi.fn(),
  useSaveUpgradeSettings: vi.fn(),
  usePauseUpdates: vi.fn(),
  useResumeUpdates: vi.fn(),
  useCheckForUpdates: vi.fn(),
}))
vi.mock('@/lib/queries/admin', () => queries)

const TARGET = {
  commit: 'cp-new',
  buildId: 'b-1',
  builtAt: '2026-10-27T08:00:00.000Z',
  channel: 'release',
  manifestUrl: 'https://example.com/manifest.json',
  version: '1.0.1',
}

const DATA: InstanceUpdates = {
  ok: true,
  channel: 'release',
  runtime: 'deno',
  automatic: true,
  updatesPaused: false,
  nextCheckAt: '2026-10-27T11:17:00.000Z',
  units: {
    instance: {
      installed: { version: '1.0.0', commit: 'cp-old' },
      target: TARGET,
      uiTarget: null,
      updateAvailable: true,
    },
    daemon: {
      installed: { version: '1.0.1', commit: 'cp-new' },
      target: null,
      serverId: 's-1',
      connected: true,
      updateAvailable: false,
    },
  },
}

beforeEach(() => {
  queries.useUpgradeActiveRun.mockReturnValue({ data: { run: null } })
  queries.useUpgradeHistory.mockReturnValue({ data: { runs: [] } })
  queries.useUpgradeServersPage.mockReturnValue({ data: { servers: [], total: 0 } })
  queries.useUpgradeSettings.mockReturnValue({ data: { settings: null }, isLoading: false })
  queries.useSaveUpgradeSettings.mockReturnValue({ mutate: vi.fn(), isPending: false })
  queries.usePauseUpdates.mockReturnValue({ run: vi.fn(), isPending: false })
  queries.useResumeUpdates.mockReturnValue({ run: vi.fn(), isPending: false })
  queries.useCheckForUpdates.mockReturnValue({ run: vi.fn(), isPending: false })
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('SelfHostedUpdates', () => {
  it('has no Update TurboPanel, Update Now or Cancel button; only Check Now and Pause All Updates', () => {
    render(<SelfHostedUpdates data={DATA} />)
    for (const name of ['Update TurboPanel', 'Update now', 'Update Now', 'Cancel update']) {
      expect(screen.queryByRole('button', { name })).toBeNull()
    }
    expect(screen.getByRole('button', { name: 'Check Now' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Pause All Updates' })).toBeTruthy()
    for (const title of ['Control Plane', 'Web Interface', 'Co-located Daemon']) {
      expect(screen.getByText(title)).toBeTruthy()
    }
    expect(screen.queryByText(/Auto-update/)).toBeNull()
  })

  it('names what waits and when it starts', () => {
    render(<SelfHostedUpdates data={DATA} />)
    expect(screen.getByText('Update Waiting')).toBeTruthy()
    expect(
      screen.getByText(
        'Waiting to update: control plane v1.0.1. It starts on its own at the next check.'
      )
    ).toBeTruthy()
    expect(screen.getByText('Next Check: <2026-10-27T11:17:00.000Z>')).toBeTruthy()
  })

  it('says it is up to date when the control plane says nothing waits', () => {
    render(<SelfHostedUpdates data={{ ...DATA, updateWaiting: false }} />)
    expect(screen.getByText('TurboPanel is up to date')).toBeTruthy()
    expect(screen.queryByText(/^Waiting to update/)).toBeNull()
  })

  it('leads with the pause, even while an update is waiting', () => {
    render(
      <SelfHostedUpdates
        data={{
          ...DATA,
          updatesPaused: true,
          pausedAt: '2026-10-27T09:30:00.000Z',
          pausedBy: { userId: null, email: null, name: 'Sam' },
        }}
      />
    )
    expect(screen.getByText('Updates Paused')).toBeTruthy()
    expect(screen.getByText('Updates paused since <2026-10-27T09:30:00.000Z> by Sam')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Resume Updates' })).toBeTruthy()
  })

  it('shows the backup and rollback command while a control plane install waits', () => {
    const recovery = { runId: 'run-42', backupPath: '/b', rollbackCommand: 'recover run-42' }
    const { unmount } = render(
      <SelfHostedUpdates data={{ ...DATA, controlPlaneRecovery: recovery }} />
    )
    expect(screen.getByText('Recovery for run-42')).toBeTruthy()
    unmount()
    render(<SelfHostedUpdates data={{ ...DATA, controlPlaneRecovery: null }} />)
    expect(screen.queryByText(/Recovery for/)).toBeNull()
  })
})
