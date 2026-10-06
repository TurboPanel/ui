/**
 * How a service is running, from the daemon's own report (`runState` on a
 * service row, turbopanel#317), and what the Crash sheet says about it.
 *
 * Only what the report carries: the state, the restart count, the last log
 * line it saw and when it saw it. The report is the latest one, never a
 * history, so nothing here says "since" or "last hour".
 */

import { formatAgo } from '@/lib/environment-status'
import type { ServiceRunStateName, ServiceRunStateRecord } from '@/lib/instance-api'
import { statusInfo, type StatusKey } from '@/lib/v4/status-vocab'
import { plural } from '@/lib/v4/text'

const STATUS_OF: Readonly<Record<ServiceRunStateName, StatusKey>> = {
  starting: 'busy',
  running: 'running',
  unhealthy: 'unhealthy',
  crashing: 'crashing',
  stopped: 'stopped',
  stopped_after_crashes: 'crashstop',
  unknown: 'unknown',
}

/** The status key for a reported state. */
export function runStateKey(state: ServiceRunStateName): StatusKey {
  return STATUS_OF[state]
}

/** States that need a person: the app is failing, not just starting or stopped on purpose. */
const TROUBLED = new Set<ServiceRunStateName>(['crashing', 'stopped_after_crashes', 'unhealthy'])

export function isTroubled(runState: ServiceRunStateRecord | null | undefined): boolean {
  return runState != null && TROUBLED.has(runState.state)
}

export type CrashInfo = Readonly<{
  /** The app's name in the compose file. */
  service: string
  state: ServiceRunStateName
  statusKey: StatusKey
  /** The status word the chip shows. */
  statusLabel: string
  title: string
  /** One plain sentence on what the state means and how often it restarted. */
  summary: string
  restartCount: number
  /** The last log line the daemon saw, as sent; null when it saw none. */
  lastError: string | null
  /** "Seen 5m ago", or null when the time cannot be read. */
  seen: string | null
}>

function titleOf(service: string, state: ServiceRunStateName): string {
  if (state === 'stopped_after_crashes') return `${service} stopped after repeated crashes`
  if (state === 'unhealthy') return `${service} is not healthy`
  return `${service} keeps crashing`
}

function summaryOf(state: ServiceRunStateName, restartCount: number): string {
  const times = plural(restartCount, 'time')
  if (state === 'stopped_after_crashes') {
    return `It restarted ${times} and was then left stopped.`
  }
  if (state === 'unhealthy') {
    return restartCount === 0
      ? 'It is running, but its health check is failing.'
      : `It is running, but its health check is failing. It has restarted ${times}.`
  }
  return `It starts, fails and starts again. It has restarted ${times}.`
}

/** The sheet's content for an app in trouble; null for an app that is fine or has no report. */
export function crashInfo(
  service: string,
  runState: ServiceRunStateRecord | null | undefined,
  now: number,
): CrashInfo | null {
  if (runState == null || !isTroubled(runState)) return null
  const statusKey = runStateKey(runState.state)
  const ago = formatAgo(runState.asOf, now)
  const lastError = runState.lastError?.trim() ?? ''
  return {
    service,
    state: runState.state,
    statusKey,
    statusLabel: statusInfo(statusKey).label,
    title: titleOf(service, runState.state),
    summary: summaryOf(runState.state, runState.restartCount),
    restartCount: runState.restartCount,
    lastError: lastError === '' ? null : lastError,
    seen: ago === null ? null : `Seen ${ago}`,
  }
}
