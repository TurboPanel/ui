/**
 * Presentation helpers for environment deploy history.
 *
 * The list endpoint returns one row per `(deploy attempt, server)`. A multi-host
 * deploy therefore arrives as several rows sharing one `generation` — that is
 * the fan-out, and the UI groups them rather than fetching the detail route for
 * every row (which would be an N+1 read of state the list already carries).
 */

import type { CommandStatus, DeploymentHistoryRecord } from '@/lib/instance-api'

/** One deploy — the fan-out across every participating host. */
export type DeploymentGroup = Readonly<{
  /** Anchor row id; also the key for React lists. */
  id: string
  generation: number | null
  /** Newest attempt first is meaningless within a fan-out — keep server order. */
  commands: readonly DeploymentHistoryRecord[]
  /** Worst status across the fan-out (failed ≫ running ≫ queued ≫ succeeded). */
  status: CommandStatus
  actorEntityType: string
  /** Earliest queue time across the fan-out. */
  startedAt: string | null
  /** Longest attempt in the fan-out; null while any attempt is still running. */
  durationMs: number | null
}>

/**
 * Lifecycle ranking for a fan-out. Failures outrank everything, then an
 * in-flight `running` attempt, then the pre-run states — otherwise a deploy
 * with one host already running and another still queued would render as
 * `Queued` purely because of row order.
 */
const STATUS_SEVERITY: Readonly<Record<string, number>> = {
  failed: 6,
  timed_out: 6,
  cancelled: 5,
  running: 4,
  queued: 3,
  dispatching: 3,
  sent: 3,
  acked: 3,
  succeeded: 1,
}

function statusSeverity(status: CommandStatus): number {
  return STATUS_SEVERITY[status] ?? 2
}

/** Worst status wins, so a partially failed fan-out never reads as succeeded. */
export function worstDeploymentStatus(
  rows: readonly DeploymentHistoryRecord[],
): CommandStatus {
  let worst: CommandStatus = rows[0]?.status ?? 'queued'
  for (const row of rows) {
    if (statusSeverity(row.status) > statusSeverity(worst)) {
      worst = row.status
    }
  }
  return worst
}

function earliestTimestamp(
  rows: readonly DeploymentHistoryRecord[],
): string | null {
  let earliest: string | null = null
  for (const row of rows) {
    const candidate = row.startedAt ?? row.queuedAt
    if (!candidate) continue
    if (earliest === null || candidate < earliest) {
      earliest = candidate
    }
  }
  return earliest
}

function fanOutDuration(
  rows: readonly DeploymentHistoryRecord[],
): number | null {
  let longest: number | null = null
  for (const row of rows) {
    // Any attempt still running makes the whole deploy's duration unknown.
    if (row.durationMs === null) return null
    if (longest === null || row.durationMs > longest) longest = row.durationMs
  }
  return longest
}

/**
 * Group list rows into deploys. Rows sharing a non-null `generation` are one
 * fan-out; rows with a null generation (legacy attempts) stand alone. Group
 * order follows the incoming row order, which the API returns newest first.
 */
export function groupDeploymentsByGeneration(
  rows: readonly DeploymentHistoryRecord[],
): DeploymentGroup[] {
  const order: string[] = []
  const buckets = new Map<string, DeploymentHistoryRecord[]>()

  for (const row of rows) {
    const key = row.generation === null ? `row:${row.id}` : `gen:${row.generation}`
    const bucket = buckets.get(key)
    if (bucket) {
      bucket.push(row)
      continue
    }
    buckets.set(key, [row])
    order.push(key)
  }

  return order.map((key) => {
    const commands = buckets.get(key) ?? []
    const anchor = commands[0]
    return {
      id: anchor?.id ?? key,
      generation: anchor?.generation ?? null,
      commands,
      status: worstDeploymentStatus(commands),
      actorEntityType: anchor?.actorEntityType ?? 'unknown',
      startedAt: earliestTimestamp(commands),
      durationMs: fanOutDuration(commands),
    }
  })
}

/** `1.4s` / `48s` / `3m 12s` — never a bare millisecond count in the UI. */
export function formatDeployDuration(durationMs: number | null): string {
  if (durationMs === null || durationMs < 0) return '—'
  if (durationMs < 1000) return `${durationMs}ms`
  const totalSeconds = Math.round(durationMs / 1000)
  if (totalSeconds < 60) {
    return durationMs < 10_000
      ? `${(durationMs / 1000).toFixed(1)}s`
      : `${totalSeconds}s`
  }
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}m ${seconds}s`
}

/** Short absolute stamp — history is scanned by time of day, not by ISO string. */
export function formatDeployTimestamp(value: string | null): string {
  if (!value) return '—'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return '—'
  const date = parsed.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  })
  const time = parsed.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  })
  return `${date} · ${time}`
}

/** Human label for the actor column (`user` / `system` / service accounts). */
export function formatDeployActor(actorEntityType: string): string {
  if (actorEntityType === 'user') return 'User'
  if (actorEntityType === 'system') return 'System'
  if (actorEntityType.length === 0) return 'Unknown'
  return actorEntityType.charAt(0).toUpperCase() + actorEntityType.slice(1)
}

export type DeploymentStatusTone = Readonly<{
  label: string
  tone: 'success' | 'failed' | 'pending'
}>

/** Status label + tone. Callers pair the tone with the label — never colour alone. */
export function deploymentStatusTone(
  status: CommandStatus,
): DeploymentStatusTone {
  if (status === 'succeeded') return { label: 'Succeeded', tone: 'success' }
  if (status === 'failed') return { label: 'Failed', tone: 'failed' }
  if (status === 'timed_out') return { label: 'Timed out', tone: 'failed' }
  if (status === 'cancelled') return { label: 'Cancelled', tone: 'failed' }
  if (status === 'running') return { label: 'Running', tone: 'pending' }
  return { label: 'Queued', tone: 'pending' }
}

/** Host label for a fan-out row — display name first, id as the fallback. */
export function deploymentServerLabel(row: DeploymentHistoryRecord): string {
  return row.serverName?.trim() || row.serverId
}
