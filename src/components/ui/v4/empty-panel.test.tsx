// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { applyScenario, SCENARIOS, styleOf, token } from '@/components/ui/v4/rn-stub'
import { EmptyPanel } from '@/components/ui/v4/empty-panel'

vi.mock('react-native', async () => (await import('@/components/ui/v4/rn-stub')).reactNativeStub)
vi.mock('react-native-svg', async () => (await import('@/components/ui/v4/rn-stub')).svgStub)
vi.mock('@/lib/theme-preference', async () => (await import('@/components/ui/v4/rn-stub')).themePreferenceStub)

afterEach(cleanup)

describe.each(SCENARIOS)('EmptyPanel ($name)', (scenario) => {
  beforeEach(() => applyScenario(scenario))

  it('is a card with a quiet 36 px mark, a title, a line of why and one action', () => {
    const { container } = render(
      <EmptyPanel title="No domains yet" body="Until you add one, the site answers at its temporary address." action={<button type="button">Add domain</button>} />,
    )
    const title = screen.getByRole('heading', { name: 'No domains yet' })
    expect(styleOf(title).fontSize).toBe(17)
    expect(screen.getByText(/temporary address/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Add domain' })).toBeTruthy()
    const svg = container.querySelector('svg')
    expect(svg?.getAttribute('width')).toBe('36')
    expect(svg?.querySelector('path')?.getAttribute('stroke')).toBe(token(scenario, 'text3'))
    expect(styleOf(container.firstElementChild).backgroundColor).toBe(token(scenario, 'surface'))
  })

  it('inline drops the card and the mark', () => {
    const { container } = render(<EmptyPanel inline title="No variables" />)
    expect(container.querySelector('svg')).toBeNull()
    expect(styleOf(container.firstElementChild).backgroundColor).toBe('transparent')
    expect(styleOf(container.firstElementChild).borderWidth).toBe(0)
  })

  it('hero is for a page with nothing at all: bigger title and room', () => {
    const { container } = render(<EmptyPanel hero title="Welcome" />)
    expect(styleOf(screen.getByRole('heading')).fontSize).toBe(28)
    expect(styleOf(container.firstElementChild).paddingVertical).toBe(64)
  })

  it('leaves out the body and the action when not given', () => {
    render(<EmptyPanel title="Nothing" />)
    expect(screen.getByRole('heading').parentElement?.children).toHaveLength(1)
  })
})
