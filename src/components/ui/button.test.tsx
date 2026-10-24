// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { applyScenario, env, SCENARIOS, styleOf } from '@/components/ui/v4/rn-stub'
import { Button, buttonMinHeight } from '@/components/ui/button'

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

describe('buttonMinHeight', () => {
  it('keeps the mouse sizes and raises both to 44 on touch', () => {
    expect(buttonMinHeight('md', false)).toBe(40)
    expect(buttonMinHeight('sm', false)).toBe(32)
    expect(buttonMinHeight('md', true)).toBe(44)
    expect(buttonMinHeight('sm', true)).toBe(44)
  })
})

describe('Button sizes', () => {
  beforeEach(() => {
    applyScenario(SCENARIOS[0])
    coarsePointer(false)
  })

  it('is 40 by default and 32 small with a mouse', () => {
    const { rerender } = render(<Button label="Save" onPress={vi.fn()} />)
    expect(styleOf(screen.getByRole('button')).minHeight).toBe(40)
    rerender(<Button label="Save" size="sm" onPress={vi.fn()} />)
    expect(styleOf(screen.getByRole('button')).minHeight).toBe(32)
  })

  it('is 44 at every size on a coarse pointer', () => {
    coarsePointer(true)
    const { rerender } = render(<Button label="Save" onPress={vi.fn()} />)
    expect(styleOf(screen.getByRole('button')).minHeight).toBe(44)
    rerender(<Button label="Save branch" size="sm" onPress={vi.fn()} />)
    expect(styleOf(screen.getByRole('button')).minHeight).toBe(44)
  })

  it('is 44 at every size in the phone app', () => {
    env.os = 'ios'
    const { rerender } = render(<Button label="Save" onPress={vi.fn()} />)
    expect(styleOf(screen.getByRole('button')).minHeight).toBe(44)
    rerender(<Button label="Follow the project" size="sm" onPress={vi.fn()} />)
    expect(styleOf(screen.getByRole('button')).minHeight).toBe(44)
  })
})

describe('Button behaviour', () => {
  beforeEach(() => {
    applyScenario(SCENARIOS[0])
    coarsePointer(false)
  })

  it('calls onPress', () => {
    const onPress = vi.fn()
    render(<Button label="Save" onPress={onPress} />)
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(onPress).toHaveBeenCalledTimes(1)
  })

  it('busy blocks the press, shows a spinner and the busy label', () => {
    const onPress = vi.fn()
    render(<Button label="Save" busyLabel="Saving…" busy onPress={onPress} />)
    const button = screen.getByRole('button', { name: 'Save' })
    expect(button.textContent).toBe('Saving…')
    expect(button.getAttribute('aria-busy')).toBe('true')
    expect(button.getAttribute('aria-disabled')).toBe('true')
    fireEvent.click(button)
    expect(onPress).not.toHaveBeenCalled()
  })
})
