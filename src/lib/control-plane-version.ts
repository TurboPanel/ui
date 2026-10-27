import type { HealthResponse } from '@/lib/instance-api'

/** The yellow word beside the version when this is not a live build. */
export type ControlPlaneEnvironmentLabel = 'Testing' | 'Staging' | 'Canary' | 'RC'

export type ControlPlaneRuntime = 'deno' | 'workers'

/** The `X.Y.Z` at the start of a version or build label (`0.1.21`, `v0.1.21-canary.24`). */
const PLAIN_SEMVER = /^v?(\d+\.\d+\.\d+)(?:[-+][0-9A-Za-z.+-]*)?$/

/** TurboPanel High Availability: the deployment decides. Live has no word. */
const HOSTED_LABELS: Readonly<Record<string, ControlPlaneEnvironmentLabel>> = {
  testing: 'Testing',
  staging: 'Staging',
}

/**
 * Self-hosted: the update channel decides. Release has no word. `trunk` is the
 * old name of the canary channel; any other channel shows no word.
 */
const CHANNEL_LABELS: Readonly<Record<string, ControlPlaneEnvironmentLabel>> = {
  canary: 'Canary',
  trunk: 'Canary',
  rc: 'RC',
}

function lower(value: string | null | undefined): string {
  return value?.trim().toLowerCase() ?? ''
}

function plainSemver(value: string | null | undefined): string | null {
  const match = PLAIN_SEMVER.exec(value?.trim() ?? '')
  return match ? `v${match[1]}` : null
}

/**
 * The control plane's version as plain `vX.Y.Z` on both editions: no
 * pre-release suffix (`-canary.N`, `-rc.N`) and never the commit; the yellow
 * environment word says which kind of build it is. Read from `/api/health`
 * `version` (the build label's `X.Y.Z` when only that is sent). `null` until
 * the control plane has answered with a version.
 */
export function controlPlaneVersionLabel(health: HealthResponse | null | undefined): string | null {
  return plainSemver(health?.version) ?? plainSemver(health?.build)
}

/**
 * The yellow word beside the version, or null on a live build. TurboPanel
 * High Availability decides by its deployment (`testing` → Testing,
 * `staging` → Staging, `live` → none); self-hosted by its update channel
 * (`canary` or the old `trunk` → Canary, `rc` → RC, `release` and anything
 * else → none).
 */
export function controlPlaneEnvironmentLabel(
  health: HealthResponse | null | undefined,
  runtime: ControlPlaneRuntime | null | undefined
): ControlPlaneEnvironmentLabel | null {
  if (runtime === 'deno') return CHANNEL_LABELS[lower(health?.channel)] ?? null
  return HOSTED_LABELS[lower(health?.environment)] ?? null
}

/** A live build: hosted `live` or a self-hosted `release` install (no environment word). */
export function isLiveBuild(
  health: HealthResponse | null | undefined,
  runtime: ControlPlaneRuntime | null | undefined
): boolean {
  return controlPlaneEnvironmentLabel(health, runtime) === null
}

/** A semver release or pre-release, as the web interface bundle's app config names it. */
const BUNDLE_VERSION = /^v?\d+\.\d+\.\d+(?:-[0-9A-Za-z][0-9A-Za-z.-]*)?$/

/**
 * This web interface's own version exactly as its app config names it, with
 * a `v` in front (`v0.1.17`; a pre-release suffix there would be kept). Null
 * when the config holds no semver.
 */
export function webInterfaceVersionLabel(version: string | null | undefined): string | null {
  const trimmed = version?.trim() ?? ''
  if (!BUNDLE_VERSION.test(trimmed)) return null
  return trimmed.startsWith('v') ? trimmed : `v${trimmed}`
}
