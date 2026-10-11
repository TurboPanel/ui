// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { applyScenario, SCENARIOS, styleOf, token } from '@/components/ui/v4/rn-stub'
import { StatusTriplet } from '@/components/ui/v4/status-triplet'

vi.mock('react-native', async () => (await import('@/components/ui/v4/rn-stub')).reactNativeStub)
vi.mock('react-native-svg', async () => (await import('@/components/ui/v4/rn-stub')).svgStub)
vi.mock('@/lib/theme-preference', async () => (await import('@/components/ui/v4/rn-stub')).themePreferenceStub)

afterEach(cleanup)

describe.each(SCENARIOS)('StatusTriplet ($name)', (scenario) => {
  beforeEach(() => applyScenario(scenario))

  it('answers running, last deploy and not deployed in words', () => {
    render(
      <StatusTriplet
        running={{ status: 'running', sub: 'as of 12 s ago' }}
        lastDeploy={{ status: 'deployed', sub: 'a41c9e2 · 2 days ago' }}
        pendingLabel="2 changes not deployed"
      />,
    )
    const group = screen.getByRole('group', { name: 'Status' })
    expect(group.textContent).toContain('Running')
    expect(group.textContent).toContain('as of 12 s ago')
    expect(group.textContent).toContain('Last deploy')
    expect(group.textContent).toContain('Deployed')
    expect(screen.getByLabelText('2 changes not deployed')).toBeTruthy()
  })

  it('divides the parts with a hairline in the row form, not when stacked', () => {
    const parts = {
      running: { status: 'running' },
      lastDeploy: { status: 'deployed' },
    } as const
    const { rerender } = render(<StatusTriplet {...parts} />)
    const last = screen.getByText('Last deploy').parentElement
    expect(styleOf(last).borderLeftColor).toBe(token(scenario, 'sep'))
    rerender(<StatusTriplet {...parts} stacked />)
    expect(styleOf(screen.getByText('Last deploy').parentElement)).not.toHaveProperty('borderLeftColor')
    expect(styleOf(screen.getByRole('group', { name: 'Status' })).flexDirection).toBe('column')
  })

  it('shows nothing for last deploy or pending when there is none', () => {
    render(<StatusTriplet running={{ status: 'stopped' }} />)
    expect(screen.queryByText('Last deploy')).toBeNull()
    expect(screen.queryByLabelText('Not deployed')).toBeNull()
  })

  it('compact form is two small chips: the run state and "N not deployed"', () => {
    render(
      <StatusTriplet
        compact
        running={{ status: 'running' }}
        lastDeploy={{ status: 'failed' }}
        pendingCount={2}
      />,
    )
    expect(screen.getByLabelText('Running')).toBeTruthy()
    expect(styleOf(screen.getByLabelText('Running')).minHeight).toBe(18)
    expect(screen.getByLabelText('2 not deployed')).toBeTruthy()
    expect(screen.queryByText('Last deploy')).toBeNull()
  })

  it('compact form drops the pending chip at zero', () => {
    render(<StatusTriplet compact running={{ status: 'running' }} />)
    expect(screen.queryByText(/not deployed/)).toBeNull()
  })

  it('uses the short pending word when only a count is given', () => {
    render(<StatusTriplet running={{ status: 'running' }} pendingCount={3} />)
    expect(screen.getByLabelText('3 not deployed')).toBeTruthy()
  })
})
