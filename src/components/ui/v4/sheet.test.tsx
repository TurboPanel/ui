// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { applyScenario, env, SCENARIOS, styleOf, token } from '@/components/ui/v4/rn-stub'
import { Sheet } from '@/components/ui/v4/sheet'
import { fontFamily } from '@/lib/v4/typography'

vi.mock('react-native', async () => (await import('@/components/ui/v4/rn-stub')).reactNativeStub)
vi.mock('@/lib/theme-preference', async () => (await import('@/components/ui/v4/rn-stub')).themePreferenceStub)

afterEach(cleanup)

function panelOf(title: string): HTMLElement {
  return screen.getByRole('heading', { name: title }).parentElement?.parentElement as HTMLElement
}

describe.each(SCENARIOS)('Sheet ($name)', (scenario) => {
  beforeEach(() => applyScenario(scenario))

  it('renders nothing while closed', () => {
    render(<Sheet visible={false} onClose={vi.fn()} title="New environment" />)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('shows the title in display type, the sub line and the body', () => {
    render(
      <Sheet visible onClose={vi.fn()} title="New environment" subtitle="Start from the Base">
        <span>body text</span>
      </Sheet>,
    )
    const title = screen.getByRole('heading', { name: 'New environment' })
    expect(styleOf(title).fontSize).toBe(20)
    expect(styleOf(title).fontFamily).toBe(fontFamily('display', scenario.os === 'web'))
    expect(styleOf(screen.getByText('Start from the Base')).color).toBe(token(scenario, 'text3'))
    expect(screen.getByText('body text')).toBeTruthy()
  })

  it('is a raised panel with 16 px corners over the dimmed page', () => {
    render(<Sheet visible onClose={vi.fn()} title="Compare" />)
    const panel = styleOf(panelOf('Compare'))
    expect(panel.backgroundColor).toBe(token(scenario, 'surface'))
    expect(panel.borderColor).toBe(token(scenario, 'sepStrong'))
    expect(panel.borderRadius).toBe(16)
    expect(panel.boxShadow).toBe(token(scenario, 'shadowPop'))
    const scrim = panelOf('Compare').parentElement
    expect(styleOf(scrim).backgroundColor).toBe(token(scenario, 'scrim'))
  })

  it('closes from the scrim, which is named after the sheet', () => {
    const onClose = vi.fn()
    render(<Sheet visible onClose={onClose} title="Compare" />)
    fireEvent.click(screen.getByRole('button', { name: 'Close Compare' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('is 560 wide, 720 when wide', () => {
    const { rerender } = render(<Sheet visible onClose={vi.fn()} title="Compare" />)
    expect(styleOf(panelOf('Compare')).maxWidth).toBe(560)
    rerender(<Sheet visible wide onClose={vi.fn()} title="Compare" />)
    expect(styleOf(panelOf('Compare')).maxWidth).toBe(720)
  })

  it('shows the footer actions and the grey why line at its left', () => {
    render(
      <Sheet visible onClose={vi.fn()} title="Compare" why="Nothing goes live until you deploy." footer={<button type="button">Create</button>} />,
    )
    expect(screen.getByRole('button', { name: 'Create' })).toBeTruthy()
    const why = screen.getByText('Nothing goes live until you deploy.')
    expect(styleOf(why).color).toBe(token(scenario, 'text3'))
    expect(styleOf(why).marginRight).toBe('auto')
    expect(styleOf(why.parentElement).borderTopColor).toBe(token(scenario, 'sep'))
  })

  it('has no footer row when there is neither footer nor why', () => {
    render(<Sheet visible onClose={vi.fn()} title="Compare" />)
    expect(panelOf('Compare').children).toHaveLength(2)
  })

  it('is a centred fade on a wide screen and a bottom sheet that slides on a phone', () => {
    const { rerender } = render(<Sheet visible onClose={vi.fn()} title="Compare" />)
    expect(screen.getByRole('dialog').getAttribute('data-animation')).toBe('fade')
    expect(styleOf(panelOf('Compare'))).not.toHaveProperty('marginTop')
    env.width = 390
    rerender(<Sheet visible onClose={vi.fn()} title="Compare" />)
    expect(screen.getByRole('dialog').getAttribute('data-animation')).toBe('slide')
    expect(styleOf(panelOf('Compare')).marginTop).toBe('auto')
    expect(styleOf(panelOf('Compare')).borderBottomLeftRadius).toBe(0)
  })
})
