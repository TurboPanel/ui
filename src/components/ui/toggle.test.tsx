// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { applyScenario, env, SCENARIOS, styleOf, token } from '@/components/ui/v4/rn-stub'
import { SWITCH_SIZE, Toggle } from '@/components/ui/toggle'

vi.mock('react-native', async () => (await import('@/components/ui/v4/rn-stub')).reactNativeStub)
vi.mock(
  '@/lib/theme-preference',
  async () => (await import('@/components/ui/v4/rn-stub')).themePreferenceStub
)

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function coarsePointer(coarse: boolean) {
  vi.stubGlobal('matchMedia', () => ({ matches: coarse }))
}

/** The track is the switch's first child; the knob sits inside it. */
function track(): HTMLElement {
  return screen.getByRole('switch').firstElementChild as HTMLElement
}

describe.each(SCENARIOS)('Toggle ($name)', (scenario) => {
  beforeEach(() => {
    applyScenario(scenario)
    coarsePointer(false)
  })

  it('is a switch that reports checked, with the state as a word', () => {
    render(<Toggle value accessibilityLabel="Deploy on push" onValueChange={vi.fn()} />)
    const control = screen.getByRole('switch', { name: 'Deploy on push' })
    expect(control.getAttribute('aria-checked')).toBe('true')
    expect(control.textContent).toBe('On')
  })

  it('reports unchecked when off', () => {
    render(<Toggle value={false} accessibilityLabel="Deploy on push" onValueChange={vi.fn()} />)
    expect(screen.getByRole('switch').getAttribute('aria-checked')).toBe('false')
    expect(screen.getByRole('switch').textContent).toBe('Off')
  })

  it('paints the track accent when on and quiet when off', () => {
    const { rerender } = render(<Toggle value onValueChange={vi.fn()} />)
    expect(styleOf(track()).backgroundColor).toBe(token(scenario, 'accent'))
    expect(styleOf(track().firstElementChild).backgroundColor).toBe(token(scenario, 'accentInk'))
    rerender(<Toggle value={false} onValueChange={vi.fn()} />)
    expect(styleOf(track()).backgroundColor).toBe(token(scenario, 'surface3'))
    expect(styleOf(track().firstElementChild).backgroundColor).toBe(token(scenario, 'text3'))
  })

  it('slides the knob to the far end when on', () => {
    const { rerender } = render(<Toggle value={false} onValueChange={vi.fn()} />)
    expect(styleOf(track().firstElementChild).transform).toEqual([{ translateX: 0 }])
    rerender(<Toggle value onValueChange={vi.fn()} />)
    const size = scenario.os === 'web' ? SWITCH_SIZE.pointer : SWITCH_SIZE.touch
    // Track width less its 1 px borders, the 2 px insets and the knob itself.
    expect(styleOf(track().firstElementChild).transform).toEqual([
      { translateX: size.width - 2 - 4 - size.knob },
    ])
  })

  it('uses the caller words', () => {
    render(<Toggle value={false} onLabel="Yes" offLabel="No" onValueChange={vi.fn()} />)
    expect(screen.getByRole('switch').textContent).toBe('No')
  })

  it('flips the value on press', () => {
    const onValueChange = vi.fn()
    render(<Toggle value={false} onValueChange={onValueChange} />)
    fireEvent.click(screen.getByRole('switch'))
    expect(onValueChange).toHaveBeenCalledWith(true)
  })

  it('does not flip while disabled, and says so', () => {
    const onValueChange = vi.fn()
    render(<Toggle value disabled onValueChange={onValueChange} />)
    fireEvent.click(screen.getByRole('switch'))
    expect(onValueChange).not.toHaveBeenCalled()
    expect(screen.getByRole('switch').getAttribute('aria-disabled')).toBe('true')
  })

  it('busy shows a spinner in place of the word and blocks the press', () => {
    const onValueChange = vi.fn()
    render(<Toggle value busy onValueChange={onValueChange} />)
    expect(screen.getByRole('progressbar')).toBeTruthy()
    expect(screen.getByRole('switch').getAttribute('aria-busy')).toBe('true')
    fireEvent.click(screen.getByRole('switch'))
    expect(onValueChange).not.toHaveBeenCalled()
  })
})

describe('Toggle sizes', () => {
  beforeEach(() => {
    applyScenario(SCENARIOS[0])
    coarsePointer(false)
  })

  it('is a compact 40 x 24 track in a 36 px row with a mouse', () => {
    render(<Toggle value onValueChange={vi.fn()} />)
    expect(styleOf(screen.getByRole('switch')).minHeight).toBe(36)
    expect(styleOf(track())).toMatchObject({ width: 40, height: 24 })
  })

  it('is at least 44 pt tall with an iOS-size track on a coarse pointer', () => {
    coarsePointer(true)
    render(<Toggle value onValueChange={vi.fn()} />)
    expect(styleOf(screen.getByRole('switch')).minHeight).toBe(44)
    expect(styleOf(track())).toMatchObject({ width: 51, height: 31 })
  })

  it('is at least 44 pt tall in the phone app', () => {
    env.os = 'ios'
    render(<Toggle value onValueChange={vi.fn()} />)
    expect(styleOf(screen.getByRole('switch')).minHeight).toBe(44)
  })

  it('fits the knob inside the track at both sizes', () => {
    for (const size of Object.values(SWITCH_SIZE)) {
      expect(size.knob).toBe(size.height - 2 - 4)
    }
  })
})
