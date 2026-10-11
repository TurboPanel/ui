// @vitest-environment happy-dom
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { runInNewContext } from 'node:vm'
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { navyPalette, paperPalette } from '@/lib/theme-palettes'

type Prefs = typeof import('@/lib/theme-preference')

const KEY = 'turbopanel.theme'

/** A device that reports `dark` and lets a test flip it. */
function stubDevice(dark: boolean) {
  const listeners = new Set<() => void>()
  const query = {
    matches: dark,
    addEventListener: (_type: string, listener: () => void) => listeners.add(listener),
    removeEventListener: (_type: string, listener: () => void) => listeners.delete(listener),
  }
  vi.stubGlobal('matchMedia', () => query)
  return {
    flip(next: boolean) {
      query.matches = next
      for (const listener of listeners) listener()
    },
    listeners,
  }
}

/** Fresh module state, as on a page load. */
async function load(): Promise<Prefs> {
  vi.resetModules()
  return import('@/lib/theme-preference')
}

/** A browser storage that every Node and happy-dom version agrees on. */
function memoryStorage() {
  const data = new Map<string, string>()
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
  }
}

let storage = memoryStorage()

beforeEach(() => {
  storage = memoryStorage()
  vi.stubGlobal('localStorage', storage)
  document.documentElement.removeAttribute('data-theme')
  stubDevice(true)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('parseThemeMode', () => {
  it('accepts light and dark and falls back to Match computer', async () => {
    const { parseThemeMode } = await load()
    expect(parseThemeMode('light')).toBe('light')
    expect(parseThemeMode('dark')).toBe('dark')
    expect(parseThemeMode('system')).toBe('system')
    expect(parseThemeMode('sepia')).toBe('system')
    expect(parseThemeMode('')).toBe('system')
    expect(parseThemeMode(null)).toBe('system')
    expect(parseThemeMode(undefined)).toBe('system')
  })
})

describe('resolveColorScheme', () => {
  it('follows the device only for Match computer', async () => {
    const { resolveColorScheme } = await load()
    expect(resolveColorScheme('system', true)).toBe('dark')
    expect(resolveColorScheme('system', false)).toBe('light')
    expect(resolveColorScheme('light', true)).toBe('light')
    expect(resolveColorScheme('dark', false)).toBe('dark')
  })

  it('pins to dark where light is not supported yet', async () => {
    const { resolveColorScheme } = await load()
    expect(resolveColorScheme('light', false, false)).toBe('dark')
    expect(resolveColorScheme('system', false, false)).toBe('dark')
  })

  it('labels the three choices in plain words', async () => {
    const { THEME_MODE_LABELS, THEME_MODES } = await load()
    expect(THEME_MODES).toEqual(['light', 'dark', 'system'])
    expect(THEME_MODE_LABELS).toEqual({
      light: 'Light',
      dark: 'Dark',
      system: 'Match computer',
    })
  })
})

describe('themeBootScript', () => {
  function runBoot(script: string, stored: string | null, throws = false) {
    const root = { value: null as string | null, setAttribute(_n: string, v: string) { this.value = v } }
    const storage = {
      getItem: (key: string) => {
        if (throws) throw new Error('blocked')
        return key === KEY ? stored : null
      },
    }
    runInNewContext(script, { localStorage: storage, document: { documentElement: root } })
    return root.value
  }

  it('applies a saved Light or Dark choice and nothing else', async () => {
    const { themeBootScript } = await load()
    const script = themeBootScript()
    expect(runBoot(script, 'light')).toBe('light')
    expect(runBoot(script, 'dark')).toBe('dark')
    expect(runBoot(script, null)).toBeNull()
    expect(runBoot(script, 'system')).toBeNull()
    expect(runBoot(script, 'junk')).toBeNull()
  })

  it('survives blocked storage', async () => {
    const { themeBootScript } = await load()
    expect(runBoot(themeBootScript(), 'light', true)).toBeNull()
  })

  it('is exactly the file the static page loads (public/theme-boot.js)', async () => {
    const { themeBootScript } = await load()
    const file = readFileSync(
      path.join(import.meta.dirname, '..', '..', 'public', 'theme-boot.js'),
      'utf8',
    )
    expect(file.trim()).toBe(themeBootScript())
  })
})

describe('theme store', () => {
  it('starts on Match computer with no saved choice and no data-theme', async () => {
    const prefs = await load()
    expect(prefs.getThemeMode()).toBe('system')
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false)
  })

  it('reads a saved choice on load and applies it to the page', async () => {
    storage.setItem(KEY, 'light')
    const prefs = await load()
    expect(prefs.getThemeMode()).toBe('light')
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
  })

  it('ignores a junk saved value', async () => {
    storage.setItem(KEY, 'neon')
    const prefs = await load()
    expect(prefs.getThemeMode()).toBe('system')
  })

  it('saves Light and Dark in this browser, and clears the key for Match computer', async () => {
    const prefs = await load()
    prefs.setThemeMode('dark')
    expect(storage.getItem(KEY)).toBe('dark')
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
    prefs.setThemeMode('light')
    expect(storage.getItem(KEY)).toBe('light')
    prefs.setThemeMode('system')
    expect(storage.getItem(KEY)).toBeNull()
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false)
  })

  it('never sends the choice anywhere: no network call', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    const prefs = await load()
    prefs.setThemeMode('light')
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('notifies subscribers once per real change', async () => {
    const prefs = await load()
    const listener = vi.fn()
    const unsubscribe = prefs.subscribeTheme(listener)
    prefs.setThemeMode('light')
    prefs.setThemeMode('light')
    expect(listener).toHaveBeenCalledTimes(1)
    unsubscribe()
    prefs.setThemeMode('dark')
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('keeps the choice for the session when storage throws', async () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
      removeItem: () => {
        throw new Error('blocked')
      },
    })
    const prefs = await load()
    expect(prefs.getThemeMode()).toBe('system')
    expect(() => prefs.setThemeMode('light')).not.toThrow()
    expect(prefs.getThemeMode()).toBe('light')
    expect(() => prefs.setThemeMode('system')).not.toThrow()
  })

  it('works when there is no storage at all', async () => {
    vi.stubGlobal('localStorage', undefined)
    const prefs = await load()
    expect(prefs.getThemeMode()).toBe('system')
    expect(() => prefs.setThemeMode('dark')).not.toThrow()
    expect(prefs.getThemeMode()).toBe('dark')
  })
})

describe('getColorScheme', () => {
  it('Match computer follows the device', async () => {
    const device = stubDevice(false)
    const prefs = await load()
    expect(prefs.getColorScheme()).toBe('light')
    device.flip(true)
    expect(prefs.getColorScheme()).toBe('dark')
  })

  it('an explicit choice beats the device', async () => {
    stubDevice(true)
    const prefs = await load()
    prefs.setThemeMode('light')
    expect(prefs.getColorScheme()).toBe('light')
    prefs.setThemeMode('dark')
    stubDevice(false)
    expect(prefs.getColorScheme()).toBe('dark')
  })

  it('assumes dark when the device cannot say', async () => {
    vi.stubGlobal('matchMedia', undefined)
    const prefs = await load()
    expect(prefs.getColorScheme()).toBe('dark')
    const unsubscribe = prefs.subscribeTheme(() => {})
    expect(() => unsubscribe()).not.toThrow()
  })

  it('is pinned to dark with no document (the phone app)', async () => {
    vi.stubGlobal('document', undefined)
    stubDevice(false)
    const prefs = await load()
    expect(prefs.themeSwitchSupported()).toBe(false)
    prefs.setThemeMode('light')
    expect(prefs.getColorScheme()).toBe('dark')
  })

  it('the switch is supported in the browser', async () => {
    const prefs = await load()
    expect(prefs.themeSwitchSupported()).toBe(true)
  })
})

describe('hooks', () => {
  it('useThemeMode and useColorScheme re-render on a choice', async () => {
    const prefs = await load()
    const mode = renderHook(() => prefs.useThemeMode())
    const scheme = renderHook(() => prefs.useColorScheme())
    expect(mode.result.current).toBe('system')
    expect(scheme.result.current).toBe('dark')
    act(() => prefs.setThemeMode('light'))
    expect(mode.result.current).toBe('light')
    expect(scheme.result.current).toBe('light')
  })

  it('re-renders when the device changes under Match computer, and stops after unmount', async () => {
    const device = stubDevice(true)
    const prefs = await load()
    const scheme = renderHook(() => prefs.useColorScheme())
    expect(scheme.result.current).toBe('dark')
    act(() => device.flip(false))
    expect(scheme.result.current).toBe('light')
    scheme.unmount()
    expect(device.listeners.size).toBe(0)
  })

  it('useColors returns the real palette values for the scheme in use', async () => {
    const prefs = await load()
    const colors = renderHook(() => prefs.useColors())
    expect(colors.result.current).toEqual(navyPalette)
    act(() => prefs.setThemeMode('light'))
    expect(colors.result.current).toEqual(paperPalette)
    expect(colors.result.current.bg).toMatch(/^#[0-9a-f]{6}$/i)
  })
})
