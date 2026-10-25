// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { applyScenario, SCENARIOS, styleOf, token } from '@/components/ui/v4/rn-stub'
import { Section } from '@/components/ui/v4/section'

vi.mock('react-native', async () => (await import('@/components/ui/v4/rn-stub')).reactNativeStub)
vi.mock(
  '@/lib/theme-preference',
  async () => (await import('@/components/ui/v4/rn-stub')).themePreferenceStub
)

afterEach(cleanup)

describe.each(SCENARIOS)('Section ($name)', (scenario) => {
  beforeEach(() => applyScenario(scenario))

  it('is a section heading over one card, with the note beside the title', () => {
    render(
      <Section title="Git branch" note="What this environment builds">
        <span>body</span>
      </Section>
    )
    expect(styleOf(screen.getByRole('heading', { name: 'Git branch' })).fontSize).toBe(17)
    expect(screen.getByText('What this environment builds')).toBeTruthy()
    const card = screen.getByText('body').parentElement?.parentElement as HTMLElement
    expect(styleOf(card).backgroundColor).toBe(token(scenario, 'surface'))
    expect(styleOf(card).borderRadius).toBe(12)
  })

  it('collapsible: starts hidden when asked and opens with Show', () => {
    const onToggle = vi.fn()
    render(
      <Section
        title="Deployment history"
        collapsible
        defaultCollapsed
        onToggle={onToggle}
        action={<span>Refresh</span>}
      >
        <span>rows</span>
      </Section>
    )
    expect(screen.queryByText('rows')).toBeNull()
    expect(screen.getByText('Refresh')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Expand Deployment history' }))
    expect(screen.getByText('rows')).toBeTruthy()
    expect(onToggle).toHaveBeenLastCalledWith(true)
    fireEvent.click(screen.getByRole('button', { name: 'Collapse Deployment history' }))
    expect(screen.queryByText('rows')).toBeNull()
    expect(onToggle).toHaveBeenLastCalledWith(false)
  })
})
