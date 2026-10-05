// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { applyScenario, SCENARIOS, styleOf, token } from '@/components/ui/v4/rn-stub'
import { ListRow } from '@/components/ui/v4/list-row'

vi.mock('react-native', async () => (await import('@/components/ui/v4/rn-stub')).reactNativeStub)
vi.mock('react-native-svg', async () => (await import('@/components/ui/v4/rn-stub')).svgStub)
vi.mock('@/lib/theme-preference', async () => (await import('@/components/ui/v4/rn-stub')).themePreferenceStub)

afterEach(cleanup)

describe.each(SCENARIOS)('ListRow ($name)', (scenario) => {
  beforeEach(() => applyScenario(scenario))

  it('is a 48 px row with the title, a grey sub line and a value on the right', () => {
    render(<ListRow title="Start command" sub="Used when the app starts" value="node server.js" />)
    expect(styleOf(screen.getByText('Start command').parentElement?.parentElement?.parentElement).minHeight).toBe(48)
    expect(styleOf(screen.getByText('Start command')).color).toBe(token(scenario, 'text'))
    expect(styleOf(screen.getByText('Used when the app starts')).color).toBe(token(scenario, 'text3'))
    expect(styleOf(screen.getByText('node server.js')).color).toBe(token(scenario, 'text2'))
  })

  it('is 56 px when tall', () => {
    render(<ListRow title="Production" tall />)
    expect(styleOf(screen.getByText('Production').parentElement?.parentElement?.parentElement).minHeight).toBe(56)
  })

  it('draws an empty value grey', () => {
    render(<ListRow title="Base image" value="Not set" unset />)
    expect(styleOf(screen.getByText('Not set')).color).toBe(token(scenario, 'text3'))
  })

  it('shows chips after the title and the "Not deployed" chip when staged', () => {
    render(<ListRow title="web" chips={<span>Staging change</span>} staged />)
    expect(screen.getByText('Staging change')).toBeTruthy()
    expect(screen.getByLabelText('Not deployed')).toBeTruthy()
  })

  it('shows leading and trailing parts', () => {
    render(<ListRow title="Alerts" leading={<i data-testid="lead" />} trailing={<i data-testid="end" />} />)
    expect(screen.getByTestId('lead')).toBeTruthy()
    expect(screen.getByTestId('end')).toBeTruthy()
  })

  it('draws a danger title in red', () => {
    render(<ListRow title="Delete environment" danger />)
    expect(styleOf(screen.getByText('Delete environment')).color).toBe(token(scenario, 'bad'))
  })

  it('is a button with a chevron when given onPress', () => {
    const onPress = vi.fn()
    render(<ListRow title="Open service" onPress={onPress} accessibilityLabel="Open service web" />)
    const row = screen.getByRole('button', { name: 'Open service web' })
    expect(row.textContent).toContain('›')
    fireEvent.click(row)
    expect(onPress).toHaveBeenCalledTimes(1)
  })

  it('is named by its title when pressable and no label is given', () => {
    render(<ListRow title="Open service" onPress={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Open service' })).toBeTruthy()
  })

  it('is not a button without onPress', () => {
    render(<ListRow title="Static" accessibilityLabel="Static row" />)
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.getByLabelText('Static row')).toBeTruthy()
  })
})
