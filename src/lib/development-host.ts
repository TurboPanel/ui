import { developmentJobRunning, DEVELOPMENT_JOB_POLL_MS } from '@/lib/development-updates'
import type {
  DevHostActionResult,
  DevHostJob,
  DevHostPart,
  DevHostView,
  DevelopmentUpdates,
} from '@/lib/instance-api'

/**
 * The development host bar: the checkouts on this server (daemon, control
 * plane, web interface, website) as the co-located daemon reports them, what
 * each still needs (new commits on trunk, packages, migrations, a restart),
 * and the Update and Restart / Restart Only job that applies it. The daemon
 * never pulls a checkout that is off trunk or has content changes, so those
 * are reported, not fixed.
 */

const PART_LABELS: Readonly<Partial<Record<string, string>>> = {
  'control-plane': 'Control Plane',
  'web-interface': 'Web Interface',
  website: 'Website',
  daemon: 'Daemon',
}

function titleCaseWords(name: string): string {
  return name
    .split(/[-_\s]+/)
    .filter((word) => word !== '')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

/** "Control Plane", "Web Interface", "Website", "Daemon"; a newer name in title case. */
export function devHostPartLabel(name: string): string {
  return PART_LABELS[name] ?? (titleCaseWords(name) || 'Unknown Part')
}

/** Pending migrations for a part: its own count, and for the control plane the top-level one. */
export function devHostMigratePending(
  part: Pick<DevHostPart, 'name' | 'setupNeeded'>,
  migrate?: DevHostView['migrate']
): number {
  const own = part.setupNeeded.migrate?.pending ?? 0
  const top = part.name === 'control-plane' ? (migrate?.pending ?? 0) : 0
  return Math.max(own, top)
}

type PartInput = Pick<
  DevHostPart,
  'name' | 'branch' | 'onTrunk' | 'behindBy' | 'dirty' | 'restartNeeded' | 'setupNeeded'
>

/** The part needs something: new commits, packages, migrations, a restart, or it holds content changes. */
export function devHostPartNeedsWork(part: PartInput, migrate?: DevHostView['migrate']): boolean {
  return (
    part.behindBy > 0 ||
    part.restartNeeded ||
    part.setupNeeded.install === true ||
    devHostMigratePending(part, migrate) > 0 ||
    part.dirty.blocking
  )
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`
}

/**
 * One short line for a part that needs something, e.g. "Control Plane: 3 new
 * commits on trunk, 1 migration pending", "Website: local changes, will not
 * pull", "Web Interface: on branch fix/x, will not pull". Null when it needs
 * nothing. Changes that never block a pull (mode-only, generated, untracked)
 * are not mentioned.
 */
export function devHostPartLine(part: PartInput, migrate?: DevHostView['migrate']): string | null {
  if (!devHostPartNeedsWork(part, migrate)) return null
  const fragments: string[] = []
  const behind = part.behindBy > 0
  if (behind && !part.onTrunk) {
    fragments.push(`on branch ${part.branch || 'unknown'}, will not pull`)
  } else if (part.dirty.blocking) {
    fragments.push(behind ? 'local changes, will not pull' : 'local changes')
  } else if (behind) {
    fragments.push(`${plural(part.behindBy, 'new commit', 'new commits')} on trunk`)
  }
  if (part.setupNeeded.install === true) fragments.push('packages to install')
  const pending = devHostMigratePending(part, migrate)
  if (pending > 0) fragments.push(`${plural(pending, 'migration', 'migrations')} pending`)
  if (part.restartNeeded) fragments.push('restart needed')
  return `${devHostPartLabel(part.name)}: ${fragments.join(', ')}`
}

/** Every part's line, in the order the daemon sent them. */
export function devHostLines(host: Pick<DevHostView, 'parts' | 'migrate'>): string[] {
  return host.parts
    .map((part) => devHostPartLine(part, host.migrate))
    .filter((line): line is string => line !== null)
}

/** A host job is still working. An unknown state is not. */
export function devHostJobRunning(job: Pick<DevHostJob, 'state'> | null | undefined): boolean {
  return job?.state === 'running'
}

/** How long a failed job keeps the bar on screen after it ended. */
export const DEV_HOST_FAILED_SHOWN_MS = 30 * 60_000

/** How long a finished job reads "Updated" after it ended. */
export const DEV_HOST_DONE_SHOWN_MS = 5 * 60_000

/** The job ended within `windowMs` of `now`. A job with no readable end time is not recent. */
export function devHostJobEndedWithin(
  job: Pick<DevHostJob, 'endedAt'>,
  now: number,
  windowMs: number
): boolean {
  if (!job.endedAt) return false
  const ended = Date.parse(job.endedAt)
  if (Number.isNaN(ended)) return false
  return now - ended <= windowMs
}

/** The job failed a short while ago. */
export function devHostJobJustFailed(
  job: Pick<DevHostJob, 'state' | 'endedAt'> | null | undefined,
  now: number
): boolean {
  return job?.state === 'failed' && devHostJobEndedWithin(job, now, DEV_HOST_FAILED_SHOWN_MS)
}

/** The job finished a short while ago: the bar reads "Updated". */
export function devHostJobJustDone(
  job: Pick<DevHostJob, 'state' | 'endedAt'> | null | undefined,
  now: number
): boolean {
  return job?.state === 'done' && devHostJobEndedWithin(job, now, DEV_HOST_DONE_SHOWN_MS)
}

/**
 * The bar shows on a development install for a superadmin, when the daemon
 * reported the host and some part needs something, or a job runs or just
 * failed. A finished job alone does not keep it on screen.
 */
export function devHostBarVisible(
  input: Readonly<{
    development: boolean
    superadmin: boolean
    host: DevHostView | null | undefined
    now: number
  }>
): boolean {
  const { host } = input
  if (!input.development || !input.superadmin || !host) return false
  if (devHostJobRunning(host.job) || devHostJobJustFailed(host.job, input.now)) return true
  return host.parts.some((part) => devHostPartNeedsWork(part, host.migrate))
}

const STEP_LABELS: Readonly<Partial<Record<string, string>>> = {
  fetch: 'Fetching',
  pull: 'Pulling',
  install: 'Installing',
  migrate: 'Migrating (backup first)',
  'restart-control-plane': 'Restarting Control Plane',
  'restart-web': 'Restarting Web Interface and Website',
  'restart-daemon': 'Restarting Daemon',
}

/** A step name in plain words; a newer step reads as its name with spaces. */
export function devHostStepLabel(name: string): string {
  const known = STEP_LABELS[name]
  if (known) return known
  const words = name.replaceAll(/[-_]+/g, ' ').trim()
  return words === '' ? 'Working' : words.charAt(0).toUpperCase() + words.slice(1)
}

export const DEV_HOST_RESTARTING = 'Control plane restarting…'

export const DEV_HOST_UPDATED = 'Updated'

/**
 * The progress line while a job runs: "Pulling… (step 2 of 7)", or
 * "Control plane restarting…" while the control plane does not answer.
 */
export function devHostProgressLine(
  job: Pick<DevHostJob, 'step' | 'steps'>,
  restarting: boolean
): string {
  if (restarting) return DEV_HOST_RESTARTING
  const label = `${devHostStepLabel(job.step)}…`
  const index = job.steps.findIndex((step) => step.name === job.step)
  if (index < 0) return label
  return `${label} (step ${index + 1} of ${job.steps.length})`
}

/** The most log lines the bar shows for a failed step. */
export const DEV_HOST_LOG_TAIL_MAX_LINES = 15

/** The most characters of one log line the bar shows. */
export const DEV_HOST_LOG_LINE_MAX_CHARS = 300

export type DevHostFailure = Readonly<{
  title: string
  detail: string | null
  logTail: readonly string[]
}>

/** What failed: the step in words, its detail and the last lines of its output (bounded). */
export function devHostFailure(
  job: Pick<DevHostJob, 'step' | 'steps' | 'logTail'>
): DevHostFailure {
  const failed = job.steps.find((step) => step.state === 'failed')
  const name = failed?.name ?? job.step
  const detail = failed?.detail?.trim() || null
  const logTail = job.logTail
    .slice(-DEV_HOST_LOG_TAIL_MAX_LINES)
    .map((line) =>
      line.length > DEV_HOST_LOG_LINE_MAX_CHARS
        ? `${line.slice(0, DEV_HOST_LOG_LINE_MAX_CHARS)}…`
        : line
    )
  return { title: `Failed while ${devHostStepLabel(name).toLowerCase()}`, detail, logTail }
}

/**
 * The control plane is restarting: a host job was running at the last answer
 * and the reads fail now. The bar says so instead of showing an error.
 */
export function devHostRestarting(
  job: Pick<DevHostJob, 'state'> | null | undefined,
  readFailing: boolean
): boolean {
  return readFailing && devHostJobRunning(job)
}

/** The two buttons wait while a host job or a build and push runs. */
export function devHostActionsLocked(
  data: Pick<DevelopmentUpdates, 'job' | 'host'> | null | undefined
): boolean {
  return devHostJobRunning(data?.host?.job) || developmentJobRunning(data?.job)
}

/**
 * The development view is read every 2 s while a build and push or a host
 * job runs. The last good answer stays in the cache when a read fails, so
 * polling keeps going through the control plane's own restart.
 */
export function developmentViewPollInterval(
  data: Pick<DevelopmentUpdates, 'job' | 'host'> | null | undefined
): number | false {
  return devHostActionsLocked(data) ? DEVELOPMENT_JOB_POLL_MS : false
}

/** A host job that was running at the last read has finished: the update reads go stale. */
export function devHostJobJustFinished(
  previous: Pick<DevHostJob, 'id' | 'state'> | null | undefined,
  next: Pick<DevHostJob, 'id' | 'state'> | null | undefined
): boolean {
  if (!devHostJobRunning(previous) || !next) return false
  return next.id === previous?.id && !devHostJobRunning(next)
}

/** The job a 202 started, as a running job, so polling starts before the daemon reports it. */
export function devHostStartedJob(
  job: Readonly<{ id: string; action: DevHostJob['action'] }>,
  startedAt: string
): DevHostJob {
  return {
    id: job.id,
    action: job.action,
    state: 'running',
    step: '',
    steps: [],
    startedAt,
    endedAt: null,
    logTail: [],
  }
}

/** A refused action in words (409 or 503), or null when it started. */
export function devHostActionError(result: DevHostActionResult): string | null {
  if (result.ok) return null
  if (result.error === 'job_running') {
    return 'An update, restart or build and push is already running.'
  }
  if (result.error === 'daemon_unavailable') {
    if (result.reason === 'not_development') {
      return 'The daemon on this server is not running in development mode.'
    }
    if (result.reason === 'timeout') return 'The daemon on this server did not answer. Try again.'
    return 'The daemon on this server is not reachable. Try again in a moment.'
  }
  return 'The action could not start.'
}
