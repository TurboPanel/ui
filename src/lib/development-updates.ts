import type {
  DevelopmentJob,
  DevelopmentServer,
  DevelopmentUpdates,
  InstanceUpdates,
} from '@/lib/instance-api'

/**
 * Updates on a development install. The control plane, the web interface and
 * the co-located daemon run from the developer's checkouts, so nothing
 * updates on its own and the release signals (update waiting, paused, daemons
 * behind) never light. The one action is building the daemon from the
 * checkout and pushing it to the other connected servers; the one signal is
 * that some server does not have the checkout's daemon changes yet.
 */

/** A development install. Missing on a release install or an older control plane: false. */
export function isDevelopmentInstall(
  updates: Pick<InstanceUpdates, 'development'> | null | undefined
): boolean {
  return updates?.development === true
}

/** Some server lacks the daemon changes in the checkout: the logo icon and the banner show. */
export function developmentChangesPending(
  development: Pick<DevelopmentUpdates, 'pendingDaemonChanges'> | null | undefined
): boolean {
  return development?.pendingDaemonChanges === true
}

/** A build-and-push job is still working. */
export function developmentJobRunning(
  job: Pick<DevelopmentJob, 'state'> | null | undefined
): boolean {
  return job?.state === 'building' || job?.state === 'pushing'
}

/** How often the development view is read while a job runs. */
export const DEVELOPMENT_JOB_POLL_MS = 2_000

/** Read again every 2 s while a job builds or pushes; otherwise not at all. */
export function developmentPollInterval(
  data: Pick<DevelopmentUpdates, 'job'> | null | undefined
): number | false {
  return developmentJobRunning(data?.job) ? DEVELOPMENT_JOB_POLL_MS : false
}

/**
 * The push button: "Push Daemon" when a build exists and the checkout has
 * not changed since, else "Build and Push Daemon".
 */
export function developmentPushLabel(
  daemonBuild: Pick<DevelopmentUpdates['daemonBuild'], 'built' | 'sourceChanged'> | null | undefined
): 'Build and Push Daemon' | 'Push Daemon' {
  if (daemonBuild?.built && !daemonBuild.sourceChanged) return 'Push Daemon'
  return 'Build and Push Daemon'
}

export type DevelopmentServerStatus = Readonly<{
  label: 'On Latest Build' | 'Behind' | 'Not Connected'
  tone: 'ok' | 'pending' | 'muted'
}>

/** A remote server's daemon against the last build pushed from the checkout. */
export function developmentServerStatus(
  server: Pick<DevelopmentServer, 'connected' | 'onLatestBuild'>
): DevelopmentServerStatus {
  if (!server.connected) return { label: 'Not Connected', tone: 'muted' }
  if (server.onLatestBuild) return { label: 'On Latest Build', tone: 'ok' }
  return { label: 'Behind', tone: 'pending' }
}

/** `v0.1.5 · abc123def456`, the version alone, the commit alone, or "Not reported". */
export function developmentDaemonLabel(
  server: Pick<DevelopmentServer, 'daemonVersion' | 'daemonCommit'>
): string {
  const version = server.daemonVersion?.trim()
  const commit = server.daemonCommit?.trim().slice(0, 12)
  if (version && commit) return `v${version} · ${commit}`
  if (version) return `v${version}`
  return commit || 'Not reported'
}

export type DevelopmentJobView = Readonly<{
  label: 'Building…' | 'Pushing…' | 'Done' | 'Failed'
  tone: 'pending' | 'ok' | 'danger'
}>

/** The job's state in words. */
export function developmentJobView(job: Pick<DevelopmentJob, 'state'>): DevelopmentJobView {
  switch (job.state) {
    case 'building':
      return { label: 'Building…', tone: 'pending' }
    case 'pushing':
      return { label: 'Pushing…', tone: 'pending' }
    case 'done':
      return { label: 'Done', tone: 'ok' }
    default:
      return { label: 'Failed', tone: 'danger' }
  }
}

/** One server's result in the job: Updated, Skipped or Failed, with the error when it failed. */
export function developmentJobServerResult(
  server: Pick<DevelopmentJob['servers'][number], 'ok' | 'skipped' | 'error'>
): Readonly<{
  label: 'Updated' | 'Skipped' | 'Failed'
  tone: 'ok' | 'muted' | 'danger'
  detail: string | null
}> {
  if (server.skipped) return { label: 'Skipped', tone: 'muted', detail: null }
  if (server.ok) return { label: 'Updated', tone: 'ok', detail: null }
  return { label: 'Failed', tone: 'danger', detail: server.error?.trim() || null }
}

/** A version row on the development Updates page: the piece runs from the checkout. */
export function runningFromCheckoutLine(commit: string | null | undefined): string | null {
  const trimmed = commit?.trim() ?? ''
  if (trimmed === '' || trimmed === 'unknown') return null
  return `Commit ${trimmed.slice(0, 12)}`
}

export const RUNNING_FROM_CHECKOUT = 'Running From Your Checkout'

export const DEVELOPMENT_NOTE =
  "Development installs never update on their own. Build the daemon from your checkout and push it to your servers when you're ready."

/** A plain admin sees the versions but not the build and push card (superadmin only). */
export const DEVELOPMENT_SUPERADMIN_ONLY = 'Only a superadmin can build and push the daemon.'

export const DEVELOPMENT_BANNER_TITLE = 'Daemon changes are not on your servers yet.'

export const DEVELOPMENT_NO_SERVERS = 'No other servers are connected.'

/**
 * A finished job (done or failed) that was running at the last read: the
 * update reads go stale, so the caller invalidates them once.
 */
export function developmentJobJustFinished(
  previous: Pick<DevelopmentJob, 'id' | 'state'> | null | undefined,
  next: Pick<DevelopmentJob, 'id' | 'state'> | null | undefined
): boolean {
  if (!developmentJobRunning(previous) || !next) return false
  return next.id === previous?.id && !developmentJobRunning(next)
}

export const DEVELOPMENT_BANNER_BODY =
  'Open Updates to build the daemon from your checkout and push it to your servers.'

/**
 * The banner on a development install: only while some server lacks the
 * checkout's daemon changes, and not after it was dismissed for this state
 * of the checkout (a new change shows it again).
 */
export function developmentBanner(
  input: Readonly<{
    development: Pick<DevelopmentUpdates, 'pendingDaemonChanges' | 'daemonBuild'> | null | undefined
    dismissedKey: string | null
  }>
): Readonly<{ key: string; title: string; body: string }> | null {
  if (!input.development || !developmentChangesPending(input.development)) return null
  const key = `development|${input.development.daemonBuild.sourceFingerprint}`
  if (key === input.dismissedKey) return null
  return { key, title: DEVELOPMENT_BANNER_TITLE, body: DEVELOPMENT_BANNER_BODY }
}
