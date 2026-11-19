import { useSyncExternalStore } from 'react'
import { Platform } from 'react-native'
import type { ControlPlaneRuntime } from '@/lib/control-plane-runtime'
import type { InstallStatus, OAuthProvider } from '@/lib/instance-api'
import { navyPalette } from '@/lib/theme-palettes'

export { type ControlPlaneRuntime, resolveControlPlaneRuntime } from '@/lib/control-plane-runtime'

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
const STATUS_STORAGE_KEY = 'tp.statusSnapshot'
const SESSION_HINT_STORAGE_KEY = 'tp.hadSession'

function readLocal(key: string): string | null {
  if (Platform.OS !== 'web') return null
  try {
    if (typeof localStorage === 'undefined') return null
    return localStorage.getItem(key)
  } catch {
    // Private mode / blocked storage: ignore.
    return null
  }
}

function writeLocal(key: string, value: string | null): void {
  if (Platform.OS !== 'web') return
  try {
    if (typeof localStorage === 'undefined') return
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  } catch {
    // Private mode / blocked storage: ignore.
  }
}

const OAUTH_PROVIDERS: ReadonlySet<string> = new Set(['github', 'google'])

/**
 * Whether this browser last saw a signed-in session. A non-secret hint only
 * (never a token): the sign-in page keeps its loading screen for these
 * visitors so a signed-in person never sees a flash of the form.
 */
export function readSessionHint(): boolean {
  return readLocal(SESSION_HINT_STORAGE_KEY) === '1'
}

const subscribeNothing = () => () => {}

/**
 * `readSessionHint` for render: false while hydrating (the static page was
 * built without it), then the stored value, so the first client render always
 * matches the pre-rendered page.
 */
export function useSessionHint(): boolean {
  return useSyncExternalStore(subscribeNothing, readSessionHint, () => false)
}

export function rememberSessionHint(signedIn: boolean): void {
  writeLocal(SESSION_HINT_STORAGE_KEY, signedIn ? '1' : null)
}

/**
 * The public parts of the last `GET /status` answer (web only), used to paint
 * the sign-in options before the live answer arrives. An install-mode answer
 * is never kept: a stale one would send a finished install back to the wizard.
 */
export function readStoredInstallStatus(): InstallStatus | undefined {
  const raw = readLocal(STATUS_STORAGE_KEY)
  if (!raw) return undefined
  try {
    const value = JSON.parse(raw) as Partial<InstallStatus> | null
    if (!value || typeof value !== 'object' || typeof value.isSignupEnabled !== 'boolean') {
      return undefined
    }
    if (value.needsInstall === true || value.isInstallMode === true) return undefined
    return {
      isSignupEnabled: value.isSignupEnabled,
      billingEnabled: value.billingEnabled === true,
      authProviders: Array.isArray(value.authProviders)
        ? value.authProviders.filter((p): p is OAuthProvider => OAUTH_PROVIDERS.has(p))
        : [],
      ...(value.runtime === 'deno' || value.runtime === 'workers'
        ? { runtime: value.runtime }
        : {}),
      ...(typeof value.isSignupEmailVerificationEnabled === 'boolean'
        ? { isSignupEmailVerificationEnabled: value.isSignupEmailVerificationEnabled }
        : {}),
    }
  } catch {
    return undefined
  }
}

export function rememberInstallStatus(status: InstallStatus | undefined): void {
  if (!status) return
  if (status.needsInstall === true || status.isInstallMode === true) {
    writeLocal(STATUS_STORAGE_KEY, null)
    return
  }
  writeLocal(STATUS_STORAGE_KEY, JSON.stringify(status))
}

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
export function rememberControlPlaneRuntime(runtime: ControlPlaneRuntime | undefined): void {
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
export function authAccentForRuntime(runtime: ControlPlaneRuntime | undefined): AuthAccentTheme {
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
