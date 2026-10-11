// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type Props = Readonly<Record<string, unknown> & { children?: ReactNode }>

// Plain DOM stand-ins for the few React Native pieces the switch uses, so the
// test checks roles, labels and behaviour without a native runtime.
vi.mock('react-native', () => ({
  Platform: { OS: 'web', select: (o: Record<string, unknown>) => o.web ?? o.default },
  StyleSheet: { create: (styles: unknown) => styles },
  View: ({ children, accessibilityRole, accessibilityLabel }: Props) => (
    <div role={accessibilityRole as string} aria-label={accessibilityLabel as string}>
      {children}
    </div>
  ),
  Text: ({ children }: Props) => <span>{children}</span>,
  Pressable: ({
    children,
    onPress,
    accessibilityRole,
    accessibilityLabel,
    accessibilityState,
    title,
  }: Props) => (
    <button
      type="button"
      role={accessibilityRole as string}
      aria-label={accessibilityLabel as string}
      aria-checked={(accessibilityState as { checked?: boolean }).checked}
      title={title as string}
      onClick={onPress as () => void}
    >
      {children as ReactNode}
    </button>
  ),
}))

vi.mock('react-native-svg', () => ({
  default: ({ children }: Props) => <svg>{children}</svg>,
  Circle: () => null,
  Path: () => null,
  Rect: () => null,
}))

function memoryStorage() {
  const data = new Map<string, string>()
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
  }
}

let storage = memoryStorage()

async function loadSwitch() {
  vi.resetModules()
  return (await import('@/components/header-theme-switch')).ThemeSwitch
}

beforeEach(() => {
  storage = memoryStorage()
  vi.stubGlobal('localStorage', storage)
  vi.stubGlobal('matchMedia', () => ({
    matches: true,
    addEventListener: () => {},
    removeEventListener: () => {},
  }))
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  document.documentElement.removeAttribute('data-theme')
})

describe.each(['header', 'menu'] as const)('ThemeSwitch (%s)', (variant) => {
  it('is one radio group named Theme with Light, Dark and Match computer', async () => {
    const ThemeSwitch = await loadSwitch()
    render(<ThemeSwitch variant={variant} />)
    expect(screen.getByRole('radiogroup', { name: 'Theme' })).toBeTruthy()
    const names = screen.getAllByRole('radio').map((el) => el.getAttribute('aria-label'))
    expect(names).toEqual(['Light', 'Dark', 'Match computer'])
  })

  it('checks Match computer by default, and only that one', async () => {
    const ThemeSwitch = await loadSwitch()
    render(<ThemeSwitch variant={variant} />)
    const checked = screen
      .getAllByRole('radio')
      .filter((el) => el.getAttribute('aria-checked') === 'true')
      .map((el) => el.getAttribute('aria-label'))
    expect(checked).toEqual(['Match computer'])
  })

  it('choosing Light checks it and saves it in this browser only', async () => {
    const ThemeSwitch = await loadSwitch()
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    render(<ThemeSwitch variant={variant} />)
    fireEvent.click(screen.getByRole('radio', { name: 'Light' }))
    expect(screen.getByRole('radio', { name: 'Light' }).getAttribute('aria-checked')).toBe('true')
    expect(screen.getByRole('radio', { name: 'Match computer' }).getAttribute('aria-checked')).toBe('false')
    expect(storage.getItem('turbopanel.theme')).toBe('light')
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('choosing Match computer again forgets the saved choice', async () => {
    const ThemeSwitch = await loadSwitch()
    render(<ThemeSwitch variant={variant} />)
    fireEvent.click(screen.getByRole('radio', { name: 'Dark' }))
    expect(storage.getItem('turbopanel.theme')).toBe('dark')
    fireEvent.click(screen.getByRole('radio', { name: 'Match computer' }))
    expect(storage.getItem('turbopanel.theme')).toBeNull()
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false)
  })

  it('starts on the saved choice', async () => {
    storage.setItem('turbopanel.theme', 'dark')
    const ThemeSwitch = await loadSwitch()
    render(<ThemeSwitch variant={variant} />)
    expect(screen.getByRole('radio', { name: 'Dark' }).getAttribute('aria-checked')).toBe('true')
  })

  it('draws nothing where screens cannot follow the choice (phone app)', async () => {
    // The phone app has no document when the theme module loads.
    vi.stubGlobal('document', undefined)
    const ThemeSwitch = await loadSwitch()
    vi.unstubAllGlobals()
    const { container } = render(<ThemeSwitch variant={variant} />)
    expect(container.innerHTML).toBe('')
  })
})
