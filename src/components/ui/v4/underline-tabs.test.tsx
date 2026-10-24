// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { applyScenario, env, SCENARIOS, styleOf, token } from '@/components/ui/v4/rn-stub'
import { UnderlineTabs } from '@/components/ui/v4/underline-tabs'

vi.mock('react-native', async () => (await import('@/components/ui/v4/rn-stub')).reactNativeStub)
vi.mock('@/lib/theme-preference', async () => (await import('@/components/ui/v4/rn-stub')).themePreferenceStub)

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'config', label: 'Configuration', dot: true, dotLabel: 'not deployed changes' },
  { key: 'settings', label: 'Settings' },
] as const

describe.each(SCENARIOS)('UnderlineTabs ($name)', (scenario) => {
  beforeEach(() => {
    applyScenario(scenario)
    vi.stubGlobal('matchMedia', () => ({ matches: false }))
  })

  it('is a tab list with the current tab selected', () => {
    render(<UnderlineTabs tabs={TABS} value="overview" onChange={vi.fn()} ariaLabel="Environment sections" />)
    expect(screen.getByRole('tablist', { name: 'Environment sections' })).toBeTruthy()
    const tabs = screen.getAllByRole('tab')
    expect(tabs.map((t) => t.getAttribute('aria-selected'))).toEqual(['true', 'false', 'false'])
  })

  it('underlines the selected tab in the accent and makes it stronger', () => {
    render(<UnderlineTabs tabs={TABS} value="settings" onChange={vi.fn()} ariaLabel="Sections" />)
    const selected = screen.getByRole('tab', { name: 'Settings' })
    const other = screen.getByRole('tab', { name: 'Overview' })
    expect(styleOf(selected).borderBottomColor).toBe(token(scenario, 'accent'))
    expect(styleOf(other).borderBottomColor).toBe('transparent')
    expect(styleOf(screen.getByText('Settings')).color).toBe(token(scenario, 'text'))
    expect(styleOf(screen.getByText('Overview')).color).toBe(token(scenario, 'text3'))
  })

  it('calls onChange with the key of the pressed tab', () => {
    const onChange = vi.fn()
    render(<UnderlineTabs tabs={TABS} value="overview" onChange={onChange} ariaLabel="Sections" />)
    fireEvent.click(screen.getByRole('tab', { name: /Settings/ }))
    expect(onChange).toHaveBeenCalledWith('settings')
  })

  it('marks a tab with an amber dot and says what it means', () => {
    render(<UnderlineTabs tabs={TABS} value="overview" onChange={vi.fn()} ariaLabel="Sections" />)
    const tab = screen.getByRole('tab', { name: 'Configuration, not deployed changes' })
    const dot = tab.querySelector('div')
    expect(styleOf(dot).backgroundColor).toBe(token(scenario, 'warn'))
    expect(styleOf(dot).width).toBe(6)
    expect(screen.getByRole('tab', { name: 'Overview' }).querySelector('div')).toBeNull()
  })

  it('greys a muted tab, says why, and still opens it', () => {
    const onChange = vi.fn()
    const tabs = [
      { key: 'overview', label: 'Overview' },
      { key: 'compose', label: 'Compose', muted: true, mutedLabel: 'Managed by TurboPanel' },
    ]
    render(<UnderlineTabs tabs={tabs} value="overview" onChange={onChange} ariaLabel="Sections" />)
    const tab = screen.getByRole('tab', { name: 'Compose, Managed by TurboPanel' })
    expect(styleOf(screen.getByText('Compose')).opacity).toBe(0.5)
    expect(styleOf(screen.getByText('Overview')).opacity).toBeUndefined()
    fireEvent.click(tab)
    expect(onChange).toHaveBeenCalledWith('compose')
  })

  it('names a dotted tab by its label alone when no dot label is given', () => {
    render(
      <UnderlineTabs
        tabs={[{ key: 'a', label: 'Base', dot: true }]}
        value="a"
        onChange={vi.fn()}
        ariaLabel="Sections"
      />,
    )
    expect(screen.getByRole('tab', { name: 'Base' })).toBeTruthy()
  })
})

describe('UnderlineTabs touch size', () => {
  it('is 40 px on a mouse and 44 px on a phone', () => {
    applyScenario(SCENARIOS[0])
    vi.stubGlobal('matchMedia', () => ({ matches: false }))
    const { rerender } = render(<UnderlineTabs tabs={TABS} value="overview" onChange={vi.fn()} ariaLabel="s" />)
    expect(styleOf(screen.getAllByRole('tab')[0]).minHeight).toBe(40)
    env.os = 'ios'
    rerender(<UnderlineTabs tabs={TABS} value="overview" onChange={vi.fn()} ariaLabel="s" />)
    expect(styleOf(screen.getAllByRole('tab')[0]).minHeight).toBe(44)
  })
})

describe('UnderlineTabs on a phone', () => {
  beforeEach(() => {
    applyScenario(SCENARIOS[0])
    vi.stubGlobal('matchMedia', () => ({ matches: false }))
    env.width = 390
  })

  it('keeps one row that never wraps, every tab 44 px tall', () => {
    render(
      <UnderlineTabs
        tabs={TABS}
        value="settings"
        onChange={vi.fn()}
        ariaLabel="Environment sections"
      />
    )
    const bar = screen.getByRole('tablist', { name: 'Environment sections' })
    expect(styleOf(bar).flexWrap).toBeUndefined()
    for (const tab of screen.getAllByRole('tab')) expect(styleOf(tab).minHeight).toBe(44)
    expect(screen.getByRole('tab', { name: 'Settings' }).getAttribute('aria-selected')).toBe('true')
  })

  it('still switches tabs', () => {
    const onChange = vi.fn()
    render(<UnderlineTabs tabs={TABS} value="overview" onChange={onChange} ariaLabel="s" />)
    fireEvent.click(screen.getByRole('tab', { name: 'Settings' }))
    expect(onChange).toHaveBeenCalledWith('settings')
  })

  it('wraps as before on a wide screen', () => {
    env.width = 1200
    render(<UnderlineTabs tabs={TABS} value="overview" onChange={vi.fn()} ariaLabel="s" />)
    expect(styleOf(screen.getByRole('tablist')).flexWrap).toBe('wrap')
  })
})
