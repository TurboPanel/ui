import { commitUrlFor } from '@/lib/control-plane-version'
import type { HealthResponse } from '@/lib/instance-api'
import type { AppSourceRelease } from '@/lib/source-release'

/** One row of the build-info dialog: a label and its value, optionally linked. */
export type BuildInfoRow = Readonly<{ label: string; value: string; url?: string }>

export type BuildInfoSection = Readonly<{ title: string; rows: readonly BuildInfoRow[] }>

const COMMIT_SHA = /^[0-9a-f]{7,40}$/i
const CLICKABLE_ENVIRONMENTS = new Set(['testing', 'staging'])

/** Whether the version line opens the build-info dialog: hosted testing and staging only. */
export function showsBuildInfo(health: HealthResponse | null | undefined): boolean {
  return CLICKABLE_ENVIRONMENTS.has(health?.environment?.trim().toLowerCase() ?? '')
}

function commitRow(sha: string, sourceUrl: string | null | undefined): BuildInfoRow {
  if (!COMMIT_SHA.test(sha)) return { label: 'Commit', value: 'unknown' }
  const url = commitUrlFor(sourceUrl, sha)
  const value = sha.slice(0, 7).toLowerCase()
  return url ? { label: 'Commit', value, url } : { label: 'Commit', value }
}

function withV(version: string): string {
  return version.startsWith('v') ? version : `v${version}`
}

/**
 * What the build-info dialog lists: the console (this ui build) and the
 * control plane it talks to — version and commit for each, plus the control
 * plane's channel, environment and installed build label when it reports
 * them. Absent fields are left out rather than shown blank.
 */
export function buildInfoSections(
  health: HealthResponse | null | undefined,
  console: Pick<AppSourceRelease, 'version' | 'gitCommit' | 'sourceReleaseUrl'>,
): BuildInfoSection[] {
  const consoleRows: BuildInfoRow[] = [
    { label: 'Version', value: withV(console.version) },
    commitRow(console.gitCommit.trim(), console.sourceReleaseUrl),
  ]

  const controlPlaneRows: BuildInfoRow[] = []
  const version = health?.version?.trim()
  if (version) controlPlaneRows.push({ label: 'Version', value: withV(version) })
  const build = health?.build?.trim()
  if (build) controlPlaneRows.push({ label: 'Build', value: withV(build) })
  controlPlaneRows.push(commitRow(health?.revision?.commit?.trim() ?? '', health?.revision?.sourceUrl))
  const channel = health?.channel?.trim()
  if (channel) controlPlaneRows.push({ label: 'Channel', value: channel })
  const environment = health?.environment?.trim()
  if (environment) controlPlaneRows.push({ label: 'Environment', value: environment })

  return [
    { title: 'Web app', rows: consoleRows },
    { title: 'Control plane', rows: controlPlaneRows },
  ]
}
