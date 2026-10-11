// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { applyScenario, SCENARIOS, styleOf, token } from '@/components/ui/v4/rn-stub'
import { ListGroup } from '@/components/ui/v4/list-group'

vi.mock('react-native', async () => (await import('@/components/ui/v4/rn-stub')).reactNativeStub)
vi.mock('@/lib/theme-preference', async () => (await import('@/components/ui/v4/rn-stub')).themePreferenceStub)

afterEach(cleanup)

describe.each(SCENARIOS)('ListGroup ($name)', (scenario) => {
  beforeEach(() => applyScenario(scenario))

  it('puts the rows in one bordered card with a hairline between them, none above the first', () => {
    render(
      <ListGroup>
        <span key="a">first</span>
        <span>second</span>
        <span>third</span>
      </ListGroup>,
    )
    const rows = ['first', 'second', 'third'].map((t) => screen.getByText(t).parentElement)
    expect(styleOf(rows[0])).not.toHaveProperty('borderTopWidth')
    for (const row of rows.slice(1)) {
      expect(styleOf(row).borderTopWidth).toBe(1)
      expect(styleOf(row).borderTopColor).toBe(token(scenario, 'sep'))
    }
    const card = rows[0]?.parentElement
    expect(styleOf(card).borderColor).toBe(token(scenario, 'sep'))
    expect(styleOf(card).overflow).toBe('hidden')
  })

  it('shows a small grey title inside the card and help text under it', () => {
    render(
      <ListGroup title="Linux users" foot="Each app runs as one of these." strong>
        <span>row</span>
      </ListGroup>,
    )
    const title = screen.getByRole('heading', { name: 'Linux users' })
    expect(styleOf(title).color).toBe(token(scenario, 'text3'))
    expect(styleOf(title).fontSize).toBe(12)
    expect(styleOf(screen.getByText('Each app runs as one of these.')).color).toBe(token(scenario, 'text3'))
    expect(styleOf(title.parentElement).borderColor).toBe(token(scenario, 'sepStrong'))
  })

  it('shows the empty message when there are no rows', () => {
    render(<ListGroup empty={<span>Nothing yet</span>}>{[]}</ListGroup>)
    expect(screen.getByText('Nothing yet')).toBeTruthy()
  })

  it('shows nothing extra when there are no rows and no empty message', () => {
    const { container } = render(<ListGroup />)
    expect(container.textContent).toBe('')
  })
})
