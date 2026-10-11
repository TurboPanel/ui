// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { applyScenario, SCENARIOS, styleOf, token } from '@/components/ui/v4/rn-stub'
import { StatusChip } from '@/components/ui/v4/status-chip'
import { fontFamily } from '@/lib/v4/typography'

vi.mock('react-native', async () => (await import('@/components/ui/v4/rn-stub')).reactNativeStub)
vi.mock('react-native-svg', async () => (await import('@/components/ui/v4/rn-stub')).svgStub)
vi.mock('@/lib/theme-preference', async () => (await import('@/components/ui/v4/rn-stub')).themePreferenceStub)

afterEach(cleanup)

describe.each(SCENARIOS)('StatusChip ($name)', (scenario) => {
  beforeEach(() => applyScenario(scenario))

  it.each([
    ['running', 'Running', 'ok'],
    ['deploying', 'Deploying', 'busy'],
    ['changes', 'Not deployed', 'warn'],
    ['failed', 'Deploy failed', 'bad'],
    ['stopped', 'Stopped', 'idle'],
  ] as const)('shows %s as the word, with a 1 px border in the %s tone and no fill', (status, word, tone) => {
    render(<StatusChip status={status} />)
    const chip = screen.getByLabelText(word)
    expect(chip.textContent).toBe(word)
    const style = styleOf(chip)
    expect(style.borderColor).toBe(token(scenario, tone))
    expect(style.borderWidth).toBe(1)
    expect(style.backgroundColor).toBe('transparent')
    expect(style.borderRadius).toBe(999)
  })

  it('colours the word like the border and sets it in Geist semibold', () => {
    render(<StatusChip status="failed" />)
    const text = screen.getByText('Deploy failed')
    expect(styleOf(text).color).toBe(token(scenario, 'bad'))
    expect(styleOf(text).fontFamily).toBe(fontFamily('bodySemibold', scenario.os === 'web'))
    expect(styleOf(text)).not.toHaveProperty('fontWeight')
  })

  it('is 22 px high, 18 small and 28 large', () => {
    const { rerender } = render(<StatusChip status="running" />)
    expect(styleOf(screen.getByLabelText('Running')).minHeight).toBe(22)
    rerender(<StatusChip status="running" size="sm" />)
    expect(styleOf(screen.getByLabelText('Running')).minHeight).toBe(18)
    rerender(<StatusChip status="running" size="lg" />)
    expect(styleOf(screen.getByLabelText('Running')).minHeight).toBe(28)
  })

  it('draws a glyph that screen readers skip', () => {
    const { container } = render(<StatusChip status="crashing" />)
    const svg = container.querySelector('svg')
    expect(svg?.getAttribute('aria-hidden')).toBe('true')
    expect(container.querySelector('path')).not.toBeNull()
  })

  it('takes a label that says more than the default word', () => {
    render(<StatusChip status="changes" label="2 not deployed" size="sm" />)
    expect(screen.getByLabelText('2 not deployed').textContent).toBe('2 not deployed')
  })

  it('reads an unknown key as Unknown', () => {
    render(<StatusChip status="whatever" />)
    expect(screen.getByLabelText('Unknown')).toBeTruthy()
  })

  it('shows only the mark as a dot, keeping the word as its name', () => {
    const { container } = render(<StatusChip status="running" size="dot" />)
    const dot = screen.getByRole('img', { name: 'Running' })
    expect(dot.textContent).toBe('')
    expect(container.querySelector('circle')?.getAttribute('fill')).toBe(token(scenario, 'ok'))
  })
})
