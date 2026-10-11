// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { applyScenario, SCENARIOS, styleOf, token } from '@/components/ui/v4/rn-stub'
import { SectionHeading } from '@/components/ui/v4/section-heading'
import { fontFamily } from '@/lib/v4/typography'

vi.mock('react-native', async () => (await import('@/components/ui/v4/rn-stub')).reactNativeStub)
vi.mock('@/lib/theme-preference', async () => (await import('@/components/ui/v4/rn-stub')).themePreferenceStub)

afterEach(cleanup)

describe.each(SCENARIOS)('SectionHeading ($name)', (scenario) => {
  beforeEach(() => applyScenario(scenario))
  const web = scenario.os === 'web'

  it('section heading: 17 px display type, 700, a heading for assistive tech', () => {
    render(<SectionHeading title="Domains" />)
    const style = styleOf(screen.getByRole('heading', { name: 'Domains' }))
    expect(style.fontSize).toBe(17)
    expect(style.fontFamily).toBe(fontFamily('display', web))
    expect(style.color).toBe(token(scenario, 'text'))
  })

  it('section heading: note, action and danger colour', () => {
    const { rerender } = render(
      <SectionHeading title="Variables" note="Shared by every environment" action={<a href="#all">See all</a>} />,
    )
    expect(styleOf(screen.getByText('Shared by every environment')).color).toBe(token(scenario, 'text3'))
    expect(screen.getByText('See all')).toBeTruthy()
    rerender(<SectionHeading title="Danger zone" danger />)
    expect(styleOf(screen.getByRole('heading')).color).toBe(token(scenario, 'bad'))
    expect(screen.queryByText('See all')).toBeNull()
  })
})
