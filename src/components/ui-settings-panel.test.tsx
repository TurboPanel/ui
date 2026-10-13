// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

let windowWidth = 1280
let platformOS = 'web'

type Props = Readonly<Record<string, unknown> & { children?: ReactNode }>

// Plain DOM stand-ins for the few React Native pieces the panel uses, so the
// test checks roles, labels and behaviour without a native runtime.
vi.mock('react-native', () => ({
  Platform: {
    get OS() {
      return platformOS
    }, select: (o: Record<string, unknown>) => o.web ?? o.default },
  StyleSheet: { create: (styles: unknown) => styles },
  View: ({ children, accessibilityRole, accessibilityLabel, onKeyDown }: Props) => (
    <div
      role={accessibilityRole as string}
      aria-label={accessibilityLabel as string}
      onKeyDown={onKeyDown as never}
    >
      {children}
    </div>
  ),
  useWindowDimensions: () => ({ width: windowWidth, height: 800 }),
  Text: ({ children }: Props) => <span>{children}</span>,
  Pressable: ({
    children,
    onPress,
    accessibilityRole,
    accessibilityLabel,
    accessibilityState,
    title,
    tabIndex,
  }: Props) => (
    <button
      type="button"
      role={accessibilityRole as string}
      aria-label={accessibilityLabel as string}
      aria-checked={(accessibilityState as { checked?: boolean }).checked}
      aria-expanded={(accessibilityState as { expanded?: boolean }).expanded}
      tabIndex={tabIndex as number}
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

async function loadPanel() {
  vi.resetModules()
  return (await import('@/components/ui-settings-panel')).UiSettings
}

async function openPanel() {
  const UiSettings = await loadPanel()
  render(<UiSettings />)
  fireEvent.click(screen.getByRole('button', { name: 'UI settings' }))
}

beforeEach(() => {
  windowWidth = 1280
  platformOS = 'web'
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

const checkedNames = (group: string) =>
  within(screen.getByRole('radiogroup', { name: group }))
    .getAllByRole('radio')
    .filter((el) => el.getAttribute('aria-checked') === 'true')
    .map((el) => el.getAttribute('aria-label'))

describe('UiSettings', () => {
  it('is collapsed until the row is opened', async () => {
    const UiSettings = await loadPanel()
    render(<UiSettings />)
    const toggle = screen.getByRole('button', { name: 'UI settings' })
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByRole('radiogroup')).toBeNull()
    fireEvent.click(toggle)
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    expect(screen.getAllByRole('radiogroup')).toHaveLength(2)
    fireEvent.click(toggle)
    expect(screen.queryByRole('radiogroup')).toBeNull()
  })

  it('has a Theme group of Light, Dark and Match computer, defaulting to Match computer', async () => {
    await openPanel()
    const names = within(screen.getByRole('radiogroup', { name: 'Theme' }))
      .getAllByRole('radio')
      .map((el) => el.getAttribute('aria-label'))
    expect(names).toEqual(['Light', 'Dark', 'Match computer'])
    expect(checkedNames('Theme')).toEqual(['Match computer'])
  })

  it('choosing Light checks it and saves it in this browser only', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    await openPanel()
    fireEvent.click(screen.getByRole('radio', { name: 'Light' }))
    expect(checkedNames('Theme')).toEqual(['Light'])
    expect(storage.getItem('turbopanel.theme')).toBe('light')
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('choosing Match computer again forgets the saved choice', async () => {
    await openPanel()
    fireEvent.click(screen.getByRole('radio', { name: 'Dark' }))
    expect(storage.getItem('turbopanel.theme')).toBe('dark')
    fireEvent.click(screen.getByRole('radio', { name: 'Match computer' }))
    expect(storage.getItem('turbopanel.theme')).toBeNull()
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false)
  })

  it('starts on the saved theme', async () => {
    storage.setItem('turbopanel.theme', 'dark')
    await openPanel()
    expect(checkedNames('Theme')).toEqual(['Dark'])
  })

  it('Home and End jump to the first and last option', async () => {
    await openPanel()
    fireEvent.keyDown(screen.getByRole('radio', { name: 'Match computer' }), { key: 'Home' })
    expect(checkedNames('Theme')).toEqual(['Light'])
    fireEvent.keyDown(screen.getByRole('radio', { name: 'Light' }), { key: 'End' })
    expect(checkedNames('Theme')).toEqual(['Match computer'])
  })

  it('hides the Page layout row off web but keeps Theme', async () => {
    platformOS = 'ios'
    await openPanel()
    expect(screen.getByRole('radiogroup', { name: 'Theme' })).toBeTruthy()
    expect(screen.queryByRole('radiogroup', { name: 'Page layout' })).toBeNull()
  })

  it('has a Page layout group of Left, Center and Wide that follows the stored choice', async () => {
    storage.setItem('turbopanel.pageWidth', 'center')
    await openPanel()
    const names = within(screen.getByRole('radiogroup', { name: 'Page layout' }))
      .getAllByRole('radio')
      .map((el) => el.getAttribute('aria-label'))
    expect(names).toEqual(['Left', 'Center', 'Wide'])
    expect(checkedNames('Page layout')).toEqual(['Center'])
    fireEvent.click(screen.getByRole('radio', { name: 'Wide' }))
    expect(storage.getItem('turbopanel.pageWidth')).toBe('wide')
    expect(checkedNames('Page layout')).toEqual(['Wide'])
  })

  it('reads a stored "contained" as Left', async () => {
    storage.setItem('turbopanel.pageWidth', 'contained')
    await openPanel()
    expect(checkedNames('Page layout')).toEqual(['Left'])
  })

  it('hides the Page layout row under 1024 wide but keeps Theme', async () => {
    windowWidth = 1023
    await openPanel()
    expect(screen.getByRole('radiogroup', { name: 'Theme' })).toBeTruthy()
    expect(screen.queryByRole('radiogroup', { name: 'Page layout' })).toBeNull()
  })

  it('makes only the checked option a tab stop, and arrow keys move the choice', async () => {
    await openPanel()
    const group = screen.getByRole('radiogroup', { name: 'Theme' })
    const tabIndexes = within(group)
      .getAllByRole('radio')
      .map((el) => el.tabIndex)
    expect(tabIndexes).toEqual([-1, -1, 0])
    fireEvent.keyDown(screen.getByRole('radio', { name: 'Match computer' }), { key: 'ArrowRight' })
    expect(checkedNames('Theme')).toEqual(['Light'])
    expect(storage.getItem('turbopanel.theme')).toBe('light')
    fireEvent.keyDown(screen.getByRole('radio', { name: 'Light' }), { key: 'ArrowLeft' })
    expect(checkedNames('Theme')).toEqual(['Match computer'])
    fireEvent.keyDown(screen.getByRole('radio', { name: 'Match computer' }), { key: 'ArrowUp' })
    expect(checkedNames('Theme')).toEqual(['Dark'])
  })

  it('draws no Theme row where screens cannot follow it (phone app)', async () => {
    // The phone app has no document when the theme module loads.
    vi.stubGlobal('document', undefined)
    const UiSettings = await loadPanel()
    vi.unstubAllGlobals()
    vi.stubGlobal('localStorage', storage)
    render(<UiSettings />)
    fireEvent.click(screen.getByRole('button', { name: 'UI settings' }))
    expect(screen.queryByRole('radiogroup', { name: 'Theme' })).toBeNull()
    expect(screen.getByRole('radiogroup', { name: 'Page layout' })).toBeTruthy()
  })
})
