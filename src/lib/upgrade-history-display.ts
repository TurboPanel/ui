import type {
  UpgradeRunRecord,
  UpgradeRunServerComponent,
  UpgradeRunServerRow,
  UpgradeRunSource,
  UpgradeRunSummary,
  UpgradeRunTarget,
  UpgradeRunTargetUnit,
  UpgradeRunUnit,
  UpgradeServerOutcome,
} from '@/lib/instance-api'
import { isHttpStatusError } from '@/lib/fetch-error-detail'
import { formatDurationSeconds } from '@/lib/format-metrics'
import { isUpgradeRunActive } from '@/lib/upgrade-run-poll'
import { userErrorMessage } from '@/lib/user-error'
import type { UpgradeRunStatus } from '@/lib/upgrade-vocabulary'

/** What the update history and run screens show for an empty value. */
export const EMPTY_CELL = '—'

export type HistoryBadge = Readonly<{
  tone: 'ok' | 'muted' | 'danger' | 'pending' | 'info'
  label: string
}>

/** Who or what started a run: the maintenance tick, a person, or a person updating one server. */
export function upgradeTriggerLabel(source: UpgradeRunSource | null | undefined): string {
  if (source === 'auto') return 'Automatic'
  if (source === 'server') return 'Manual (one server)'
  return 'Manual'
}

/** The person who started a run, or "Automatic" for a run the control plane started itself. */
export function upgradeStartedByLabel(
  run: Readonly<Pick<UpgradeRunRecord, 'source' | 'startedByEmail'>>
): string {
  const email = run.startedByEmail?.trim()
  if (email) return email
  return run.source === 'auto' ? 'Automatic' : 'Unknown'
}

const RUN_STATUS_BADGES: Readonly<Record<UpgradeRunStatus, HistoryBadge>> = {
  pending: { tone: 'info', label: 'Starting' },
  running: { tone: 'info', label: 'Running' },
  succeeded: { tone: 'ok', label: 'Succeeded' },
  partially_failed: { tone: 'pending', label: 'Partly failed' },
  failed: { tone: 'danger', label: 'Failed' },
  cancelled: { tone: 'muted', label: 'Cancelled' },
}

export function upgradeRunStatusBadge(status: UpgradeRunStatus): HistoryBadge {
  return RUN_STATUS_BADGES[status] ?? { tone: 'muted', label: status }
}

/** Status filter choices on Update History, in the order they are offered. */
export const RUN_STATUS_FILTERS = [
  { value: 'any', label: 'All' },
  { value: 'active', label: 'Running' },
  { value: 'succeeded', label: 'Succeeded' },
  { value: 'partially_failed', label: 'Partly failed' },
  { value: 'failed', label: 'Failed' },
  { value: 'cancelled', label: 'Cancelled' },
] as const

export type RunStatusFilter = (typeof RUN_STATUS_FILTERS)[number]['value']

export const RUN_TRIGGER_FILTERS = [
  { value: '', label: 'Any trigger' },
  { value: 'automatic', label: 'Automatic' },
  { value: 'manual', label: 'Manual' },
] as const

export type RunTriggerFilter = (typeof RUN_TRIGGER_FILTERS)[number]['value']

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`
}

/** "2 skipped, 1 failed" from the non-zero parts, or null when every part is zero. */
function leftOverParts(summary: UpgradeRunSummary, withInProgress = true): string | null {
  const parts: string[] = []
  if (summary.failed > 0) parts.push(`${summary.failed} failed`)
  if (summary.skipped > 0) parts.push(`${summary.skipped} skipped`)
  if (withInProgress && summary.inProgress > 0) parts.push(`${summary.inProgress} in progress`)
  return parts.length > 0 ? parts.join(', ') : null
}

/** A run that is still going and has not updated anything so far: "Nothing updated yet". */
function nothingYetResult(summary: UpgradeRunSummary): string {
  const rest = leftOverParts(summary, false)
  return rest ? `Nothing updated yet, ${rest}` : 'Nothing updated yet'
}

/** Result line for a run whose per-server rows were removed after the retention window. */
function prunedResult(summary: UpgradeRunSummary): string {
  const rest = leftOverParts(summary)
  return rest
    ? `${plural(summary.total, 'server', 'servers')}, ${rest}`
    : plural(summary.total, 'server', 'servers')
}

/**
 * What a run did, in plain words. Honest about runs that changed nothing: a run
 * whose every server was already on the target reads "Already up to date", and
 * one that updated nothing says what happened instead ("Nothing updated, 3
 * skipped"). It never claims an update that did not happen.
 */
export function upgradeRunResultLabel(
  run: Readonly<Pick<UpgradeRunRecord, 'status' | 'summary'>>
): string {
  const summary = run.summary
  if (!summary) return upgradeRunStatusBadge(run.status).label
  if (summary.detail === 'pruned' || summary.updated === null) return prunedResult(summary)
  if (summary.total === 0) return 'No servers in this update'
  const rest = leftOverParts(summary)
  if (summary.updated > 0) {
    const updated = `${summary.updated} updated`
    return rest ? `${updated}, ${rest}` : updated
  }
  if (isUpgradeRunActive(run.status)) return nothingYetResult(summary)
  if (rest) return `Nothing updated, ${rest}`
  return 'Already up to date'
}

/**
 * Why an update history screen could not load: a run that is gone (404), a
 * link whose filter or id the control plane refused (400), else the plain error.
 */
export function historyLoadError(error: unknown, fallback: string): string {
  if (isHttpStatusError(error, 404)) return 'This update was not found. It may have been removed.'
  if (isHttpStatusError(error, 400)) {
    return 'This link has a filter or id the control plane does not accept.'
  }
  return userErrorMessage(error, fallback)
}

/** A server count cell: the number, or a dash when it is not known. */
export function countCellText(value: number | null | undefined): string {
  return value === null || value === undefined ? EMPTY_CELL : String(value)
}

function millisBetween(
  from: string | null | undefined,
  to: string | null | undefined
): number | null {
  if (!from || !to) return null
  const start = Date.parse(from)
  const end = Date.parse(to)
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return null
  return end - start
}

/** How long something took (`3m 10s`), or a dash when it has not finished or a time is missing. */
export function durationText(
  startedAt: string | null | undefined,
  finishedAt: string | null | undefined
): string {
  const ms = millisBetween(startedAt, finishedAt)
  return ms === null ? EMPTY_CELL : formatDurationSeconds(ms / 1000)
}

/** A duration the control plane already worked out, in milliseconds. */
export function durationMsText(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms) || ms < 0) return EMPTY_CELL
  return formatDurationSeconds(ms / 1000)
}

function unitVersion(unit: UpgradeRunTargetUnit | null | undefined): string | null {
  const version = unit?.version?.trim()
  if (version) return version
  const commit = unit?.commit?.trim()
  return commit ? commit.slice(0, 7) : null
}

/**
 * The build(s) a run moved to: one version when the daemon and the control
 * plane share it, else each named ("Daemon 0.1.16 · Control plane 0.1.17").
 */
export function upgradeRunTargetText(target: UpgradeRunTarget | null | undefined): string {
  const daemon = unitVersion(target?.daemon)
  const instance = unitVersion(target?.instance)
  if (daemon && instance && daemon !== instance) {
    return `Daemon ${daemon} · Control plane ${instance}`
  }
  return daemon ?? instance ?? EMPTY_CELL
}

const UNIT_LABELS: Readonly<Record<UpgradeRunUnit, string>> = {
  daemon: 'Daemon',
  instance: 'Control plane',
}

export function upgradeUnitLabel(unit: UpgradeRunUnit): string {
  return UNIT_LABELS[unit] ?? unit
}

const OUTCOME_BADGES: Readonly<Record<UpgradeServerOutcome, HistoryBadge>> = {
  updated: { tone: 'ok', label: 'Updated' },
  already_current: { tone: 'muted', label: 'Already up to date' },
  skipped: { tone: 'muted', label: 'Skipped' },
  failed: { tone: 'danger', label: 'Failed' },
  in_progress: { tone: 'info', label: 'In progress' },
}

export function upgradeServerOutcomeBadge(outcome: UpgradeServerOutcome): HistoryBadge {
  return OUTCOME_BADGES[outcome] ?? { tone: 'muted', label: outcome }
}

/** Server status filters on the run screen; failed first, the order people look for them. */
export const SERVER_OUTCOME_FILTERS: readonly ('' | UpgradeServerOutcome)[] = [
  '',
  'failed',
  'in_progress',
  'skipped',
  'updated',
  'already_current',
]

/** "All (12)", "Failed (2)" for the quick filters, from the run's per-status counts. */
export function serverOutcomeFilterLabel(
  outcome: '' | UpgradeServerOutcome,
  counts: Partial<Record<UpgradeServerOutcome | 'all', number>> | null | undefined
): string {
  const label = outcome === '' ? 'All' : upgradeServerOutcomeBadge(outcome).label
  const count = counts?.[outcome === '' ? 'all' : outcome]
  return count === undefined ? label : `${label} (${count})`
}

type VersionSide = Readonly<{ version: string | null; commit: string | null }>

function shortCommit(commit: string | null): string | null {
  const trimmed = commit?.trim()
  return trimmed ? trimmed.slice(0, 7) : null
}

function sideText(side: VersionSide, withCommit: boolean): string | null {
  const version = side.version?.trim() || null
  const commit = shortCommit(side.commit)
  if (version && commit && withCommit) return `${version} (${commit})`
  return version ?? commit
}

/**
 * "0.1.14 → 0.1.15". When both sides carry the same version (two builds of one
 * release, such as canaries) the short commits are added so the change shows:
 * "0.1.15 (abc1234) → 0.1.15 (def5678)".
 */
export function versionChangeText(from: VersionSide, to: VersionSide): string {
  const sameVersion = Boolean(from.version?.trim()) && from.version?.trim() === to.version?.trim()
  const withCommit = sameVersion && shortCommit(from.commit) !== shortCommit(to.commit)
  const left = sideText(from, withCommit)
  const right = sideText(to, withCommit)
  if (left && right) return `${left} → ${right}`
  if (right) return `to ${right}`
  return left ?? EMPTY_CELL
}

/** One component cell: "Already up to date (0.1.15)" or its from → to change. */
export function componentChangeText(component: UpgradeRunServerComponent): string {
  const to = { version: component.toVersion, commit: component.toCommit }
  if (component.outcome === 'already_current') {
    const on = sideText(to, false)
    return on ? `Already up to date (${on})` : 'Already up to date'
  }
  return versionChangeText({ version: component.fromVersion, commit: component.fromCommit }, to)
}

/** A server row's from → to, with the same rule as a component cell. */
export function serverChangeText(row: UpgradeRunServerRow): string {
  if (row.status === 'already_current') return 'Already up to date'
  return versionChangeText(
    { version: row.fromVersion, commit: row.fromCommit },
    { version: row.toVersion, commit: row.toCommit }
  )
}

/** A short id for a long uuid, so a table cell can show it beside a name. */
export function shortId(id: string | null | undefined): string {
  return id ? id.slice(0, 8) : EMPTY_CELL
}

/** "Online now" for a connected server, else when it was last heard from. */
export function heartbeatText(
  row: Readonly<Pick<UpgradeRunServerRow, 'connected' | 'lastHeartbeatAt'>>,
  formatTime: (iso: string) => string
): string {
  if (row.lastHeartbeatAt) {
    const when = formatTime(row.lastHeartbeatAt)
    return row.connected ? `Online, ${when}` : `Offline, last seen ${when}`
  }
  return row.connected ? 'Online' : 'Offline'
}

/** Admin routes of the update history screens. */
export const UPDATE_HISTORY_HREF = '/admin/updates/history'

export function updateRunHref(runId: string): string {
  return `/admin/updates/runs/${encodeURIComponent(runId)}`
}

export function serverUpdateLogHref(runId: string, serverId: string): string {
  return `${updateRunHref(runId)}/servers/${encodeURIComponent(serverId)}`
}

/** The organization console page of a server; null when the server has no organization. */
export function serverPageHref(
  row: Readonly<Pick<UpgradeRunServerRow, 'organizationId' | 'serverId'>>
): string | null {
  if (!row.organizationId) return null
  return `/${encodeURIComponent(row.organizationId)}/servers/${encodeURIComponent(row.serverId)}`
}
