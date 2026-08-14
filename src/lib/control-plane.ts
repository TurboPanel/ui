import { HA_PRODUCT_NAME } from '@/lib/platform-copy'

/** Canonical TurboPanel High Availability control-plane origin. */
export const HA_CONTROL_PLANE_ORIGIN = 'https://turbopanel.app'

/** Co-located Caddy HTTPS (platform CA). */
export const LOCAL_HTTPS_ORIGIN = 'https://localhost:8443'

/** Co-located Caddy plaintext HTTP (LAN / device-friendly in development). */
export const LOCAL_HTTP_ORIGIN = 'http://localhost:8880'

const METRO_WEB_PORTS = new Set(['8081', '8082', '19000', '19006'])

export type ControlPlaneClientKind = 'same-origin' | 'metro-web' | 'native'

export type ControlPlaneClientEnv = Readonly<{
  platformOS: string
  isDev: boolean
  locationOrigin: string | null
}>

export type ParsedControlPlaneOrigin =
  | { ok: true; origin: string }
  | { ok: false; error: string }

let envReader: () => ControlPlaneClientEnv = () => ({
  platformOS: 'web',
  isDev: typeof __DEV__ !== 'undefined' && __DEV__,
  locationOrigin: readBrowserLocationOrigin(),
})

/** App startup registers React Native `Platform` via `control-plane-platform.ts`. */
export function setControlPlaneEnvReader(
  reader: () => ControlPlaneClientEnv,
): void {
  envReader = reader
}

export function readControlPlaneClientEnv(): ControlPlaneClientEnv {
  return envReader()
}

export function readBrowserLocationOrigin(): string | null {
  if (typeof globalThis === 'undefined' || !('location' in globalThis)) {
    return null
  }
  const origin = (globalThis.location as Location).origin?.trim()
  if (!origin || origin === 'null') return null
  return origin
}

export function isMetroWebOrigin(origin: string | null): boolean {
  if (!origin) return false
  let parsed: URL
  try {
    parsed = new URL(origin)
  } catch {
    return false
  }
  const host = parsed.hostname.toLowerCase()
  if (host === 'exp.direct' || host.endsWith('.exp.direct')) {
    return true
  }
  return METRO_WEB_PORTS.has(parsed.port)
}

export function resolveControlPlaneClientKind(
  env: ControlPlaneClientEnv,
): ControlPlaneClientKind {
  if (env.platformOS !== 'web') return 'native'
  if (!env.isDev) return 'same-origin'
  if (isMetroWebOrigin(env.locationOrigin)) return 'metro-web'
  return 'same-origin'
}

export function usesSameOriginApi(
  env: ControlPlaneClientEnv = readControlPlaneClientEnv(),
): boolean {
  return resolveControlPlaneClientKind(env) === 'same-origin'
}

export function isStandaloneExpoWeb(
  env: ControlPlaneClientEnv = readControlPlaneClientEnv(),
): boolean {
  return resolveControlPlaneClientKind(env) === 'metro-web'
}

export function isRemoteCookieClient(
  env: ControlPlaneClientEnv = readControlPlaneClientEnv(),
): boolean {
  return resolveControlPlaneClientKind(env) === 'native'
}

export function canBootstrapAgainstControlPlane(
  env: ControlPlaneClientEnv = readControlPlaneClientEnv(),
  origin: string | null = null,
): boolean {
  if (isStandaloneExpoWeb(env)) return false
  if (usesSameOriginApi(env)) return true
  return origin !== null
}

export function parseControlPlaneOrigin(raw: string): ParsedControlPlaneOrigin {
  const trimmed = raw.trim()
  if (!trimmed) {
    return { ok: false, error: 'Enter a control plane URL.' }
  }
  let parsed: URL
  try {
    parsed = new URL(trimmed)
  } catch {
    return { ok: false, error: 'Enter a valid http(s) URL.' }
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { ok: false, error: 'URL must start with http:// or https://.' }
  }
  if (!parsed.hostname) {
    return { ok: false, error: 'Enter a valid http(s) URL.' }
  }
  return { ok: true, origin: parsed.origin }
}

export function controlPlaneKindForOrigin(
  origin: string,
): 'ha' | 'self-hosted' {
  return origin === HA_CONTROL_PLANE_ORIGIN ? 'ha' : 'self-hosted'
}

export function formatControlPlaneHostLabel(origin: string): string {
  if (origin === HA_CONTROL_PLANE_ORIGIN) {
    return HA_PRODUCT_NAME
  }
  try {
    return new URL(origin).host
  } catch {
    return origin
  }
}

export function readEnvControlPlaneOrigin(): string | null {
  const raw = process.env.EXPO_PUBLIC_CONTROL_PLANE_URL
  if (typeof raw !== 'string') return null
  const parsed = parseControlPlaneOrigin(raw)
  return parsed.ok ? parsed.origin : null
}

/**
 * Same-origin web keeps relative `/api/…` paths. Native prefixes the active
 * control-plane origin. Cookies stay `credentials: 'include'` either way.
 */
export function resolveApiUrl(
  path: string,
  origin: string | null = null,
  env: ControlPlaneClientEnv = readControlPlaneClientEnv(),
): string {
  if (usesSameOriginApi(env)) {
    return path
  }
  if (!origin) {
    throw new TypeError('Control plane origin is not set')
  }
  const prefix = origin.endsWith('/') ? origin.slice(0, -1) : origin
  const suffix = path.startsWith('/') ? path : `/${path}`
  return `${prefix}${suffix}`
}
