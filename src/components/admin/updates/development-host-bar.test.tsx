// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DevHostJob, DevHostPart, DevHostView } from '@/lib/instance-api'
import { DevelopmentHostBar } from './development-host-bar'

type ButtonProps = { label: string; disabled?: boolean; onPress?: () => void }

vi.mock('react-native', async () => (await import('@/components/ui/v4/rn-stub')).reactNativeStub)
vi.mock('react-native-svg', async () => (await import('@/components/ui/v4/rn-stub')).svgStub)
vi.mock(
  '@/lib/theme-preference',
  async () => (await import('@/components/ui/v4/rn-stub')).themePreferenceStub
)
vi.mock('@/components/ui', () => ({
  Button: (props: ButtonProps) => (
    <button type="button" disabled={props.disabled} onClick={props.onPress}>
      {props.label}
    </button>
  ),
}))
vi.mock('@/components/admin/updates/console-build', () => ({ readConsoleBuild: () => null }))

const state = vi.hoisted(() => ({
  role: 'superadmin',
  runtime: 'deno' as string | undefined,
  development: true,
  view: undefined as Record<string, unknown> | undefined,
  isError: false,
  failureCount: 0,
  errorUpdatedAt: 0,
  dataUpdatedAt: 0,
  developmentEnabled: undefined as boolean | undefined,
  run: vi.fn(),
  isPending: false,
}))

vi.mock('@/lib/auth-context', () => ({
  useAuth: () => ({ session: { role: state.role } }),
  isAdminSession: (s: { role: string }) => s.role === 'admin' || s.role === 'superadmin',
  isSuperadminSession: (s: { role: string }) => s.role === 'superadmin',
}))
vi.mock('@/lib/queries/auth', () => ({
  useInstallStatusQuery: () => ({ data: { runtime: state.runtime } }),
}))
vi.mock('@/lib/queries/admin', () => ({
  useInstanceUpdates: () => ({ data: { development: state.development } }),
  useDevelopmentUpdates: (options: { enabled: boolean }) => {
    state.developmentEnabled = options.enabled
    return {
      data: options.enabled ? state.view : undefined,
      isError: state.isError,
      failureCount: state.failureCount,
      dataUpdatedAt: state.dataUpdatedAt || Date.now(),
      errorUpdatedAt: state.errorUpdatedAt,
    }
  },
  useDevelopmentHostAction: () => ({ run: state.run, isPending: state.isPending }),
}))

function part(overrides: Partial<DevHostPart> = {}): DevHostPart {
  return {
    name: 'control-plane',
    unit: 'turbopanel-instance.service',
    branch: 'trunk',
    onTrunk: true,
    headCommit: 'abc',
    runningCommit: 'abc',
    behindBy: 0,
    dirty: { files: 0, blocking: false, kinds: [] },
    restartNeeded: false,
    setupNeeded: {},
    active: true,
    ...overrides,
  }
}

function job(overrides: Partial<DevHostJob> = {}): DevHostJob {
  return {
    id: 'h1',
    action: 'update',
    state: 'running',
    step: 'pull',
    steps: [
      { name: 'fetch', state: 'done' },
      { name: 'pull', state: 'running' },
    ],
    startedAt: new Date().toISOString(),
    endedAt: null,
    logTail: [],
    ...overrides,
  }
}

function setHost(
  host: Partial<DevHostView> | null,
  pushState: string | null = null,
  extra: Record<string, unknown> = {}
) {
  state.view = {
    ...extra,
    ok: true,
    job: pushState ? { id: 'p1', state: pushState, servers: [] } : null,
    host: host ? { parts: [], lastFetchAt: null, job: null, migrate: null, ...host } : null,
  }
}

beforeEach(() => {
  state.role = 'superadmin'
  state.runtime = 'deno'
  state.development = true
  state.isError = false
  state.failureCount = 0
  state.errorUpdatedAt = 0
  state.dataUpdatedAt = 0
  state.isPending = false
  state.developmentEnabled = undefined
  state.run.mockReset()
  setHost({
    parts: [
      part({ behindBy: 3, setupNeeded: { migrate: { pending: 1 } } }),
      part({ name: 'daemon', restartNeeded: true }),
      part({ name: 'website', behindBy: 1, dirty: { files: 1, blocking: true, kinds: [] } }),
      part({ name: 'web-interface' }),
    ],
  })
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('when the bar shows', () => {
  it('never reads the development view for a plain admin', () => {
    state.role = 'admin'
    render(<DevelopmentHostBar />)
    expect(state.developmentEnabled).toBe(false)
    expect(screen.queryByText('Development Host')).toBeNull()
  })

  it('is hidden on a release install', () => {
    state.development = false
    render(<DevelopmentHostBar />)
    expect(state.developmentEnabled).toBe(false)
    expect(screen.queryByText('Development Host')).toBeNull()
  })

  it('is hidden when nothing needs doing or the daemon sent no status', () => {
    setHost({ parts: [part()] })
    const { rerender } = render(<DevelopmentHostBar />)
    expect(screen.queryByText('Development Host')).toBeNull()
    setHost(null)
    rerender(<DevelopmentHostBar />)
    expect(screen.queryByText('Development Host')).toBeNull()
  })
})

describe('the bar', () => {
  it('shows one line per part that needs something', () => {
    render(<DevelopmentHostBar />)
    expect(screen.getByText('Development Host')).toBeTruthy()
    expect(
      screen.getByText('Control Plane: 3 new commits on trunk, 1 migration pending')
    ).toBeTruthy()
    expect(screen.getByText('Daemon: restart needed')).toBeTruthy()
    expect(screen.getByText('Website: local changes, will not pull')).toBeTruthy()
    expect(screen.queryByText(/Web Interface/)).toBeNull()
  })

  it('starts Update and Restart or Restart Only', async () => {
    state.run.mockResolvedValue({
      ok: true,
      value: { ok: true, job: { id: 'h1', action: 'update' } },
    })
    render(<DevelopmentHostBar />)
    fireEvent.click(screen.getByRole('button', { name: 'Update and Restart' }))
    await waitFor(() => {
      expect(state.run).toHaveBeenCalledWith('update')
    })
    fireEvent.click(screen.getByRole('button', { name: 'Restart Only' }))
    await waitFor(() => {
      expect(state.run).toHaveBeenCalledWith('restart')
    })
  })

  it('says why an action was refused', async () => {
    state.run.mockResolvedValueOnce({ ok: true, value: { ok: false, error: 'job_running' } })
    render(<DevelopmentHostBar />)
    fireEvent.click(screen.getByRole('button', { name: 'Update and Restart' }))
    expect(
      await screen.findByText('An update, restart or build and push is already running.')
    ).toBeTruthy()
    state.run.mockResolvedValueOnce({
      ok: true,
      value: { ok: false, error: 'daemon_unavailable' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Restart Only' }))
    expect(
      await screen.findByText('The daemon on this server is not reachable. Try again in a moment.')
    ).toBeTruthy()
    state.run.mockResolvedValueOnce({ ok: false, error: 'Network down', cause: undefined })
    fireEvent.click(screen.getByRole('button', { name: 'Restart Only' }))
    expect(await screen.findByText('Network down')).toBeTruthy()
  })

  it('disables both buttons while a build and push runs or a start is in flight', () => {
    setHost({ parts: [part({ behindBy: 1 })] }, 'building')
    const { rerender } = render(<DevelopmentHostBar />)
    expect(screen.getByRole('button', { name: 'Update and Restart' })).toHaveProperty(
      'disabled',
      true
    )
    expect(screen.getByRole('button', { name: 'Restart Only' })).toHaveProperty('disabled', true)
    setHost({ parts: [part({ behindBy: 1 })] })
    state.isPending = true
    rerender(<DevelopmentHostBar />)
    expect(screen.getByRole('button', { name: 'Restart Only' })).toHaveProperty('disabled', true)
  })
})

describe('job progress', () => {
  it('shows the running step and disables the buttons', () => {
    setHost({ parts: [part()], job: job() })
    render(<DevelopmentHostBar />)
    expect(screen.getByText('Pulling… (step 2 of 2)')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Update and Restart' })).toHaveProperty(
      'disabled',
      true
    )
  })

  it('reads "Control plane restarting…" while reads fail during a job', () => {
    setHost({ parts: [part()], job: job({ step: 'restart-control-plane' }) })
    state.failureCount = 1
    render(<DevelopmentHostBar />)
    expect(screen.getByText('Control plane restarting…')).toBeTruthy()
    expect(screen.queryByText(/could not/)).toBeNull()
  })

  it('shows the failed step, its detail and the log tail', () => {
    setHost({
      parts: [part()],
      job: job({
        state: 'failed',
        step: 'migrate',
        steps: [{ name: 'migrate', state: 'failed', detail: 'The backup failed.' }],
        endedAt: new Date().toISOString(),
        logTail: ['pg_dump: error', 'exit 1'],
      }),
    })
    render(<DevelopmentHostBar />)
    expect(screen.getByText('Failed while migrating (backup first)')).toBeTruthy()
    expect(screen.getByText('The backup failed.')).toBeTruthy()
    expect(screen.getByText(/pg_dump: error/).textContent).toBe('pg_dump: error\nexit 1')
    expect(screen.getByRole('button', { name: 'Update and Restart' })).toHaveProperty(
      'disabled',
      false
    )
  })

  it('a failure with no detail or output shows the step alone', () => {
    setHost({
      parts: [part()],
      job: job({ state: 'failed', step: 'pull', steps: [], endedAt: new Date().toISOString() }),
    })
    render(<DevelopmentHostBar />)
    expect(screen.getByText('Failed while pulling')).toBeTruthy()
  })

  it('reads Updated after a finished job while a part still needs something', () => {
    setHost({
      parts: [part({ name: 'daemon', restartNeeded: true })],
      job: job({ state: 'done', endedAt: new Date().toISOString() }),
    })
    render(<DevelopmentHostBar />)
    expect(screen.getByText('Updated')).toBeTruthy()
  })

  it('an old finished job adds no line', () => {
    setHost({
      parts: [part({ name: 'daemon', restartNeeded: true })],
      job: job({ state: 'done', endedAt: '2020-01-01T00:00:00Z' }),
    })
    render(<DevelopmentHostBar />)
    expect(screen.queryByText('Updated')).toBeNull()
    expect(screen.getByText('Daemon: restart needed')).toBeTruthy()
  })

  it('waits for the daemon to reconnect while the restarted control plane has no host', () => {
    setHost({ parts: [part()], job: job({ step: 'restart-control-plane' }) }, null, {
      hostCarry: { jobId: 'h1', since: 0, reason: 'host-missing', expired: false },
    })
    render(<DevelopmentHostBar />)
    expect(screen.getByText('Waiting for the daemon to reconnect…')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Restart Only' })).toHaveProperty('disabled', true)
  })

  it('points at the Developer Console after the wait expired, and unlocks the buttons', () => {
    setHost({ parts: [part()], job: job() }, null, {
      hostCarry: { jobId: 'h1', since: 0, reason: 'host-missing', expired: true },
    })
    render(<DevelopmentHostBar />)
    expect(screen.getByText(/Check the services in the Developer Console/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Restart Only' })).toHaveProperty('disabled', false)
  })

  it('points at the Developer Console when reads fail for more than 3 minutes', () => {
    setHost({ parts: [part()], job: job() })
    state.isError = true
    state.dataUpdatedAt = 1_000
    state.errorUpdatedAt = 1_000 + 3 * 60_000 + 1
    render(<DevelopmentHostBar />)
    expect(screen.getByText(/Check the services in the Developer Console/)).toBeTruthy()
  })

  it('keeps the bar up for a minute after a finished job, then hides it', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
    vi.setSystemTime(Date.parse('2026-11-03T12:00:00Z'))
    setHost({
      parts: [part()],
      job: job({ state: 'done', endedAt: '2026-11-03T12:00:00Z' }),
    })
    render(<DevelopmentHostBar />)
    expect(screen.getByText('Updated')).toBeTruthy()
    act(() => {
      vi.advanceTimersByTime(61_000)
    })
    expect(screen.queryByText('Updated')).toBeNull()
    expect(screen.queryByText('Development Host')).toBeNull()
  })
})
