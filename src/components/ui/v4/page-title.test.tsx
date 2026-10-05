// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { applyScenario, SCENARIOS, styleOf, token } from '@/components/ui/v4/rn-stub'
import { PageTitle } from '@/components/ui/v4/page-title'
import { fontFamily } from '@/lib/v4/typography'

vi.mock('react-native', async () => (await import('@/components/ui/v4/rn-stub')).reactNativeStub)
vi.mock('@/lib/theme-preference', async () => (await import('@/components/ui/v4/rn-stub')).themePreferenceStub)

afterEach(cleanup)

describe.each(SCENARIOS)('PageTitle ($name)', (scenario) => {
  beforeEach(() => applyScenario(scenario))
  const web = scenario.os === 'web'

  it('page title: 28 px, Plus Jakarta Sans 800 italic, -0.5 tracking', () => {
    render(<PageTitle title="Staging" />)
    const style = styleOf(screen.getByRole('heading', { name: 'Staging' }))
    expect(style.fontSize).toBe(28)
    expect(style.fontFamily).toBe(fontFamily('displayItalic', web))
    expect(String(style.fontFamily)).toContain('PlusJakartaSans_800ExtraBold_Italic')
    expect(style.letterSpacing).toBe(-0.5)
    expect(style.color).toBe(token(scenario, 'text'))
    expect(style).not.toHaveProperty('fontStyle')
  })

  it('page title: upright mono suffix, sub line and actions', () => {
    render(<PageTitle title="Staging" mono="staging" sub="Updated 2 h ago" actions={<i data-testid="deploy" />} />)
    expect(styleOf(screen.getByText('staging')).fontFamily).toBe(fontFamily('monoSemibold', web))
    expect(styleOf(screen.getByText('Updated 2 h ago')).color).toBe(token(scenario, 'text3'))
    expect(screen.getByTestId('deploy')).toBeTruthy()
  })

  it('page title: leaves out what is not given', () => {
    render(<PageTitle title="Projects" />)
    expect(screen.getByRole('heading').parentElement?.children).toHaveLength(1)
  })
})
