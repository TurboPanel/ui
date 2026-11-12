// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DevelopmentUpdates as DevelopmentView, InstanceUpdates } from '@/lib/instance-api'
import { DevelopmentUpdates } from './development-updates'

type MockProps = {
  label?: string
  title?: string
  disabled?: boolean
  onPress?: () => void
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
    <button type="button" disabled={props.disabled} onClick={props.onPress}>
      {props.label}
    </button>
  ),
  DataTable: (props: MockProps) => <table>{props.children}</table>,
  DataTableRow: (props: MockProps) => <div>{props.children}</div>,
  DataTableCell: (props: MockProps) => <div>{props.children}</div>,
  DataTableEmpty: (props: MockProps) => <p>{props.children}</p>,
  InlineNotice: (props: MockProps) => <p>{props.title}</p>,
  LoadingState: (props: MockProps) => <p>{props.label}</p>,
  SectionPanel: (props: MockProps) => (
    <section>
      <h2>{props.title}</h2>
      {props.children}
    </section>
  ),
}))
vi.mock('@/components/admin/updates/console-build', () => ({
  readConsoleBuild: () => ({ version: '1.0.0', commit: 'ui1234567890abc' }),
}))
vi.mock('@/lib/instance-version', () => ({ getInstanceRevision: () => null }))

const queries = vi.hoisted(() => ({
  useDevelopmentUpdates: vi.fn(),
  usePushDevelopmentDaemon: vi.fn(),
}))
vi.mock('@/lib/queries/admin', () => queries)

const auth = vi.hoisted(() => ({ role: 'superadmin' }))
vi.mock('@/lib/auth-context', () => ({
  useAuth: () => ({ session: { role: auth.role } }),
  isSuperadminSession: (s: { role: string } | null) => s?.role === 'superadmin',
}))

const DATA = {
  ok: true,
  channel: 'canary',
  development: true,
  units: {
    instance: {
      installed: { version: '0.1.5', commit: 'cp1234567890abc' },
      target: null,
      uiTarget: null,
    },
    daemon: {
      installed: { version: '0.1.5', commit: 'dm1234567890abc' },
      target: null,
      serverId: 's0',
      connected: true,
    },
  },
} as InstanceUpdates

function view(overrides: Partial<DevelopmentView> = {}): DevelopmentView {
  return {
    ok: true,
    daemonBuild: {
      built: { commit: 'dm1', buildId: 'b1', builtAt: null, source: null },
      sourceFingerprint: 'fp',
      sourceChanged: false,
    },
    servers: [
      {
        id: 's1',
        name: 'web-1',
        connected: true,
        daemonVersion: '0.1.5',
        daemonCommit: 'dm1',
        onLatestBuild: false,
      },
    ],
    job: null,
    pendingDaemonChanges: true,
    ...overrides,
  }
}

describe('DevelopmentUpdates', () => {
  beforeEach(() => {
    auth.role = 'superadmin'
    queries.useDevelopmentUpdates.mockClear()
    queries.usePushDevelopmentDaemon.mockReturnValue({ run: vi.fn(), isPending: false })
  })
  afterEach(() => {
    cleanup()
  })

  it('shows each piece running from the checkout, with no release controls', () => {
    queries.useDevelopmentUpdates.mockReturnValue({ data: view(), isLoading: false })
    render(<DevelopmentUpdates data={DATA} />)
    expect(screen.getAllByText('Running From Your Checkout')).toHaveLength(3)
    expect(screen.getByText("This Server's Daemon")).toBeTruthy()
    expect(screen.getByText('Commit cp1234567890')).toBeTruthy()
    expect(screen.getByText('Commit ui1234567890')).toBeTruthy()
    expect(screen.getByText(/never update on their own/)).toBeTruthy()
    for (const gone of ['Check Now', 'Pause All Updates', 'Up to Date', 'Not Connected']) {
      expect(screen.queryByText(gone)).toBeNull()
    }
  })

  it('lists remote servers with their status and offers Push Daemon for an unchanged build', () => {
    queries.useDevelopmentUpdates.mockReturnValue({ data: view(), isLoading: false })
    render(<DevelopmentUpdates data={DATA} />)
    expect(screen.getByText('Your Servers')).toBeTruthy()
    expect(screen.getByText('web-1')).toBeTruthy()
    expect(screen.getByText('Behind')).toBeTruthy()
    const button = screen.getByRole('button', { name: 'Push Daemon' }) as HTMLButtonElement
    expect(button.disabled).toBe(false)
  })

  it('disables the button and shows the job while it pushes', () => {
    const job = {
      id: 'j1',
      state: 'pushing' as const,
      startedAt: null,
      endedAt: null,
      message: null,
      servers: [{ id: 's1', name: 'web-1', ok: false, skipped: false, error: 'timed out' }],
    }
    queries.useDevelopmentUpdates.mockReturnValue({
      data: view({
        job,
        daemonBuild: { built: null, sourceFingerprint: 'fp', sourceChanged: true },
      }),
      isLoading: false,
    })
    render(<DevelopmentUpdates data={DATA} />)
    const button = screen.getByRole('button', {
      name: 'Build and Push Daemon',
    }) as HTMLButtonElement
    expect(button.disabled).toBe(true)
    expect(screen.getByText('Pushing…')).toBeTruthy()
    expect(screen.getByText('timed out')).toBeTruthy()
  })

  it('disables the push while an update and restart runs on this server', () => {
    queries.useDevelopmentUpdates.mockReturnValue({
      data: view({
        host: {
          parts: [],
          lastFetchAt: null,
          migrate: null,
          job: {
            id: 'h1',
            action: 'update',
            state: 'running',
            step: 'pull',
            steps: [],
            startedAt: '2026-11-03T12:00:00Z',
            endedAt: null,
            logTail: [],
          },
        },
      }),
      isLoading: false,
    })
    render(<DevelopmentUpdates data={DATA} />)
    const button = screen.getByRole('button', { name: 'Push Daemon' }) as HTMLButtonElement
    expect(button.disabled).toBe(true)
  })

  it('says either job may hold a refused push back', async () => {
    const run = vi.fn().mockResolvedValue({ ok: true, value: { ok: false, error: 'job_running' } })
    queries.usePushDevelopmentDaemon.mockReturnValue({ run, isPending: false })
    queries.useDevelopmentUpdates.mockReturnValue({ data: view(), isLoading: false })
    render(<DevelopmentUpdates data={DATA} />)
    fireEvent.click(screen.getByRole('button', { name: 'Push Daemon' }))
    expect(
      await screen.findByText('A build and push or an update and restart is already running.')
    ).toBeTruthy()
  })

  it('shows a plain admin the versions but not the build and push card', () => {
    auth.role = 'admin'
    queries.useDevelopmentUpdates.mockReturnValue({ data: view(), isLoading: false })
    render(<DevelopmentUpdates data={DATA} />)
    expect(screen.getAllByText('Running From Your Checkout')).toHaveLength(3)
    expect(screen.getByText('Only a superadmin can build and push the daemon.')).toBeTruthy()
    expect(screen.queryByText('Your Servers')).toBeNull()
    expect(queries.useDevelopmentUpdates).not.toHaveBeenCalled()
  })

  it('says so when no other server is connected', () => {
    queries.useDevelopmentUpdates.mockReturnValue({
      data: view({ servers: [] }),
      isLoading: false,
    })
    render(<DevelopmentUpdates data={DATA} />)
    expect(screen.getByText('No other servers are connected.')).toBeTruthy()
  })
})
