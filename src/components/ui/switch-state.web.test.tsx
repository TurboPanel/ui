// @vitest-environment happy-dom
/**
 * The checked / expanded state as the browser really sees it. These render
 * through React Native Web itself, not the test stand-ins: React Native Web
 * drops `accessibilityState`, so a control that only sets that prop reaches a
 * screen reader with no state at all, and only a real render shows it.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Checkbox } from '@/components/ui/checkbox'
import { TextLink } from '@/components/ui/text-link'
import { Toggle } from '@/components/ui/toggle'

vi.mock('react-native', () => vi.importActual('react-native-web'))
vi.mock('react-native-svg', () => ({ default: () => null, Path: () => null }))
vi.mock(
  '@/lib/theme-preference',
  async () => (await import('@/components/ui/v4/rn-stub')).themePreferenceStub
)

afterEach(cleanup)

describe('switch state on the web', () => {
  it('reports on and off to the browser', () => {
    const { rerender } = render(
      <Toggle value accessibilityLabel="Allow Let's Encrypt certificates" onValueChange={vi.fn()} />
    )
    const control = screen.getByRole('switch', { name: "Allow Let's Encrypt certificates" })
    expect(control.getAttribute('aria-checked')).toBe('true')
    rerender(
      <Toggle
        value={false}
        accessibilityLabel="Allow Let's Encrypt certificates"
        onValueChange={vi.fn()}
      />
    )
    expect(control.getAttribute('aria-checked')).toBe('false')
  })

  it('reports disabled to the browser', () => {
    render(<Toggle value disabled accessibilityLabel="Deploy on push" onValueChange={vi.fn()} />)
    expect(screen.getByRole('switch').getAttribute('aria-disabled')).toBe('true')
  })

  it('flips on click', () => {
    const onValueChange = vi.fn()
    render(
      <Toggle value={false} accessibilityLabel="Deploy on push" onValueChange={onValueChange} />
    )
    fireEvent.click(screen.getByRole('switch'))
    expect(onValueChange).toHaveBeenCalledWith(true)
  })

  it('flips on a click on the knob, which passes the press to the switch', () => {
    const onValueChange = vi.fn()
    render(
      <Toggle
        value={false}
        accessibilityLabel="Database admin login"
        onValueChange={onValueChange}
      />
    )
    const control = screen.getByRole('switch')
    const track = control.firstElementChild as HTMLElement
    const knob = track.firstElementChild as HTMLElement
    expect(getComputedStyle(track).pointerEvents).toBe('none')
    fireEvent.click(knob)
    expect(onValueChange).toHaveBeenCalledWith(true)
  })
})

describe('checkbox state on the web', () => {
  it('reports checked, unchecked and mixed', () => {
    const { rerender } = render(<Checkbox checked label="Select row" onPress={vi.fn()} />)
    const box = screen.getByRole('checkbox', { name: 'Select row' })
    expect(box.getAttribute('aria-checked')).toBe('true')
    rerender(<Checkbox checked={false} label="Select row" onPress={vi.fn()} />)
    expect(box.getAttribute('aria-checked')).toBe('false')
    rerender(<Checkbox checked={false} indeterminate label="Select row" onPress={vi.fn()} />)
    expect(box.getAttribute('aria-checked')).toBe('mixed')
  })
})

describe('text link on the web', () => {
  it('is a link', () => {
    render(<TextLink label="Open the Base" onPress={vi.fn()} />)
    expect(screen.getByRole('link', { name: 'Open the Base' })).toBeTruthy()
  })

  it('as a disclosure is a button that reports open or closed', () => {
    const { rerender } = render(
      <TextLink label="Show what will run" expanded={false} onPress={vi.fn()} />
    )
    const button = screen.getByRole('button', { name: 'Show what will run' })
    expect(button.getAttribute('aria-expanded')).toBe('false')
    rerender(<TextLink label="Show what will run" expanded onPress={vi.fn()} />)
    expect(button.getAttribute('aria-expanded')).toBe('true')
  })
})
