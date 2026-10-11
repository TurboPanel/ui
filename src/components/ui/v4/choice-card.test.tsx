// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { applyScenario, SCENARIOS, styleOf, token } from '@/components/ui/v4/rn-stub'
import { ChoiceCard, ChoiceGroup } from '@/components/ui/v4/choice-card'

vi.mock('react-native', async () => (await import('@/components/ui/v4/rn-stub')).reactNativeStub)
vi.mock('@/lib/theme-preference', async () => (await import('@/components/ui/v4/rn-stub')).themePreferenceStub)

afterEach(cleanup)

describe.each(SCENARIOS)('ChoiceCard ($name)', (scenario) => {
  beforeEach(() => applyScenario(scenario))

  it('is a radio group of cards, one selected', () => {
    render(
      <ChoiceGroup label="Start from">
        <ChoiceCard title="The Base" body="Shares the Base settings." selected onSelect={vi.fn()} />
        <ChoiceCard title="Empty" selected={false} onSelect={vi.fn()} alone />
      </ChoiceGroup>,
    )
    expect(screen.getByRole('radiogroup', { name: 'Start from' })).toBeTruthy()
    const radios = screen.getAllByRole('radio')
    expect(radios.map((r) => r.getAttribute('aria-checked'))).toEqual(['true', 'false'])
  })

  it('outlines the selected card in the accent, with a soft fill', () => {
    render(<ChoiceCard title="The Base" selected onSelect={vi.fn()} />)
    const style = styleOf(screen.getByRole('radio'))
    expect(style.borderColor).toBe(token(scenario, 'accent'))
    expect(style.backgroundColor).toBe(token(scenario, 'accentSoft'))
  })

  it('draws an unselected card plain, and a stand-alone choice dashed', () => {
    render(<ChoiceCard title="Empty" selected={false} onSelect={vi.fn()} alone />)
    const style = styleOf(screen.getByRole('radio'))
    expect(style.borderColor).toBe(token(scenario, 'sepStrong'))
    expect(style.backgroundColor).toBe(token(scenario, 'surface'))
    expect(style.borderStyle).toBe('dashed')
  })

  it('names the card by title and help, and selects on press', () => {
    const onSelect = vi.fn()
    render(<ChoiceCard title="The Base" body="Shares the Base settings." selected={false} onSelect={onSelect} />)
    fireEvent.click(screen.getByRole('radio', { name: 'The Base. Shares the Base settings.' }))
    expect(onSelect).toHaveBeenCalledTimes(1)
  })

  it('is named by the title alone when there is no help line', () => {
    render(<ChoiceCard title="Empty" selected={false} onSelect={vi.fn()} />)
    expect(screen.getByRole('radio', { name: 'Empty' })).toBeTruthy()
  })
})
