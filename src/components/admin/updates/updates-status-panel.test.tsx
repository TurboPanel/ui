// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { applyScenario, env, SCENARIOS } from '@/components/ui/v4/rn-stub'
import { UpdateCheckTooSoonError, type InstanceUpdates } from '@/lib/instance-api'
import { UpdatesStatusPanel } from './updates-status-panel'

type MockProps = {
  label?: string
  title?: string
  prompt?: string
  confirmLabel?: string
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
  Button: (props: MockProps) => (
    <button type="button" onClick={props.onPress}>
      {props.label}
    </button>
  ),
  ConfirmButton: (props: MockProps) => (
    <div>
      <button type="button">{props.label}</button>
      <span>{props.prompt}</span>
      <button type="button" onClick={props.onConfirm}>
        {props.confirmLabel}
      </button>
    </div>
  ),
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

const { checkRun } = vi.hoisted(() => ({ checkRun: vi.fn() }))
vi.mock('@/lib/queries/admin', () => ({
  useCheckForUpdates: () => ({ run: checkRun, isPending: false }),
  usePauseUpdates: () => ({ run: vi.fn(), isPending: false }),
  useResumeUpdates: () => ({ run: vi.fn(), isPending: false }),
}))

const DATA = {
  ok: true,
  channel: 'release',
  updatesPaused: false,
  nextCheckAt: '2026-10-27T11:17:00.000Z',
  units: {},
} as unknown as InstanceUpdates

function renderPanel() {
  return render(<UpdatesStatusPanel data={DATA} headline="up_to_date" waiting={null} />)
}

beforeEach(() => {
  checkRun.mockResolvedValue({ ok: true, value: DATA })
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  applyScenario(SCENARIOS[0])
})

describe.each(SCENARIOS)('Status card at phone width ($name)', (scenario) => {
  beforeEach(() => {
    applyScenario(scenario)
    env.width = 360
  })

  it('moves Check Now and Pause All Updates out of the header into the card body', () => {
    renderPanel()
    const header = screen.getByTestId('panel-header')
    const body = screen.getByTestId('panel-body')
    expect(header.contains(screen.getByRole('button', { name: 'Check Now' }))).toBe(false)
    expect(body.contains(screen.getByRole('button', { name: 'Check Now' }))).toBe(true)
    expect(body.contains(screen.getByRole('button', { name: 'Pause All Updates' }))).toBe(true)
    expect(body.contains(screen.getByText(/finishes the servers it is updating/))).toBe(true)
  })

  it('says a refused check in the body, not in the header', async () => {
    checkRun.mockResolvedValueOnce({
      ok: false,
      error: 'too soon',
      cause: new UpdateCheckTooSoonError('too soon', 30),
    })
    renderPanel()
    fireEvent.click(screen.getByRole('button', { name: 'Check Now' }))
    const message = await screen.findByText('Checked a moment ago. Try again in 30 seconds.')
    expect(screen.getByTestId('panel-body').contains(message)).toBe(true)
  })
})

describe('Status card on a wide window', () => {
  it('keeps the controls in the header and messages in the body', async () => {
    env.width = 1200
    checkRun.mockResolvedValueOnce({ ok: false, error: 'broken', cause: new Error('broken') })
    renderPanel()
    const header = screen.getByTestId('panel-header')
    expect(header.contains(screen.getByRole('button', { name: 'Check Now' }))).toBe(true)
    expect(header.contains(screen.getByRole('button', { name: 'Pause All Updates' }))).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Check Now' }))
    await waitFor(() => {
      expect(checkRun).toHaveBeenCalledTimes(1)
    })
    expect(screen.getByTestId('panel-header').textContent).not.toMatch(/broken|Could not/)
  })
})

describe('Check Now too soon', () => {
  it('clears "Checked a moment ago" once the wait has passed', async () => {
    checkRun.mockResolvedValueOnce({
      ok: false,
      error: 'too soon',
      cause: new UpdateCheckTooSoonError('too soon', 1),
    })
    renderPanel()
    fireEvent.click(screen.getByRole('button', { name: 'Check Now' }))
    expect(await screen.findByText('Checked a moment ago. Try again in 1 second.')).toBeTruthy()
    await waitFor(
      () => {
        expect(screen.queryByText(/Checked a moment ago/)).toBeNull()
      },
      { timeout: 4000 }
    )
  })
})
