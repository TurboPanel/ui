// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { applyScenario, env, SCENARIOS, styleOf, token } from '@/components/ui/v4/rn-stub'
import { ActionButton } from '@/components/ui/v4/action-button'

vi.mock('react-native', async () => (await import('@/components/ui/v4/rn-stub')).reactNativeStub)
vi.mock('@/lib/theme-preference', async () => (await import('@/components/ui/v4/rn-stub')).themePreferenceStub)

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function coarsePointer(coarse: boolean) {
  vi.stubGlobal('matchMedia', () => ({ matches: coarse }))
}

describe.each(SCENARIOS)('ActionButton ($name)', (scenario) => {
  beforeEach(() => {
    applyScenario(scenario)
    coarsePointer(false)
  })

  it('primary is brand blue with white text', () => {
    render(<ActionButton label="Deploy now" variant="primary" onPress={vi.fn()} />)
    const button = screen.getByRole('button', { name: 'Deploy now' })
    expect(styleOf(button).backgroundColor).toBe(token(scenario, 'accent'))
    expect(styleOf(screen.getByText('Deploy now')).color).toBe(token(scenario, 'accentInk'))
  })

  it('secondary is a quiet fill with a border', () => {
    render(<ActionButton label="Review" onPress={vi.fn()} />)
    const style = styleOf(screen.getByRole('button', { name: 'Review' }))
    expect(style.backgroundColor).toBe(token(scenario, 'surface2'))
    expect(style.borderColor).toBe(token(scenario, 'sepStrong'))
    expect(styleOf(screen.getByText('Review')).color).toBe(token(scenario, 'text'))
  })

  it('quiet has no fill and link-blue text', () => {
    render(<ActionButton label="Cancel" variant="quiet" onPress={vi.fn()} />)
    expect(styleOf(screen.getByRole('button')).backgroundColor).toBe('transparent')
    expect(styleOf(screen.getByText('Cancel')).color).toBe(token(scenario, 'link'))
  })

  it('danger is a red outline; dangerSolid is a red fill for the final confirm', () => {
    const { rerender } = render(<ActionButton label="Remove" variant="danger" onPress={vi.fn()} />)
    expect(styleOf(screen.getByRole('button')).borderColor).toBe(token(scenario, 'bad'))
    expect(styleOf(screen.getByRole('button')).backgroundColor).toBe('transparent')
    expect(styleOf(screen.getByText('Remove')).color).toBe(token(scenario, 'bad'))
    rerender(<ActionButton label="Remove" variant="dangerSolid" onPress={vi.fn()} />)
    expect(styleOf(screen.getByRole('button')).backgroundColor).toBe(token(scenario, 'bad'))
    expect(styleOf(screen.getByText('Remove')).color).toBe(token(scenario, 'knob'))
  })

  it('calls onPress', () => {
    const onPress = vi.fn()
    render(<ActionButton label="Save" onPress={onPress} />)
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(onPress).toHaveBeenCalledTimes(1)
  })

  it('does not press while disabled, and says so', () => {
    const onPress = vi.fn()
    render(<ActionButton label="Save" onPress={onPress} disabled />)
    const button = screen.getByRole('button', { name: 'Save' })
    fireEvent.click(button)
    expect(onPress).not.toHaveBeenCalled()
    expect(button.getAttribute('aria-disabled')).toBe('true')
    expect(styleOf(button).opacity).toBe(0.45)
  })

  it('busy blocks the press, shows a spinner and the busy label', () => {
    const onPress = vi.fn()
    render(<ActionButton label="Save" busyLabel="Saving…" busy onPress={onPress} />)
    const button = screen.getByRole('button', { name: 'Save' })
    expect(button.textContent).toBe('Saving…')
    expect(screen.getByRole('progressbar')).toBeTruthy()
    expect(button.getAttribute('aria-busy')).toBe('true')
    fireEvent.click(button)
    expect(onPress).not.toHaveBeenCalled()
  })

  it('keeps the label while busy when no busy label is given', () => {
    render(<ActionButton label="Save" busy onPress={vi.fn()} />)
    expect(screen.getByRole('button').textContent).toBe('Save')
  })

  it('uses a separate accessible name when given', () => {
    render(<ActionButton label="Undo" accessibilityLabel="Undo start command" size="sm" onPress={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Undo start command' }).textContent).toBe('Undo')
  })

  it('renders an icon before the label', () => {
    render(<ActionButton label="Add" icon={<i data-testid="plus" />} onPress={vi.fn()} />)
    expect(screen.getByTestId('plus')).toBeTruthy()
  })

  it('stretches to the parent when asked', () => {
    render(<ActionButton label="Continue" fill onPress={vi.fn()} />)
    expect(styleOf(screen.getByRole('button')).alignSelf).toBe('stretch')
  })

  it('never sets fontWeight (the family names the weight)', () => {
    render(<ActionButton label="Save" onPress={vi.fn()} />)
    expect(styleOf(screen.getByText('Save'))).not.toHaveProperty('fontWeight')
  })
})

describe('ActionButton sizes', () => {
  beforeEach(() => {
    applyScenario(SCENARIOS[0])
    coarsePointer(false)
  })

  it('is 36 px by default, 32 small, 44 large with a mouse', () => {
    const { rerender } = render(<ActionButton label="Go" onPress={vi.fn()} />)
    expect(styleOf(screen.getByRole('button')).minHeight).toBe(36)
    rerender(<ActionButton label="Go" size="sm" onPress={vi.fn()} />)
    expect(styleOf(screen.getByRole('button')).minHeight).toBe(32)
    rerender(<ActionButton label="Go" size="lg" onPress={vi.fn()} />)
    expect(styleOf(screen.getByRole('button')).minHeight).toBe(44)
  })

  it('is 44 px at every size on a coarse pointer', () => {
    coarsePointer(true)
    const { rerender } = render(<ActionButton label="Go" onPress={vi.fn()} />)
    expect(styleOf(screen.getByRole('button')).minHeight).toBe(44)
    rerender(<ActionButton label="Go" size="sm" onPress={vi.fn()} />)
    expect(styleOf(screen.getByRole('button')).minHeight).toBe(44)
  })

  it('is 44 px at every size in the phone app', () => {
    env.os = 'ios'
    const { rerender } = render(<ActionButton label="Go" onPress={vi.fn()} />)
    expect(styleOf(screen.getByRole('button')).minHeight).toBe(44)
    rerender(<ActionButton label="Go" size="sm" onPress={vi.fn()} />)
    expect(styleOf(screen.getByRole('button')).minHeight).toBe(44)
  })

  it('falls back to a mouse when the browser cannot answer', () => {
    vi.stubGlobal('matchMedia', undefined)
    render(<ActionButton label="Go" onPress={vi.fn()} />)
    expect(styleOf(screen.getByRole('button')).minHeight).toBe(36)
  })
})
