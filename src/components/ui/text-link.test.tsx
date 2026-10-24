// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { applyScenario, env, SCENARIOS, styleOf } from '@/components/ui/v4/rn-stub'
import { isFocused } from '@/components/ui/focus-ring'
import { TextLink } from '@/components/ui/text-link'
import { colors } from '@/lib/theme'

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

describe('TextLink', () => {
  beforeEach(() => {
    applyScenario(SCENARIOS[0])
    coarsePointer(false)
  })

  it('is a link with link-blue words', () => {
    render(<TextLink label="Open the Base" onPress={vi.fn()} />)
    expect(screen.getByRole('link', { name: 'Open the Base' })).toBeTruthy()
    expect(styleOf(screen.getByText('Open the Base')).color).toBe(colors.link)
  })

  it('uses a fuller accessible name when given', () => {
    render(
      <TextLink
        label="example.com"
        accessibilityLabel="Open example.com in a new tab"
        onPress={vi.fn()}
      />
    )
    expect(screen.getByRole('link', { name: 'Open example.com in a new tab' }).textContent).toBe(
      'example.com'
    )
  })

  it('stays as tall as its text with a mouse', () => {
    render(<TextLink label="Change" onPress={vi.fn()} />)
    expect(styleOf(screen.getByRole('link')).minHeight).toBeUndefined()
  })

  it('grows its tap area to 44 x 44 on a coarse pointer', () => {
    coarsePointer(true)
    render(<TextLink label="Change" onPress={vi.fn()} />)
    expect(styleOf(screen.getByRole('link'))).toMatchObject({ minHeight: 44, minWidth: 44 })
  })

  it('grows its tap area to 44 x 44 in the phone app', () => {
    env.os = 'ios'
    render(<TextLink label="Change" onPress={vi.fn()} />)
    expect(styleOf(screen.getByRole('link'))).toMatchObject({ minHeight: 44, minWidth: 44 })
  })

  it('calls onPress, and not while disabled', () => {
    const onPress = vi.fn()
    const { rerender } = render(<TextLink label="All deployments" onPress={onPress} />)
    fireEvent.click(screen.getByRole('link'))
    expect(onPress).toHaveBeenCalledTimes(1)
    rerender(<TextLink label="All deployments" disabled onPress={onPress} />)
    fireEvent.click(screen.getByRole('link'))
    expect(onPress).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('link').getAttribute('aria-disabled')).toBe('true')
  })

  it('as a disclosure is a button that reports open or closed', () => {
    const { rerender } = render(
      <TextLink label="Show what will run" expanded={false} onPress={vi.fn()} />
    )
    expect(
      screen.getByRole('button', { name: 'Show what will run' }).getAttribute('aria-expanded')
    ).toBe('false')
    rerender(<TextLink label="Hide what will run" expanded onPress={vi.fn()} />)
    expect(
      screen.getByRole('button', { name: 'Hide what will run' }).getAttribute('aria-expanded')
    ).toBe('true')
  })
})

describe('isFocused', () => {
  it('reads the focused flag React Native Web passes to a style callback', () => {
    expect(isFocused({ pressed: false })).toBe(false)
    expect(isFocused({ pressed: false, focused: true } as never)).toBe(true)
  })
})
