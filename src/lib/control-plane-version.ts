import type { HealthResponse } from '@/lib/instance-api'

/** The hosted environment named beside the version, coloured by `tone`. */
export type ControlPlaneEnvironmentTag = Readonly<{
  text: 'Testing' | 'Staging'
  tone: 'testing' | 'staging'
}>

export type ControlPlaneVersionLine = Readonly<{
  /** e.g. `v0.1.1`, `v0.1.1 · 18ad2b0` or `v0.1.1-canary.20260926-192741-3754712`. */
  label: string
  /** The exact commit on the source forge, when `/api/health` names one. */
  commitUrl: string | null
  /** Hosted only: "Testing" / "Staging" beside the version; null on live and self-hosted. */
  environment: ControlPlaneEnvironmentTag | null
}>

const COMMIT_SHA = /^[0-9a-f]{7,40}$/i
/** A semver release or pre-release (`0.1.1`, `0.1.1-rc.1`, `0.1.1-canary.20260926-192741-3754712`). */
const BUILD_LABEL = /^v?\d+\.\d+\.\d+(?:-[0-9A-Za-z][0-9A-Za-z.-]*)?$/

const ENVIRONMENT_TAGS: Readonly<Record<string, ControlPlaneEnvironmentTag>> = {
  testing: { text: 'Testing', tone: 'testing' },
  staging: { text: 'Staging', tone: 'staging' },
}

function withV(version: string): string {
  return version.startsWith('v') ? version : `v${version}`
}

/**
 * The commit page for `sha` on the forge `sourceUrl` points at. The control
 * plane sends either the repository (`https://github.com/o/r`) or, once the
 * build knows its commit, a tree view (`https://github.com/o/r/tree/<sha>`);
 * both resolve to `https://github.com/o/r/commit/<sha>`. Anything that is not
 * an https URL yields null, so the line never links a `javascript:` source.
 */
export function commitUrlFor(sourceUrl: string | null | undefined, sha: string): string | null {
  const raw = sourceUrl?.trim() ?? ''
  if (!/^https:\/\//i.test(raw)) return null
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return null
  }
  const segments = url.pathname.split('/').filter(Boolean)
  const marker = segments.findIndex((segment) => segment === 'tree' || segment === 'commit' || segment === 'blob')
  const repoPath = (marker === -1 ? segments : segments.slice(0, marker)).join('/')
  if (!repoPath) return null
  return `${url.origin}/${repoPath}/commit/${sha}`
}

/**
 * Whether this build is a plain production release: hosted `live`, or a
 * self-hosted `release`-channel install. Its version number is the whole
 * story there, so the commit that happens to sit behind it is left off.
 */
function isProductionRelease(health: HealthResponse | null | undefined, runtime: 'deno' | 'workers'): boolean {
  if (runtime === 'workers') return (health?.environment?.trim().toLowerCase() ?? '') === 'live'
  return (health?.channel?.trim().toLowerCase() ?? '') === 'release'
}

/**
 * The muted line beside the T mark: the control plane's version, its short
 * commit (linked to the source) when the build recorded one and this is not
 * a production release, and — on the hosted (Workers) control plane — the
 * environment ("Testing" / "Staging", nothing on live). Self-hosted shows
 * its exact installed build label (`v0.1.1-canary.…`, `v0.1.1-rc.1`) in
 * place of the plain version when the control plane reports one. `null`
 * until `/api/health` has answered with a version; fields an older control
 * plane does not send are simply absent.
 */
export function controlPlaneVersionLine(
  health: HealthResponse | null | undefined,
  runtime: 'deno' | 'workers' | null | undefined = 'workers',
): ControlPlaneVersionLine | null {
  const version = health?.version?.trim()
  if (!version) return null
  const effectiveRuntime = runtime === 'deno' ? 'deno' : 'workers'
  const build = health?.build?.trim() ?? ''
  const shown = effectiveRuntime === 'deno' && BUILD_LABEL.test(build) ? build : version
  const label = withV(shown)
  const environment =
    effectiveRuntime === 'workers'
      ? (ENVIRONMENT_TAGS[health?.environment?.trim().toLowerCase() ?? ''] ?? null)
      : null
  const commit = health?.revision?.commit?.trim() ?? ''
  if (isProductionRelease(health, effectiveRuntime) || !COMMIT_SHA.test(commit)) {
    return { label, commitUrl: null, environment }
  }
  return {
    label: `${label} · ${commit.slice(0, 7).toLowerCase()}`,
    commitUrl: commitUrlFor(health?.revision?.sourceUrl, commit),
    environment,
  }
}
