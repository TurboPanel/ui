// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { applyScenario, env, SCENARIOS, styleOf } from '@/components/ui/v4/rn-stub'
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
// The real buttons and confirmation; only the card frame is a stand-in, so a
// test can tell the header slot (it does not shrink) from the card body.
vi.mock('@/components/ui', async () => ({
  Button: (await import('@/components/ui/button')).Button,
  ConfirmButton: (await import('@/components/ui/confirm-button')).ConfirmButton,
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

const { checkRun, updateNowRun, updateNowState, auth } = vi.hoisted(() => ({
  checkRun: vi.fn(),
  updateNowRun: vi.fn(),
  updateNowState: { isPending: false },
  auth: { superadmin: true },
}))
vi.mock('@/lib/auth-context', () => ({
  useAuth: () => ({ session: { superadmin: auth.superadmin } }),
  isSuperadminSession: (session: { superadmin: boolean } | null) => session?.superadmin === true,
}))
vi.mock('@/lib/queries/admin', () => ({
  useCheckForUpdates: () => ({ run: checkRun, isPending: false }),
  useUpdateNow: () => ({ run: updateNowRun, isPending: updateNowState.isPending }),
  usePauseUpdates: () => ({ run: vi.fn(), isPending: false }),
  useResumeUpdates: () => ({ run: vi.fn(), isPending: false }),
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

const PAUSE_PROMPT = /^Pause all updates\? Nothing new starts until you resume/

function renderPanel(data: InstanceUpdates = DATA) {
  return render(<UpdatesStatusPanel data={data} headline="up_to_date" waiting={null} />)
}

/** Arm the confirmation, past the press guard, the way a person would. */
function armPause() {
  fireEvent.click(screen.getByRole('button', { name: 'Pause All Updates' }))
}

beforeEach(() => {
  checkRun.mockResolvedValue({ ok: true, value: DATA })
  updateNowRun.mockResolvedValue({ ok: true, value: { ok: true, runId: 'run-1' } })
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

    it('keeps the controls and the open confirmation out of the header slot', () => {
      renderPanel()
      const header = screen.getByTestId('panel-header')
      const body = screen.getByTestId('panel-body')
      expect(header.textContent).toBe('Status')
      expect(body.contains(screen.getByRole('button', { name: 'Check Now' }))).toBe(true)
      armPause()
      const prompt = screen.getByText(PAUSE_PROMPT)
      expect(body.contains(prompt)).toBe(true)
      expect(header.textContent).toBe('Status')
    })

    it('gives the question its own full-width line under the buttons', () => {
      renderPanel()
      armPause()
      const prompt = screen.getByText(PAUSE_PROMPT)
      const stack = prompt.parentElement as HTMLElement
      expect(styleOf(stack).flexDirection).toBe('column-reverse')
      expect(styleOf(stack).alignSelf).toBe('stretch')
      expect(styleOf(stack.parentElement).alignSelf).toBe('stretch')
      expect(stack.contains(screen.getByRole('button', { name: 'Yes, Pause' }))).toBe(true)
    })
  })
})

describe('Status card when the window is resized', () => {
  it('keeps an open confirmation open', () => {
    env.width = 1024
    const { rerender } = renderPanel()
    armPause()
    env.width = 360
    rerender(<UpdatesStatusPanel data={DATA} headline="up_to_date" waiting={null} />)
    expect(screen.getByText(PAUSE_PROMPT)).toBeTruthy()
    env.width = 1400
    rerender(<UpdatesStatusPanel data={{ ...DATA }} headline="up_to_date" waiting={null} />)
    expect(screen.getByText(PAUSE_PROMPT)).toBeTruthy()
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
      screen.getByText('Updates are paused. Nothing new starts until they are resumed.')
    ).toBeTruthy()
    expect(screen.queryByText(/install on their own/)).toBeNull()
    expect(screen.queryByText(/^Next Check/)).toBeNull()
    expect(screen.getByText(/Nothing starts until updates are resumed/)).toBeTruthy()
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
    expect(screen.getByText(/Update Now installs a newer build right away/)).toBeTruthy()
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

  it('is disabled while an update runs', () => {
    renderPanel({ ...DATA, activeRunId: 'run-1' })
    expect(updateNowButton().disabled).toBe(true)
    expect(screen.queryByText('Resume updates to update now.')).toBeNull()
  })

  it('is disabled while paused, with a hint to resume', () => {
    renderPanel({ ...DATA, updatesPaused: true })
    expect(updateNowButton().disabled).toBe(true)
    expect(screen.getByText('Resume updates to update now.')).toBeTruthy()
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
