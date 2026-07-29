import { Platform } from 'react-native'
import { colors } from '@/lib/theme'

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
 * Last-known runtime from this browser tab (web). Used so refresh can paint
 * HA blue / Deno green immediately instead of muted → wrong-brand flashes.
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

function persistControlPlaneRuntime(
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
 * Auth chrome accent by control-plane runtime:
 * - Workers (TurboPanel High Availability) → blue `#3366cc`
 * - Deno (self-hosted) → green
 * - Unknown → green form chrome (console primary); bootstrap spinners should
 *   use {@link authSpinnerColor} instead so HA never flashes green
 */
export function authAccentForRuntime(
  runtime: ControlPlaneRuntime | undefined,
): AuthAccentTheme {
  if (runtime === 'workers') {
    return {
      accent: colors.blue,
      onAccent: colors.buttonTextOnBlue,
      bgActive: colors.bgActiveBlue,
      label: 'High Availability',
    }
  }

  return {
    accent: colors.green,
    onAccent: colors.buttonText,
    bgActive: colors.bgActive,
    label: 'Self-hosted',
  }
}

/**
 * Spinner color once runtime is known (or remembered); muted only when
 * nothing is known yet so HA never flashes green on refresh.
 */
export function authSpinnerColor(
  runtime: ControlPlaneRuntime | undefined,
): string {
  const resolved = runtime ?? readStoredControlPlaneRuntime()
  if (resolved === 'workers') return colors.blue
  if (resolved === 'deno') return colors.green
  return colors.textMuted
}

/**
 * Push runtime chrome into CSS variables (web) so StyleSheet-baked
 * `chrome.*` tokens follow Workers blue / Deno green without remounts.
 * No-ops when runtime is unknown so a prior HA blue paint is not wiped to green.
 */
export function applyConsoleChromeRuntime(
  runtime: ControlPlaneRuntime | undefined,
): void {
  if (runtime !== 'deno' && runtime !== 'workers') return
  if (Platform.OS !== 'web') return
  if (typeof document === 'undefined') return

  persistControlPlaneRuntime(runtime)

  const theme = authAccentForRuntime(runtime)
  const root = document.documentElement
  root.style.setProperty('--tp-chrome-accent', theme.accent)
  root.style.setProperty('--tp-chrome-bg-active', theme.bgActive)
  root.style.setProperty('--tp-chrome-on-accent', theme.onAccent)
}

/** Hydrate CSS vars from the last tab session before React paints (web). */
export function hydrateConsoleChromeFromStorage(): void {
  applyConsoleChromeRuntime(readStoredControlPlaneRuntime())
}

if (Platform.OS === 'web') {
  hydrateConsoleChromeFromStorage()
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
