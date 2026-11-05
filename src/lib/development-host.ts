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
> &
  Partial<Pick<DevHostPart, 'blockedReason'>>

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
 * Why the daemon left a part alone, in its own exact words ("detached at
 * 4f7b5ed, 19 behind trunk", "local changes in a.ts"), ending "will not pull".
 * Null when it gave none.
 */
function blockedFragment(reason: string | undefined): string | null {
  const text =
    reason
      ?.trim()
      .replace(/;\s*not pulled$/, '')
      .replace(/\.+$/, '') ?? ''
  return text === '' ? null : `${text}, will not pull`
}

/**
 * One short line for a part that needs something, e.g. "Control Plane: 3 new
 * commits on trunk, 1 migration pending", "Control Plane: detached at
 * 4f7b5ed, 19 behind trunk, will not pull", "Website: local changes in a.ts,
 * will not pull". The daemon's reason is used when it sent one; an older
 * daemon's part reads "local changes" or "on branch fix/x". Null when it needs
 * nothing. Changes that never block a pull (mode-only, generated, untracked)
 * are not mentioned.
 */
export function devHostPartLine(part: PartInput, migrate?: DevHostView['migrate']): string | null {
  if (!devHostPartNeedsWork(part, migrate)) return null
  const fragments: string[] = []
  const behind = part.behindBy > 0
  const blocked = blockedFragment(part.blockedReason)
  if (blocked !== null) {
    fragments.push(blocked)
    if (behind && !blocked.includes('behind trunk')) {
      fragments.push(`${plural(part.behindBy, 'new commit', 'new commits')} on trunk`)
    }
  } else if (behind && !part.onTrunk) {
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

/**
 * "Database: 23 of 25 migrations applied" (the total is what trunk ships).
 * Null when the control plane did not send both counts.
 */
export function devHostDatabaseLine(migrate: DevHostView['migrate'] | undefined): string | null {
  const applied = migrate?.applied
  const total = migrate?.total
  if (typeof applied !== 'number' || typeof total !== 'number') return null
  return `Database: ${applied} of ${plural(total, 'migration', 'migrations')} applied`
}

/**
 * Every part's line with its part name (the list key), in the order the
 * daemon sent them, then the database line when the counts are known.
 */
export function devHostLines(
  host: Pick<DevHostView, 'parts' | 'migrate'>
): { name: string; text: string }[] {
  const lines: { name: string; text: string }[] = []
  for (const part of host.parts) {
    const text = devHostPartLine(part, host.migrate)
    if (text !== null) lines.push({ name: part.name, text })
  }
  const database = devHostDatabaseLine(host.migrate)
  if (database !== null) lines.push({ name: 'database', text: database })
  return lines
}

/** A host job is still working. An unknown state is not. */
export function devHostJobRunning(job: Pick<DevHostJob, 'state'> | null | undefined): boolean {
  return job?.state === 'running'
}

/** How long a failed job keeps the bar on screen after it ended. */
export const DEV_HOST_FAILED_SHOWN_MS = 30 * 60_000

/** How long a finished job keeps the bar on screen, reading "Updated", after it ended. */
export const DEV_HOST_DONE_SHOWN_MS = 60_000

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
 * When a job that finished `done` stops keeping the bar up: milliseconds from
 * `now`, never below 0. Null for any other job or an unreadable end time.
 */
export function devHostDoneHidesInMs(
  job: Pick<DevHostJob, 'state' | 'endedAt'> | null | undefined,
  now: number
): number | null {
  if (job?.state !== 'done' || !job.endedAt) return null
  const ended = Date.parse(job.endedAt)
  if (Number.isNaN(ended)) return null
  return Math.max(0, ended + DEV_HOST_DONE_SHOWN_MS - now)
}

/**
 * The bar shows on a development install for a superadmin, when the daemon
 * reported the host and some part needs something, or a job runs, just
 * failed or just finished (it reads "Updated" for a minute).
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
  if (
    devHostJobRunning(host.job) ||
    devHostJobJustFailed(host.job, input.now) ||
    devHostJobJustDone(host.job, input.now)
  ) {
    return true
  }
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

export const DEV_HOST_RECONNECTING = 'Waiting for the daemon to reconnect…'

export const DEV_HOST_LOST =
  'No answer from the control plane or the daemon for 3 minutes. Check the services in the Developer Console on this server.'

export const DEV_HOST_UPDATED = 'Updated'

/**
 * The progress line while a job runs: "Pulling… (step 2 of 7)"; "Control
 * plane restarting…" while reads fail; "Waiting for the daemon to
 * reconnect…" while the restarted control plane has no word from the daemon
 * yet; and a pointer to the Developer Console after the ceiling.
 */
export function devHostProgressLine(
  job: Pick<DevHostJob, 'step' | 'steps'>,
  wait: DevHostWait
): string {
  if (wait === 'restarting') return DEV_HOST_RESTARTING
  if (wait === 'reconnecting') return DEV_HOST_RECONNECTING
  if (wait === 'lost') return DEV_HOST_LOST
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
 * How long the bar keeps waiting for a running job to show up again while
 * the control plane restarts (reads fail, then answer with no `host` until
 * the daemon reconnects with a growing backoff).
 */
export const DEV_HOST_RECONNECT_CEILING_MS = 3 * 60_000

/** How long a just-started job is kept while the daemon has not reported it yet. */
export const DEV_HOST_START_CEILING_MS = 30_000

/**
 * The console's wait for a running host job that the last answer did not
 * name: `host-missing` (the restarted control plane has no word from the
 * daemon yet) or `job-missing` (the daemon has not reported a just-started
 * job). `since` is when the wait began; `expired` once it passed its ceiling.
 */
export type DevHostCarry = {
  jobId: string
  since: number
  reason: 'host-missing' | 'job-missing'
  expired: boolean
}

/** The development view as the console keeps it: the answer plus the wait, when there is one. */
export type DevelopmentView = DevelopmentUpdates & { hostCarry?: DevHostCarry }

/**
 * Merge a fresh answer with the cached one. While the cached host job runs
 * and the answer has no `host`, or a host whose job is neither that one nor
 * another running job, the cached host and job are kept so polling and the
 * bar go on: up to 3 minutes for a missing host (then `expired`, which the
 * bar shows as a pointer to the Developer Console and which stays while the
 * host is missing), up to 30 s for a job the daemon has not reported (then
 * the answer wins). An answer naming the job ends the wait.
 */
export function carryDevHostJob(
  previous: DevelopmentView | null | undefined,
  fresh: DevelopmentUpdates | null,
  now: number
): DevelopmentView | null {
  const prevJob = previous?.host?.job
  if (!fresh || !previous?.host || !prevJob) return fresh
  const prevCarry = previous.hostCarry?.jobId === prevJob.id ? previous.hostCarry : undefined
  if (!devHostJobRunning(prevJob)) return fresh
  const freshJob = fresh.host?.job ?? null
  if (freshJob && (freshJob.id === prevJob.id || devHostJobRunning(freshJob))) return fresh
  const reason = fresh.host ? 'job-missing' : 'host-missing'
  if (prevCarry?.expired) {
    return reason === 'host-missing'
      ? { ...fresh, host: previous.host, hostCarry: prevCarry }
      : fresh
  }
  const since = prevCarry?.reason === reason ? prevCarry.since : now
  const ceiling =
    reason === 'host-missing' ? DEV_HOST_RECONNECT_CEILING_MS : DEV_HOST_START_CEILING_MS
  const expired = now - since > ceiling
  if (expired && reason === 'job-missing') return fresh
  return {
    ...fresh,
    host: { ...(fresh.host ?? previous.host), job: prevJob },
    hostCarry: { jobId: prevJob.id, since, reason, expired },
  }
}

type LockInput = Pick<DevelopmentView, 'job' | 'host' | 'hostCarry'>

/** A host job runs, as far as the console knows (an expired wait no longer counts). */
function hostJobActive(data: LockInput | null | undefined): boolean {
  return devHostJobRunning(data?.host?.job) && data?.hostCarry?.expired !== true
}

/** The two buttons wait while a host job or a build and push runs. */
export function devHostActionsLocked(data: LockInput | null | undefined): boolean {
  return hostJobActive(data) || developmentJobRunning(data?.job)
}

/**
 * The development view is read every 2 s while a build and push or a host
 * job runs. A failed read keeps the last answer, so polling goes on through
 * the control plane's restart, but not past 3 minutes without a good read.
 */
export function developmentViewPollInterval(
  data: LockInput | null | undefined,
  lastGoodReadAt = 0,
  now = 0
): number | false {
  if (!devHostActionsLocked(data)) return false
  if (lastGoodReadAt > 0 && now - lastGoodReadAt > DEV_HOST_RECONNECT_CEILING_MS) return false
  return DEVELOPMENT_JOB_POLL_MS
}

/** Why a running job's progress is not on screen right now, or null when it is. */
export type DevHostWait = 'restarting' | 'reconnecting' | 'lost' | null

/**
 * - `lost`: the wait for a missing host expired, or reads have failed for
 *   more than 3 minutes during a job.
 * - `restarting`: reads fail while a host job runs.
 * - `reconnecting`: the control plane answers but has no word from the daemon.
 */
export function devHostWait(
  data: LockInput | null | undefined,
  readFailing: boolean,
  failingForMs: number
): DevHostWait {
  if (!devHostJobRunning(data?.host?.job)) return null
  if (data?.hostCarry?.expired) return 'lost'
  if (readFailing) return failingForMs > DEV_HOST_RECONNECT_CEILING_MS ? 'lost' : 'restarting'
  if (data?.hostCarry?.reason === 'host-missing') return 'reconnecting'
  return null
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
