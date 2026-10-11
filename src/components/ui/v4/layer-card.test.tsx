// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { applyScenario, SCENARIOS, styleOf, token } from '@/components/ui/v4/rn-stub'
import { LayerBase, LayerCard } from '@/components/ui/v4/layer-card'

vi.mock('react-native', async () => (await import('@/components/ui/v4/rn-stub')).reactNativeStub)
vi.mock('@/lib/theme-preference', async () => (await import('@/components/ui/v4/rn-stub')).themePreferenceStub)

afterEach(cleanup)

describe.each(SCENARIOS)('layer cards ($name)', (scenario) => {
  beforeEach(() => applyScenario(scenario))

  it('Base band: blue tint, blue title, the summary beside it', () => {
    render(<LayerBase summary="3 services · 2 Linux users" />)
    expect(styleOf(screen.getByText('Base')).color).toBe(token(scenario, 'base'))
    const band = screen.getByText('Base').parentElement
    expect(styleOf(band).backgroundColor).toBe(token(scenario, 'baseSoft'))
    expect(styleOf(band).borderColor).toBe(token(scenario, 'baseLine'))
    expect(styleOf(band).borderRadius).toBe(14)
    expect(screen.getByText('3 services · 2 Linux users')).toBeTruthy()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('Base band: opens the Base tab when pressed', () => {
    const onPress = vi.fn()
    render(<LayerBase summary="3 services" onPress={onPress} trailing={<i data-testid="chev" />} />)
    fireEvent.click(screen.getByRole('button', { name: 'Base, 3 services' }))
    expect(onPress).toHaveBeenCalledTimes(1)
    expect(screen.getByTestId('chev')).toBeTruthy()
  })

  it('Base band: is named by its title when there is no summary', () => {
    render(<LayerBase title="Shared settings" onPress={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Shared settings' })).toBeTruthy()
  })

  it('environment card: a sheet laid 6 px over a faint Base sheet', () => {
    render(
      <LayerCard title="Staging" head={<span>Follows the Base</span>} foot={<span>Open</span>}>
        <span>body</span>
      </LayerCard>,
    )
    const card = screen.getByRole('heading', { name: 'Staging' }).parentElement?.parentElement
    expect(styleOf(card).backgroundColor).toBe(token(scenario, 'surface'))
    expect(styleOf(card).borderColor).toBe(token(scenario, 'sepStrong'))
    expect(styleOf(card).marginLeft).toBe(6)
    expect(styleOf(card).marginTop).toBe(6)
    expect(styleOf(card).padding).toBe(20)
    const ghost = card?.previousElementSibling
    expect(styleOf(ghost).backgroundColor).toBe(token(scenario, 'baseSoft'))
    expect(styleOf(ghost).borderColor).toBe(token(scenario, 'baseLine'))
    expect(styleOf(ghost).right).toBe(6)
    expect(screen.getByText('Follows the Base')).toBeTruthy()
    expect(screen.getByText('Open')).toBeTruthy()
    expect(screen.getByText('body')).toBeTruthy()
  })

  it('a stand-alone environment has an empty dashed sheet behind it', () => {
    render(<LayerCard title="Preview" alone />)
    const ghost = screen.getByRole('heading', { name: 'Preview' }).parentElement?.parentElement?.previousElementSibling
    expect(styleOf(ghost).borderStyle).toBe('dashed')
    expect(styleOf(ghost).backgroundColor).toBe('transparent')
    expect(styleOf(ghost).borderColor).toBe(token(scenario, 'sepStrong'))
  })
})
