// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { applyScenario, env, SCENARIOS } from '@/components/ui/v4/rn-stub'
import {
  UpdateCheckTooSoonError,
  UpdateNowRefusedError,
  type InstanceUpdates,
} from '@/lib/instance-api'
import { UpdatesStatusPanel } from './updates-status-panel'

type MockProps = { title?: string; headerRight?: ReactNode; children?: ReactNode }

vi.mock('react-native', async () => (await import('@/components/ui/v4/rn-stub')).reactNativeStub)
vi.mock('react-native-svg', async () => (await import('@/components/ui/v4/rn-stub')).svgStub)
vi.mock(
  '@/lib/theme-preference',
  async () => (await import('@/components/ui/v4/rn-stub')).themePreferenceStub
)
// The real buttons, switch and dialog; only the card frame is a stand-in, so
// a test can tell the header slot (it does not shrink) from the card body.
vi.mock('@/components/ui', async () => ({
  Button: (await import('@/components/ui/button')).Button,
  ButtonRow: (await import('@/components/ui/button')).ButtonRow,
  ModalSheet: (await import('@/components/ui/modal-sheet')).ModalSheet,
  SettingRow: (await import('@/components/ui/setting-row')).SettingRow,
  Toggle: (await import('@/components/ui/toggle')).Toggle,
  SectionPanel: (props: MockProps) => (
    <section>
      <header data-testid="panel-header">
        <h2>{props.title}</h2>
        {props.headerRight}
      </header>
      <div data-testid="panel-body">{props.children}</div>
    </section>
  ),
  StatusDot: () => <span />,
}))
vi.mock('@/components/admin/updates/console-build', () => ({ readConsoleBuild: () => null }))
vi.mock('@/lib/format-datetime', () => ({
  formatLocalDateTime: (iso: string) => `<${iso}>`,
}))

const { checkRun, updateNowRun, updateNowState, pauseRun, resumeRun, auth } = vi.hoisted(() => ({
  checkRun: vi.fn(),
  updateNowRun: vi.fn(),
  updateNowState: { isPending: false },
  pauseRun: vi.fn(),
  resumeRun: vi.fn(),
  auth: { superadmin: true },
}))
vi.mock('@/lib/auth-context', () => ({
  useAuth: () => ({ session: { superadmin: auth.superadmin } }),
  isSuperadminSession: (session: { superadmin: boolean } | null) => session?.superadmin === true,
}))
vi.mock('@/lib/queries/admin', () => ({
  useCheckForUpdates: () => ({ run: checkRun, isPending: false }),
  useUpdateNow: () => ({ run: updateNowRun, isPending: updateNowState.isPending }),
  usePauseUpdates: () => ({ run: pauseRun, isPending: false }),
  useResumeUpdates: () => ({ run: resumeRun, isPending: false }),
}))

const DATA = {
  ok: true,
  channel: 'release',
  updatesPaused: false,
  checkIntervalMinutes: 5,
  lastCheckAt: '2026-10-27T11:12:00.000Z',
  nextCheckAt: '2026-10-27T11:17:00.000Z',
  units: {},
} as unknown as InstanceUpdates

const PAUSE_DIALOG_LINE = /^An update already in progress is not stopped\./

function renderPanel(data: InstanceUpdates = DATA) {
  return render(<UpdatesStatusPanel data={data} headline="up_to_date" waiting={null} />)
}

function pauseSwitch(): HTMLElement {
  return screen.getByRole('switch', { name: 'Pause All Updates' })
}

beforeEach(() => {
  checkRun.mockResolvedValue({ ok: true, value: DATA })
  updateNowRun.mockResolvedValue({ ok: true, value: { ok: true, runId: 'run-1' } })
  pauseRun.mockResolvedValue({ ok: true, value: { updatesPaused: true } })
  resumeRun.mockResolvedValue({ ok: true, value: { updatesPaused: false } })
  updateNowState.isPending = false
  auth.superadmin = true
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  vi.useRealTimers()
  applyScenario(SCENARIOS[0])
})

describe.each(SCENARIOS)('Status card layout ($name)', (scenario) => {
  describe.each([1024, 360])('at %i px', (width) => {
    beforeEach(() => {
      applyScenario(scenario)
      env.width = width
    })

    it('keeps the controls out of the header slot', () => {
      renderPanel()
      const header = screen.getByTestId('panel-header')
      const body = screen.getByTestId('panel-body')
      expect(header.textContent).toBe('Status')
      expect(body.contains(screen.getByRole('button', { name: 'Check Now' }))).toBe(true)
      expect(body.contains(pauseSwitch())).toBe(true)
    })
  })
})

describe('Pause All Updates switch', () => {
  it('is a switch, off while updates run, with a note saying so', () => {
    renderPanel()
    expect(pauseSwitch().getAttribute('aria-checked')).toBe('false')
    expect(screen.queryByRole('button', { name: 'Pause All Updates' })).toBeNull()
    expect(screen.getByText('Updates start on their own.')).toBeTruthy()
  })

  it('asks first when turned on, explaining what a pause does and does not do', async () => {
    renderPanel()
    fireEvent.click(pauseSwitch())
    expect(pauseRun).not.toHaveBeenCalled()
    expect(screen.getByText('Pause All Updates?')).toBeTruthy()
    expect(screen.getByText(PAUSE_DIALOG_LINE)).toBeTruthy()
    expect(screen.getByText(/not at the scheduled check, and not with Update Now/)).toBeTruthy()
    expect(screen.getByText(/^Turning this off starts nothing right away\./)).toBeTruthy()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Pause Updates' }))
      await Promise.resolve()
    })
    expect(pauseRun).toHaveBeenCalledTimes(1)
    expect(resumeRun).not.toHaveBeenCalled()
    expect(screen.queryByText(PAUSE_DIALOG_LINE)).toBeNull()
  })

  it('pauses nothing when the dialog is cancelled', () => {
    renderPanel()
    fireEvent.click(pauseSwitch())
    fireEvent.click(screen.getAllByRole('button', { name: 'Cancel' }).at(-1) as HTMLElement)
    expect(screen.queryByText(PAUSE_DIALOG_LINE)).toBeNull()
    expect(pauseRun).not.toHaveBeenCalled()
    expect(pauseSwitch().getAttribute('aria-checked')).toBe('false')
  })

  it('says a refused pause in the card', async () => {
    pauseRun.mockResolvedValueOnce({ ok: false, error: 'HTTP 500: broken' })
    renderPanel()
    fireEvent.click(pauseSwitch())
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Pause Updates' }))
      await Promise.resolve()
    })
    expect(screen.getByText(/HTTP 500|Could not pause updates/)).toBeTruthy()
  })

  it('says a refused turn off in the card', async () => {
    resumeRun.mockResolvedValueOnce({ ok: false, error: 'HTTP 500: broken' })
    renderPanel({ ...DATA, updatesPaused: true })
    await act(async () => {
      fireEvent.click(pauseSwitch())
      await Promise.resolve()
    })
    expect(screen.getByText(/HTTP 500|Could not turn off Pause All Updates/)).toBeTruthy()
  })

  it('sends pause once when the dialog button is tapped twice before it shows busy', async () => {
    let finish: (value: unknown) => void = () => undefined
    pauseRun.mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve
      })
    )
    renderPanel()
    fireEvent.click(pauseSwitch())
    await act(async () => {
      const button = screen.getByRole('button', { name: 'Pause Updates' })
      fireEvent.click(button)
      fireEvent.click(button)
      await Promise.resolve()
    })
    expect(pauseRun).toHaveBeenCalledTimes(1)
    await act(async () => {
      finish({ ok: true, value: { updatesPaused: true } })
      await Promise.resolve()
    })
    expect(pauseRun).toHaveBeenCalledTimes(1)
  })

  it('turns off at once while paused, with no dialog', async () => {
    renderPanel({ ...DATA, updatesPaused: true })
    expect(pauseSwitch().getAttribute('aria-checked')).toBe('true')
    expect(
      screen.getByText(
        'No update starts. Turning this off starts nothing right away; the next check or Update Now does.'
      )
    ).toBeTruthy()
    await act(async () => {
      fireEvent.click(pauseSwitch())
      await Promise.resolve()
    })
    expect(resumeRun).toHaveBeenCalledTimes(1)
    expect(pauseRun).not.toHaveBeenCalled()
    expect(screen.queryByText(PAUSE_DIALOG_LINE)).toBeNull()
  })

  it('sends resume once when the switch is tapped twice before it shows busy', async () => {
    let finish: (value: unknown) => void = () => undefined
    resumeRun.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve
      })
    )
    renderPanel({ ...DATA, updatesPaused: true })
    await act(async () => {
      fireEvent.click(pauseSwitch())
      fireEvent.click(pauseSwitch())
      await Promise.resolve()
    })
    expect(resumeRun).toHaveBeenCalledTimes(1)
    await act(async () => {
      finish({ ok: true, value: { updatesPaused: false } })
      await Promise.resolve()
    })
    // Once the first request has settled, the switch works again.
    await act(async () => {
      fireEvent.click(pauseSwitch())
      await Promise.resolve()
    })
    expect(resumeRun).toHaveBeenCalledTimes(2)
  })
})

describe('Status card words', () => {
  it('labels the last and next check in title case and follows the interval', () => {
    renderPanel()
    expect(screen.getByText('Last Checked: <2026-10-27T11:12:00.000Z>')).toBeTruthy()
    expect(screen.getByText('Next Check: <2026-10-27T11:17:00.000Z>')).toBeTruthy()
    expect(
      screen.getByText('Updates install on their own: TurboPanel checks every 5 minutes.')
    ).toBeTruthy()
  })

  it('while paused says nothing new starts, not that updates install on their own', () => {
    renderPanel({ ...DATA, updatesPaused: true })
    expect(
      screen.getByText(
        'Updates are paused. Nothing new starts until Pause All Updates is turned off.'
      )
    ).toBeTruthy()
    expect(screen.queryByText(/install on their own/)).toBeNull()
    expect(screen.queryByText(/^Next Check/)).toBeNull()
    expect(screen.getByText('Check Now only looks for new builds.')).toBeTruthy()
  })
})

describe('Check Now refusals', () => {
  it('says a refused check in the body and clears "Checked a moment ago" after the wait', async () => {
    vi.useFakeTimers()
    checkRun.mockResolvedValueOnce({
      ok: false,
      error: 'too soon',
      cause: new UpdateCheckTooSoonError('too soon', 2),
    })
    renderPanel()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Check Now' }))
      await Promise.resolve()
    })
    const message = screen.getByText('Checked a moment ago. Try again in 2 seconds.')
    expect(screen.getByTestId('panel-body').contains(message)).toBe(true)
    act(() => {
      vi.advanceTimersByTime(2_000)
    })
    expect(screen.queryByText(/Checked a moment ago/)).toBeNull()
  })
})

function updateNowButton(): HTMLButtonElement {
  return screen.getByRole('button', { name: 'Update Now' }) as HTMLButtonElement
}

async function pressUpdateNow() {
  await act(async () => {
    fireEvent.click(updateNowButton())
    await Promise.resolve()
  })
}

describe('Update Now', () => {
  it('sits beside Check Now for a superadmin on a release install and starts the update', async () => {
    renderPanel()
    const button = updateNowButton()
    expect(button.disabled).toBe(false)
    expect(button.parentElement?.contains(screen.getByRole('button', { name: 'Check Now' }))).toBe(
      true
    )
    expect(screen.getByText(/Update Now installs a waiting build right away/)).toBeTruthy()
    await pressUpdateNow()
    expect(updateNowRun).toHaveBeenCalledTimes(1)
    // A started run shows through the status and the run view, not a note.
    expect(screen.queryByText('Already up to date.')).toBeNull()
  })

  it('is not offered to a plain administrator or on a development install', () => {
    auth.superadmin = false
    renderPanel()
    expect(screen.queryByRole('button', { name: 'Update Now' })).toBeNull()
    expect(screen.getByText(/The next scheduled check starts the update/)).toBeTruthy()
    cleanup()
    auth.superadmin = true
    renderPanel({ ...DATA, development: true })
    expect(screen.queryByRole('button', { name: 'Update Now' })).toBeNull()
  })

  it('is usable when something waits to install', () => {
    renderPanel({ ...DATA, updateWaiting: true })
    expect(updateNowButton().disabled).toBe(false)
    expect(screen.queryByText(/Everything is up to date/)).toBeNull()
  })

  it('is disabled when nothing waits to install, and says so', () => {
    renderPanel({ ...DATA, updateWaiting: false })
    expect(updateNowButton().disabled).toBe(true)
    expect(
      screen.getByText('Everything is up to date. Check Now looks for newer builds.')
    ).toBeTruthy()
  })

  it('is disabled while an update runs, even with something waiting', () => {
    renderPanel({ ...DATA, updateWaiting: true, activeRunId: 'run-1' })
    expect(updateNowButton().disabled).toBe(true)
    expect(screen.getByText('An update is in progress.')).toBeTruthy()
  })

  it('is disabled while paused, with a hint to turn the pause off', () => {
    renderPanel({ ...DATA, updateWaiting: true, updatesPaused: true })
    expect(updateNowButton().disabled).toBe(true)
    expect(screen.getByText('Turn off Pause All Updates to update now.')).toBeTruthy()
  })

  it('is disabled while the request is in flight', () => {
    updateNowState.isPending = true
    renderPanel()
    expect(updateNowButton().disabled).toBe(true)
  })

  it('says when there is nothing newer to install', async () => {
    updateNowRun.mockResolvedValueOnce({ ok: true, value: { ok: true, upToDate: true } })
    renderPanel()
    await pressUpdateNow()
    expect(screen.getByText('Already up to date.')).toBeTruthy()
  })

  it('drops "Already up to date." once a run starts', async () => {
    updateNowRun.mockResolvedValueOnce({ ok: true, value: { ok: true, upToDate: true } })
    const { rerender } = renderPanel()
    await pressUpdateNow()
    expect(screen.getByText('Already up to date.')).toBeTruthy()
    rerender(
      <UpdatesStatusPanel
        data={{ ...DATA, activeRunId: 'run-3' }}
        headline="updating"
        waiting={null}
      />
    )
    expect(screen.queryByText('Already up to date.')).toBeNull()
  })

  it('says when the release server could not be reached', async () => {
    updateNowRun.mockResolvedValueOnce({
      ok: false,
      error: 'HTTP 503',
      cause: new UpdateNowRefusedError('HTTP 503', 'release_unreachable', null, null),
    })
    renderPanel()
    await pressUpdateNow()
    expect(
      screen.getByText('The release server could not be reached. Try again in a few minutes.')
    ).toBeTruthy()
    expect(screen.queryByText('Already up to date.')).toBeNull()
  })

  it('says how long to wait after a press too soon', async () => {
    updateNowRun.mockResolvedValueOnce({
      ok: false,
      error: 'HTTP 429',
      cause: new UpdateNowRefusedError('HTTP 429', 'check_too_soon', null, null, 20),
    })
    renderPanel()
    await pressUpdateNow()
    expect(screen.getByText('Wait 20 seconds before trying again.')).toBeTruthy()
  })

  it('says why it was refused', async () => {
    updateNowRun.mockResolvedValueOnce({
      ok: false,
      error: 'HTTP 409',
      cause: new UpdateNowRefusedError('HTTP 409', 'run_active', null, 'run-2'),
    })
    renderPanel()
    await pressUpdateNow()
    expect(screen.getByText('An update is already running.')).toBeTruthy()
  })

  it('falls back to the plain error when there is no cause', async () => {
    updateNowRun.mockResolvedValueOnce({ ok: false, error: 'HTTP 500: broken' })
    renderPanel()
    await pressUpdateNow()
    expect(screen.getByText(/HTTP 500|Could not start the update/)).toBeTruthy()
  })
})
