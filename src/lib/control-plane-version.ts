import type { HealthResponse } from '@/lib/instance-api'

/** The yellow word beside the version when this is not a live build. */
export type ControlPlaneEnvironmentLabel =
  'Testing' | 'Staging' | 'Canary' | 'RC' | 'Trunk' | 'Edge'

export type ControlPlaneRuntime = 'deno' | 'workers'

/** A semver release or pre-release (`0.1.21`, `0.1.21-rc.2`, `0.1.21-canary.24`). */
const BUILD_LABEL = /^v?\d+\.\d+\.\d+(?:-[0-9A-Za-z][0-9A-Za-z.-]*)?$/

/** TurboPanel High Availability: the deployment decides. Live has no word. */
const HOSTED_LABELS: Readonly<Record<string, ControlPlaneEnvironmentLabel>> = {
  testing: 'Testing',
  staging: 'Staging',
}

/** Self-hosted: the update channel decides. Release has no word. */
const CHANNEL_LABELS: Readonly<Record<string, ControlPlaneEnvironmentLabel>> = {
  canary: 'Canary',
  rc: 'RC',
  trunk: 'Trunk',
  edge: 'Edge',
}

function withV(version: string): string {
  return version.startsWith('v') ? version : `v${version}`
}

function lower(value: string | null | undefined): string {
  return value?.trim().toLowerCase() ?? ''
}

/**
 * The control plane's running build as `vX.Y.Z`, with its pre-release suffix
 * when the control plane reports one (`v0.1.21-canary.24`, `v0.1.21-rc.2`).
 * `build` is the running build's full label on both editions (installed
 * package on self-hosted, the matching channel build on TurboPanel High
 * Availability); without it the plain `version` stands. Never the commit.
 * `null` until `/api/health` has answered with a version.
 */
export function controlPlaneVersionLabel(health: HealthResponse | null | undefined): string | null {
  const build = health?.build?.trim() ?? ''
  if (BUILD_LABEL.test(build)) return withV(build)
  const version = health?.version?.trim() ?? ''
  return BUILD_LABEL.test(version) ? withV(version) : null
}

/**
 * The yellow word beside the version, or null on a live build. TurboPanel
 * High Availability decides by its deployment (`testing` → Testing,
 * `staging` → Staging, `live` → none); self-hosted by its update channel
 * (`canary` → Canary, `rc` → RC, `release` → none; the development channels
 * name themselves).
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

/** This web interface's own version as `vX.Y.Z`. */
export function webInterfaceVersionLabel(version: string | null | undefined): string | null {
  const trimmed = version?.trim() ?? ''
  return BUILD_LABEL.test(trimmed) ? withV(trimmed) : null
}
