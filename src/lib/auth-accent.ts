import { Platform } from 'react-native'
import { navyPalette } from '@/lib/theme-palettes'

export type ControlPlaneRuntime = 'deno' | 'workers'

export type AuthAccentTheme = {
  /** Brand accent for stripe, CTA, links */
  accent: string
  /** Text/icon color on accent fills */
  onAccent: string
  /** Soft tint behind brand chrome */
  bgActive: string
  /** Short label for a11y / hints */
  label: string
}

const RUNTIME_STORAGE_KEY = 'tp.controlPlaneRuntime'

/**
 * Last-known runtime from this browser tab (web), so a refresh knows it before
 * `/status` answers.
 */
export function readStoredControlPlaneRuntime(): ControlPlaneRuntime | undefined {
  if (Platform.OS !== 'web') return undefined
  try {
    if (typeof sessionStorage === 'undefined') return undefined
    const value = sessionStorage.getItem(RUNTIME_STORAGE_KEY)
    if (value === 'deno' || value === 'workers') return value
  } catch {
    // Private mode / blocked storage — ignore.
  }
  return undefined
}

/**
 * Remember the runtime for this browser tab (web), so a refresh knows it
 * before `/status` answers. No-ops when the runtime is unknown.
 */
export function rememberControlPlaneRuntime(
  runtime: ControlPlaneRuntime | undefined,
): void {
  if (Platform.OS !== 'web') return
  if (runtime !== 'deno' && runtime !== 'workers') return
  try {
    if (typeof sessionStorage === 'undefined') return
    sessionStorage.setItem(RUNTIME_STORAGE_KEY, runtime)
  } catch {
    // Private mode / blocked storage — ignore.
  }
}

/**
 * Auth screens always paint on the dark Navy backdrop (their animated wash does
 * colour maths on real hex values), so these are Navy values, not theme
 * variables. Both runtimes use the brand blue; only the label differs. Green
 * is reserved for "running / live".
 */
export function authAccentForRuntime(
  runtime: ControlPlaneRuntime | undefined,
): AuthAccentTheme {
  return {
    accent: navyPalette.accent,
    onAccent: navyPalette.accentInk,
    bgActive: navyPalette.accentSoft,
    label: runtime === 'workers' ? 'High Availability' : 'Self-hosted',
  }
}

/** Spinner colour for loading screens: brand blue, readable in both themes. */
export function authSpinnerColor(): string {
  return navyPalette.brand
}

/**
 * Prefer explicit `runtime` from `GET /api/client/v1/status`.
 * Fallback: install fields are Deno-only; bare payloads default to Workers.
 */
export function resolveControlPlaneRuntime(status: {
  runtime?: ControlPlaneRuntime
  needsInstall?: boolean
  isInstallMode?: boolean
} | null | undefined): ControlPlaneRuntime | undefined {
  if (status?.runtime === 'deno' || status?.runtime === 'workers') {
    return status.runtime
  }
  // Deno self-hosted always includes these keys; Workers omits them.
  if (
    status?.needsInstall !== undefined ||
    status?.isInstallMode !== undefined
  ) {
    return 'deno'
  }
  if (status != null) {
    return 'workers'
  }
  return undefined
}
