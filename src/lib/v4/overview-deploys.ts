/**
 * The "Latest deployments" rows and the problem notice on the environment
 * Overview, from the deploy history the header already loads.
 *
 * Only what the history says: the error line is the control plane's own
 * `errorMessage`, and "the previous version is still serving" appears only
 * when an earlier deploy did succeed and the environment is running.
 */

import { formatAgo } from '@/lib/environment-status'
import {
  deploymentStatusTone,
  formatDeployDuration,
  groupDeploymentsByGeneration,
  isDeploymentRunning,
  type DeploymentGroup,
} from '@/lib/deployment-history'
import type { DeploymentHistoryRecord } from '@/lib/instance-api'

export type DeployRow = Readonly<{
  id: string
  /** A key of the status vocabulary. */
  statusKey: string
  /** The Deployments tab's word for a finished deploy ("Succeeded"); absent while it runs. */
  statusLabel?: string
  title: string
  /** Short commit id, or null when the deploy was not a push. */
  sha: string | null
  sub: string
  when: string
  live: boolean
}>

const SHA_LENGTH = 7

export function groupStatusKey(group: DeploymentGroup): string {
  if (group.strategyOutcome === 'rolled_back') return 'rolledback'
  // Stopped on purpose mid-deploy: the same red as a failure, as on the cards.
  if (group.strategyOutcome === 'needs_attention') return 'failed'
  if (isDeploymentRunning(group)) return 'deploying'
  switch (group.status) {
    case 'succeeded':
      return 'deployed'
    case 'failed':
    case 'timed_out':
      return 'failed'
    case 'cancelled':
      return 'cancelled'
    default:
      return 'queued'
  }
}

function groupSha(group: DeploymentGroup): string | null {
  const sha = group.trigger?.commitSha
  return sha ? sha.slice(0, SHA_LENGTH) : null
}

function groupTitle(group: DeploymentGroup): string {
  const branch = group.trigger?.branch?.trim()
  if (group.trigger) return branch ? `Push to ${branch}` : 'Git push'
  return group.actorEntityType === 'user' ? 'Started in the console' : 'Started by the system'
}

const FINISHED_STATUSES: ReadonlySet<string> = new Set([
  'succeeded',
  'failed',
  'timed_out',
  'cancelled',
])

/** A finished deploy reads the same word as on the Deployments tab: Succeeded, Failed, Cancelled. */
function groupStatusLabel(group: DeploymentGroup): string | undefined {
  if (!FINISHED_STATUSES.has(group.status)) return undefined
  return deploymentStatusTone(group.status, group.strategyOutcome).label
}

/** Not started yet: the status chip reads these as queued too (see `groupStatusKey`). */
const WAITING_STATUSES: ReadonlySet<string> = new Set(['queued', 'dispatching', 'sent', 'acked'])

/**
 * The line under a deploy: how long it took, or - while it has no duration -
 * what it is doing. Only a deploy a server has started reads "In progress"; one
 * waiting its turn says so, and a finished deploy that never recorded a time
 * (cancelled before it started, say) shows a dash rather than a false claim.
 */
function groupSub(group: DeploymentGroup): string {
  if (group.durationMs !== null) return formatDeployDuration(group.durationMs)
  if (isDeploymentRunning(group)) return 'In progress'
  if (WAITING_STATUSES.has(group.status)) return 'Waiting to start'
  return formatDeployDuration(null)
}

/** The newest deploys, newest first. `running` marks the newest good one as live. */
export function deployRows(
  rows: readonly DeploymentHistoryRecord[],
  now: number,
  running: boolean,
  limit = 3
): DeployRow[] {
  const groups = groupDeploymentsByGeneration(rows)
  const liveId = running
    ? groups.find((group) => groupStatusKey(group) === 'deployed')?.id
    : undefined
  return groups.slice(0, limit).map((group) => {
    const statusLabel = groupStatusLabel(group)
    return {
      id: group.id,
      statusKey: groupStatusKey(group),
      ...(statusLabel === undefined ? {} : { statusLabel }),
      title: groupTitle(group),
      sha: groupSha(group),
      sub: groupSub(group),
      when: formatAgo(group.startedAt, now) ?? '',
      live: group.id === liveId,
    }
  })
}

export type ProblemNotice = Readonly<{
  tone: 'bad' | 'warn'
  title: string
  body: string
  /** The one raw line of what went wrong; absent when the control plane gave none. */
  errorLine?: string
}>

const ERROR_LINE_MAX = 240

/** First non-empty line of an error text, cut to a length that fits a notice. */
export function firstErrorLine(text: string | null | undefined): string | undefined {
  const line = text
    ?.split('\n')
    .map((part) => part.trim())
    .find((part) => part !== '')
  if (line === undefined) return undefined
  return line.length > ERROR_LINE_MAX ? `${line.slice(0, ERROR_LINE_MAX - 1)}…` : line
}

function groupErrorLine(group: DeploymentGroup): string | undefined {
  for (const command of group.commands) {
    const line = firstErrorLine(command.errorMessage)
    if (line !== undefined) return line
  }
  return undefined
}

function deployName(group: DeploymentGroup): string {
  const sha = groupSha(group)
  return sha === null ? 'The last deploy' : `The last deploy (${sha})`
}

/**
 * A notice for a newest deploy that failed or was rolled back. Nothing for a
 * deploy that is running, queued, cancelled or fine, and nothing about a crash:
 * the server does not say that yet.
 */
export function problemNotice(
  rows: readonly DeploymentHistoryRecord[],
  running: boolean
): ProblemNotice | null {
  const groups = groupDeploymentsByGeneration(rows)
  const latest = groups[0]
  if (latest === undefined) return null
  const key = groupStatusKey(latest)
  const errorLine = groupErrorLine(latest)
  const extra = errorLine === undefined ? {} : { errorLine }
  if (key === 'rolledback') {
    const reason = latest.commands.find(
      (command) => command.strategyOutcomeReason
    )?.strategyOutcomeReason
    return {
      tone: 'warn',
      title: `${deployName(latest)} was rolled back`,
      body: reason ?? 'The previous version is back in place.',
      ...extra,
    }
  }
  if (key !== 'failed') return null
  const earlierGood = groups.slice(1).some((group) => groupStatusKey(group) === 'deployed')
  const serving = running && earlierGood ? ' The previous version is still serving.' : ''
  return {
    tone: 'bad',
    title: `${deployName(latest)} failed`,
    body: `It did not go live.${serving}`,
    ...extra,
  }
}
