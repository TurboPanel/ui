import { useSyncExternalStore } from 'react'
import { paletteFor, type ColorScheme, type Palette } from '@/lib/theme-palettes'

/**
 * Theme choice: Light, Dark, or Match computer (the default). Stored in this
 * browser only (localStorage), never on the server. Where storage is missing
 * or throws, the choice lasts for the session.
 *
 * The browser app has both themes. The phone app's screens still read fixed
 * Navy colours, so there the resolved scheme is always dark until each screen
 * moves to `useColors()` (see AGENTS.md, Theme).
 */
export type ThemeMode = 'light' | 'dark' | 'system'

export const THEME_MODES: readonly ThemeMode[] = ['light', 'dark', 'system']

export const THEME_STORAGE_KEY = 'turbopanel.theme'

export const THEME_MODE_LABELS: Readonly<Record<ThemeMode, string>> = {
  light: 'Light',
  dark: 'Dark',
  system: 'Match computer',
}

export function parseThemeMode(value: string | null | undefined): ThemeMode {
  return value === 'light' || value === 'dark' ? value : 'system'
}

/**
 * The scheme to paint. `supportsLight` is false where screens cannot switch
 * yet (phone app), which pins the result to dark.
 */
export function resolveColorScheme(
  mode: ThemeMode,
  deviceIsDark: boolean,
  supportsLight = true,
): ColorScheme {
  if (!supportsLight) return 'dark'
  if (mode === 'system') return deviceIsDark ? 'dark' : 'light'
  return mode
}

/**
 * Runs in the page head before first paint: copies a saved Light or Dark
 * choice onto `<html data-theme>`. Without a saved choice nothing is set and
 * the stylesheet follows the device. Plain ES5 so it needs no build step.
 */
export function themeBootScript(): string {
  return (
    `try{var t=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});` +
    `if(t==='light'||t==='dark'){document.documentElement.setAttribute('data-theme',t);}}catch(e){}`
  )
}

const supportsLight = typeof document !== 'undefined'

function readStored(): ThemeMode {
  try {
    if (typeof localStorage === 'undefined') return 'system'
    return parseThemeMode(localStorage.getItem(THEME_STORAGE_KEY))
  } catch {
    return 'system'
  }
}

function writeStored(mode: ThemeMode): void {
  try {
    if (typeof localStorage === 'undefined') return
    if (mode === 'system') {
      localStorage.removeItem(THEME_STORAGE_KEY)
    } else {
      localStorage.setItem(THEME_STORAGE_KEY, mode)
    }
  } catch {
    // Private windows and blocked storage: the choice still holds in memory.
  }
}

function applyToDocument(mode: ThemeMode): void {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  if (mode === 'system') {
    root.removeAttribute('data-theme')
  } else {
    root.setAttribute('data-theme', mode)
  }
}

function deviceQuery(): MediaQueryList | null {
  if (typeof globalThis.matchMedia !== 'function') return null
  return globalThis.matchMedia('(prefers-color-scheme: dark)')
}

function deviceIsDark(): boolean {
  // No media query support (native, old browsers): the console was dark first.
  return deviceQuery()?.matches ?? true
}

let current: ThemeMode = readStored()
applyToDocument(current)
const listeners = new Set<() => void>()

function emit(): void {
  for (const listener of listeners) listener()
}

export function getThemeMode(): ThemeMode {
  return current
}

export function setThemeMode(mode: ThemeMode): void {
  if (mode === current) return
  current = mode
  writeStored(mode)
  applyToDocument(mode)
  emit()
}

export function subscribeTheme(listener: () => void): () => void {
  listeners.add(listener)
  const query = deviceQuery()
  query?.addEventListener('change', listener)
  return () => {
    listeners.delete(listener)
    query?.removeEventListener('change', listener)
  }
}

export function getColorScheme(): ColorScheme {
  return resolveColorScheme(current, deviceIsDark(), supportsLight)
}

/** True where the screens can really follow Light (the browser app). */
export function themeSwitchSupported(): boolean {
  return supportsLight
}

export function useThemeMode(): ThemeMode {
  return useSyncExternalStore(subscribeTheme, getThemeMode, () => 'system')
}

/** The scheme being painted now. Server render and first paint say dark. */
export function useColorScheme(): ColorScheme {
  return useSyncExternalStore(subscribeTheme, getColorScheme, () => 'dark')
}

/**
 * The active palette as real values (hex and rgba), for the few places that
 * cannot take a CSS variable: colour maths and animated colour ranges. Most
 * code reads `colors` from `@/lib/theme` instead.
 */
export function useColors(): Palette {
  return paletteFor(useColorScheme())
}
