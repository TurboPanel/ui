/**
 * The app ↔ instance version wire (Road to 0.1.x, `wire-version`).
 *
 * The instance stamps `x-turbopanel-version` on every response and
 * `/api/health` carries `version`; this client sends
 * `x-turbopanel-client-version`. The bundled web export always matches the
 * instance that served it, so only the store apps — which update on the
 * store's clock and connect to self-hosted instances newer *or older* than
 * themselves — ever see a mismatch. When the instance is older than this
 * app supports, connecting is refused with a message that names both
 * numbers; a newer instance is fine (it keeps serving older clients — the
 * expand-then-contract rule on the instance side).
 *
 * Mirrors the control plane's `src/lib/version-wire.ts` semver rules.
 */

export const INSTANCE_VERSION_HEADER = 'x-turbopanel-version'
export const INSTANCE_REVISION_HEADER = 'x-turbopanel-revision'
export const CLIENT_VERSION_HEADER = 'x-turbopanel-client-version'

/**
 * The oldest instance this app can drive. Bump when the app starts relying
 * on an instance-side change that is not expand-only.
 */
export const MIN_SUPPORTED_INSTANCE_VERSION = '0.1.0'

const SEMVER_RE = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/

export type ParsedSemver = {
  major: number
  minor: number
  patch: number
  prerelease: string[]
}

export function parseSemver(value: string | undefined | null): ParsedSemver | null {
  const trimmed = value?.trim()
  if (!trimmed) return null
  const m = SEMVER_RE.exec(trimmed.startsWith('v') ? trimmed.slice(1) : trimmed)
  if (!m) return null
  return {
    major: Number(m[1]),
    minor: Number(m[2]),
    patch: Number(m[3]),
    prerelease: m[4] ? m[4].split('.') : [],
  }
}

function compareIdentifiers(a: string, b: string): number {
  const na = /^\d+$/.test(a)
  const nb = /^\d+$/.test(b)
  if (na && nb) return Number(a) - Number(b)
  // Numeric identifiers sort before alphanumeric ones (semver §11.4.3).
  if (na) return -1
  if (nb) return 1
  if (a < b) return -1
  return a > b ? 1 : 0
}

/** semver precedence: negative when `a` < `b`, zero when equal, positive when `a` > `b`. */
export function compareSemver(a: ParsedSemver, b: ParsedSemver): number {
  if (a.major !== b.major) return a.major - b.major
  if (a.minor !== b.minor) return a.minor - b.minor
  if (a.patch !== b.patch) return a.patch - b.patch
  // A pre-release sorts before the release it precedes.
  if (a.prerelease.length === 0 && b.prerelease.length === 0) return 0
  if (a.prerelease.length === 0) return 1
  if (b.prerelease.length === 0) return -1
  const n = Math.min(a.prerelease.length, b.prerelease.length)
  for (let i = 0; i < n; i += 1) {
    const c = compareIdentifiers(a.prerelease[i], b.prerelease[i])
    if (c !== 0) return c
  }
  return a.prerelease.length - b.prerelease.length
}

export type InstanceSupportStatus = 'supported' | 'unsupported' | 'unknown'

export type InstanceSupport = {
  status: InstanceSupportStatus
  /** The version the instance reported, verbatim; `null` when it sent none or something unparsable. */
  version: string | null
  minVersion: string
}

/**
 * Hold an instance's reported version against `MIN_SUPPORTED_INSTANCE_VERSION`.
 * No header (an instance from before 0.1.0) is `unknown`, and connecting
 * proceeds — the header is expand-only.
 */
export function resolveInstanceSupport(
  reportedVersion: string | undefined | null,
  minVersion: string = MIN_SUPPORTED_INSTANCE_VERSION,
): InstanceSupport {
  const parsed = parseSemver(reportedVersion)
  const floor = parseSemver(minVersion)
  if (!parsed || !floor) {
    return { status: 'unknown', version: null, minVersion }
  }
  return {
    status: compareSemver(parsed, floor) < 0 ? 'unsupported' : 'supported',
    version: (reportedVersion as string).trim(),
    minVersion,
  }
}

/** The connect screen's refusal — names both numbers and the fix. */
export function instanceUnsupportedMessage(support: InstanceSupport): string {
  return `That control plane runs TurboPanel ${support.version ?? 'unknown'}; this app needs ${support.minVersion} or newer. Update the instance, then connect again.`
}

let clientVersion: string | null = null

/** Set once at app start from the Expo config's `version`. */
export function setClientVersion(version: string | null | undefined): void {
  const trimmed = version?.trim()
  clientVersion = trimmed || null
}

export function getClientVersion(): string | null {
  return clientVersion
}

/** The request header the instance reads, or nothing when no version is known. */
export function clientVersionHeaders(): Record<string, string> {
  return clientVersion ? { [CLIENT_VERSION_HEADER]: clientVersion } : {}
}

let lastInstanceVersion: string | null = null
let lastInstanceRevision: string | null = null

/**
 * Remember the version the instance stamped on a response. Cleared (to
 * `null`) by a response that carries no header, so a switch to an older
 * instance is never masked by the previous one's number.
 */
export function recordInstanceVersion(headers: Pick<Headers, 'get'>): string | null {
  const raw = headers.get(INSTANCE_VERSION_HEADER)?.trim()
  lastInstanceVersion = raw || null
  const revision = headers.get(INSTANCE_REVISION_HEADER)?.trim()
  lastInstanceRevision = revision || null
  return lastInstanceVersion
}

export function getInstanceVersion(): string | null {
  return lastInstanceVersion
}

export function getInstanceRevision(): string | null {
  return lastInstanceRevision
}

/** Test-only reset of the module state. */
export function resetInstanceVersionStateForTests(): void {
  clientVersion = null
  lastInstanceVersion = null
  lastInstanceRevision = null
}
