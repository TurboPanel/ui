// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { applyScenario, SCENARIOS, styleOf, token } from '@/components/ui/v4/rn-stub'
import { Notice } from '@/components/ui/v4/notice'
import { fontFamily } from '@/lib/v4/typography'

vi.mock('react-native', async () => (await import('@/components/ui/v4/rn-stub')).reactNativeStub)
vi.mock('@/lib/theme-preference', async () => (await import('@/components/ui/v4/rn-stub')).themePreferenceStub)

afterEach(cleanup)

describe.each(SCENARIOS)('Notice ($name)', (scenario) => {
  beforeEach(() => applyScenario(scenario))

  it.each([
    ['ok', 'okSoft', 'okLine'],
    ['busy', 'busySoft', 'busyLine'],
    ['warn', 'warnSoft', 'warnLine'],
    ['bad', 'badSoft', 'badLine'],
  ] as const)('tints a %s notice with its soft fill and line', (tone, fill, line) => {
    render(<Notice tone={tone} title="Heads up" />)
    const style = styleOf(screen.getByLabelText('Heads up'))
    expect(style.backgroundColor).toBe(token(scenario, fill))
    expect(style.borderColor).toBe(token(scenario, line))
    expect(style.borderRadius).toBe(12)
  })

  it('an info notice is a plain card', () => {
    render(<Notice title="Note" />)
    const style = styleOf(screen.getByLabelText('Note'))
    expect(style.backgroundColor).toBe(token(scenario, 'surface'))
    expect(style.borderColor).toBe(token(scenario, 'sep'))
  })

  it('shows title, body and actions, and leaves out what is missing', () => {
    render(<Notice title="Stop Staging?" body="Visitors will see an error." actions={<button type="button">Stop</button>} />)
    expect(screen.getByText('Stop Staging?')).toBeTruthy()
    expect(screen.getByText('Visitors will see an error.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Stop' })).toBeTruthy()
    cleanup()
    render(<Notice body="Only a body." />)
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('shows the error line as selectable code on a red tint', () => {
    render(<Notice tone="bad" title="Deploy failed" errorLine="Build stopped with an error" />)
    const line = screen.getByText('Build stopped with an error')
    const style = styleOf(line)
    expect(line.getAttribute('data-selectable')).toBe('yes')
    expect(style.fontFamily).toBe(fontFamily('mono', scenario.os === 'web'))
    expect(style.fontSize).toBe(12.5)
    expect(style.color).toBe(token(scenario, 'bad'))
    expect(style.backgroundColor).toBe(token(scenario, 'badSoft'))
  })

  it('announces a bad notice as an alert, with title, body and error line as its name', () => {
    render(<Notice tone="bad" title="Deploy failed" body="The old version still serves." errorLine="exit 1" />)
    const alert = screen.getByRole('alert')
    expect(alert.getAttribute('aria-label')).toBe('Deploy failed. The old version still serves. exit 1')
  })

  it('does not announce other tones as alerts', () => {
    render(<Notice tone="warn" title="Careful" />)
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('takes a leading chip and a compact form', () => {
    render(<Notice compact tone="warn" title="Server unreachable" leading={<i data-testid="chip" />} />)
    expect(screen.getByTestId('chip')).toBeTruthy()
    expect(styleOf(screen.getByLabelText('Server unreachable')).padding).toBe(12)
    expect(styleOf(screen.getByText('Server unreachable')).fontSize).toBe(13)
  })
})
