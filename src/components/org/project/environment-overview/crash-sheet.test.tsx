// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CrashSheet, type CrashRetry } from '@/components/org/project/environment-overview/crash-sheet'
import { applyScenario, SCENARIOS, styleOf, token } from '@/components/ui/v4/rn-stub'
import { crashInfo, type CrashInfo } from '@/lib/v4/run-state'

vi.mock('react-native', async () => (await import('@/components/ui/v4/rn-stub')).reactNativeStub)
vi.mock('react-native-svg', async () => (await import('@/components/ui/v4/rn-stub')).svgStub)
vi.mock('@/lib/theme-preference', async () => (await import('@/components/ui/v4/rn-stub')).themePreferenceStub)

afterEach(cleanup)

const NOW = Date.parse('2026-10-05T12:00:00Z')
function crashOf(lastError: string | null, restartCount = 7): CrashInfo {
  const info = crashInfo(
    'web',
    { state: 'crashing', running: false, restartCount, lastError, asOf: '2026-10-05T11:58:00Z' },
    NOW,
  )
  if (info === null) throw new Error('fixture')
  return info
}

const INFO = crashOf('Error: boom')

function retryOf(extra: Partial<CrashRetry> = {}): CrashRetry {
  return { canRetry: true, busy: false, requested: false, error: null, onRetry: vi.fn(), ...extra }
}

function show(retry: CrashRetry = retryOf(), info = INFO) {
  const handlers = { onOpen: vi.fn(), onClose: vi.fn() }
  render(<CrashSheet info={info} envName="Production" retry={retry} {...handlers} />)
  return handlers
}

describe.each(SCENARIOS)('CrashSheet ($name)', (scenario) => {
  beforeEach(() => applyScenario(scenario))

  it('names the problem and says how often it restarted, with the last thing it said', () => {
    show()
    const sheet = screen.getByRole('dialog')
    expect(within(sheet).getByRole('heading', { name: 'web keeps crashing' })).toBeTruthy()
    expect(within(sheet).getByLabelText('Keeps crashing')).toBeTruthy()
    expect(within(sheet).getByText('It starts, fails and starts again. It has restarted 7 times.')).toBeTruthy()
    const said = within(sheet).getByText('Error: boom')
    expect(said.getAttribute('data-selectable')).toBe('yes')
    expect(styleOf(said).backgroundColor).toBe(token(scenario, 'surface2'))
    expect(within(sheet).getByText('Seen 2m ago')).toBeTruthy()
  })

  it('says so when the app printed nothing', () => {
    show(retryOf(), crashOf(null, 2))
    expect(screen.getByText('It printed nothing before it failed.')).toBeTruthy()
  })

  it('retries, and opens the app page or closes', () => {
    const retry = retryOf()
    const { onOpen, onClose } = show(retry)
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(retry.onRetry).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: 'Open web' }))
    expect(onOpen).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: 'Close web keeps crashing' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('says Retry restarts the apps and does not deploy', () => {
    show()
    expect(screen.getByText('Retry restarts every app in Production. It does not deploy.')).toBeTruthy()
  })

  it('blocks Retry while it restarts', () => {
    show(retryOf({ busy: true }))
    const button = screen.getByRole('button', { name: 'Retry' })
    expect(button.getAttribute('aria-busy')).toBe('true')
    expect((button as HTMLButtonElement).disabled).toBe(true)
  })

  it('confirms the restart was asked for', () => {
    show(retryOf({ requested: true }))
    expect(screen.getByText('Restart asked for Production')).toBeTruthy()
  })

  it('shows why a restart failed', () => {
    show(retryOf({ error: 'The environment is deploying.' }))
    const notice = screen.getByRole('alert')
    expect(within(notice).getByText('Could not restart')).toBeTruthy()
    expect(within(notice).getByText('The environment is deploying.')).toBeTruthy()
  })

  it('offers no Retry to someone who cannot manage the project', () => {
    show(retryOf({ canRetry: false }))
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull()
    expect(screen.getByText('Only people who manage this project can retry.')).toBeTruthy()
  })
})
