import type { HealthResponse } from '@/lib/instance-api'

export type ControlPlaneVersionLine = Readonly<{
  /** e.g. `v0.1.1` or `v0.1.1 · 18ad2b0`. */
  label: string
  /** The exact commit on the source forge, when `/api/health` names one. */
  commitUrl: string | null
}>

const COMMIT_SHA = /^[0-9a-f]{7,40}$/i

/**
 * The muted line under the HIGH AVAILABILITY pill: the control plane's
 * version, plus its short commit (linked to the source) when the build
 * recorded one. `null` until `/api/health` has answered with a version.
 */
export function controlPlaneVersionLine(
  health: HealthResponse | null | undefined,
): ControlPlaneVersionLine | null {
  const version = health?.version?.trim()
  if (!version) return null
  const label = version.startsWith('v') ? version : `v${version}`
  const commit = health?.revision?.commit?.trim() ?? ''
  if (!COMMIT_SHA.test(commit)) return { label, commitUrl: null }
  const source = health?.revision?.sourceUrl?.trim().replace(/\/+$/, '') ?? ''
  return {
    label: `${label} · ${commit.slice(0, 7).toLowerCase()}`,
    commitUrl: /^https:\/\//.test(source) ? `${source}/commit/${commit}` : null,
  }
}
