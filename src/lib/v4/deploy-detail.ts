/**
 * What the Deploy screen says about one deploy: the ribbon, one row per server,
 * the steps and the last few lines.
 *
 * Steps are the phases the log has reached so far. The daemon does not send a
 * plan, so a step that has not started is not listed.
 */

import { commandErrorLine } from '@/lib/command-error'
import {
  cancelledDeploymentNote,
  cancelTooLateNote,
  deploymentServerLabel,
  formatDeployActor,
  formatDeployDuration,
  isDeploymentCancelling,
  isDeploymentInFlight,
  stalledDeploymentHint,
  type DeploymentGroup,
} from '@/lib/deployment-history'
import { formatAgo } from '@/lib/environment-status'
import type { LogTranscriptLine } from '@/lib/execution-log-lines'
import type { CommandStatus, DeploymentHistoryRecord } from '@/lib/instance-api'
import { phaseLabel } from '@/lib/v4/deploy-log'
import { groupSha, groupStatusKey, groupTitle } from '@/lib/v4/overview-deploys'

/** Status key of one server's attempt. */
export function commandStatusKey(row: DeploymentHistoryRecord): string {
  return row.strategyOutcome === 'rolled_back' ? 'rolledback' : statusOf(row.status)
}

function statusOf(status: CommandStatus): string {
  switch (status) {
    case 'succeeded':
      return 'deployed'
    case 'failed':
    case 'timed_out':
      return 'failed'
    case 'cancelled':
      return 'cancelled'
    case 'running':
      return 'deploying'
    default:
      return 'queued'
  }
}

export type DeployHost = Readonly<{
  serverId: string
  commandId: string
  label: string
  statusKey: string
  /** The one line that says why this server's attempt failed; null when it did not. */
  failure: string | null
  hasLog: boolean
}>

/** The line that says why a server's deploy failed: the engine's own reason first, then the error. */
function didNotFinish(row: DeploymentHistoryRecord): boolean {
  return row.status === 'failed' || row.status === 'timed_out' || row.strategyOutcome === 'rolled_back'
}

function failureOf(row: DeploymentHistoryRecord): string | null {
  return didNotFinish(row) ? (row.strategyOutcomeReason ?? commandErrorLine(row)) : null
}

export function deployHosts(group: DeploymentGroup): DeployHost[] {
  return group.commands.map((row) => ({
    serverId: row.serverId,
    commandId: row.commandId,
    label: deploymentServerLabel(row),
    statusKey: commandStatusKey(row),
    failure: failureOf(row),
    hasLog: row.hasLog,
  }))
}

export type DeployNote = Readonly<{
  tone: 'bad' | 'warn' | 'info'
  title: string
  body?: string
  errorLine?: string
}>

/** The one notice a deploy deserves, or null: why it failed, that it was cancelled, or what a stall means. */
export function deployNote(group: DeploymentGroup): DeployNote | null {
  const cancelled = cancelledDeploymentNote(group)
  if (cancelled !== null) return { tone: 'info', title: 'Cancelled', body: cancelled }
  const late = cancelTooLateNote(group)
  if (late !== null) return { tone: 'info', title: late }
  const failed = group.commands.find(didNotFinish)
  if (failed === undefined) return null
  const line = failureOf(failed)
  const hint = stalledDeploymentHint(failed.errorCode)
  const rolled = group.strategyOutcome === 'rolled_back'
  return {
    tone: rolled ? 'warn' : 'bad',
    title: rolled ? 'Rolled back' : 'It did not finish',
    ...(hint === null ? {} : { body: hint }),
    ...(line === null ? {} : { errorLine: line }),
  }
}

export type DeployRibbon = Readonly<{
  statusKey: string
  title: string
  sha: string | null
  /** "Started 4m ago · took 48s", or "Started 4m ago · running" while it goes. */
  sub: string
  who: string
  cancelling: boolean
  inFlight: boolean
}>

export function deployRibbon(group: DeploymentGroup, now: number): DeployRibbon {
  const inFlight = isDeploymentInFlight(group.commands)
  const cancelling = isDeploymentCancelling(group)
  const ago = formatAgo(group.startedAt, now)
  const took = inFlight ? 'running' : `took ${formatDeployDuration(group.durationMs)}`
  return {
    statusKey: cancelling ? 'deploying' : groupStatusKey(group),
    title: groupTitle(group),
    sha: groupSha(group),
    sub: [ago === null ? null : `Started ${ago}`, took].filter(Boolean).join(' · '),
    who: formatDeployActor(group.actorEntityType),
    cancelling,
    inFlight,
  }
}

export type StepState = 'done' | 'now' | 'pending' | 'bad'

export type DeployStep = Readonly<{ phase: string; label: string; state: StepState }>

const STEP_STATUS: Readonly<Record<StepState, string>> = {
  done: 'deployed',
  now: 'deploying',
  pending: 'queued',
  bad: 'failed',
}

/** The status key a step shows. */
export function stepStatusKey(state: StepState): string {
  return STEP_STATUS[state]
}

function lastStepState(status: CommandStatus): StepState {
  if (status === 'succeeded') return 'done'
  if (status === 'failed' || status === 'timed_out') return 'bad'
  if (status === 'cancelled') return 'pending'
  return 'now'
}

/**
 * The phases the log has reached, in order. Every phase before the last is
 * done; the last one takes the deploy's own state: going, done, failed here,
 * or stopped here.
 */
export function deploySteps(lines: readonly LogTranscriptLine[], status: CommandStatus): DeployStep[] {
  const phases: string[] = []
  for (const line of lines) {
    if (line.phase !== null && !phases.includes(line.phase)) phases.push(line.phase)
  }
  return phases.map((phase, index) => ({
    phase,
    label: phaseLabel(phase),
    state: index === phases.length - 1 ? lastStepState(status) : 'done',
  }))
}

/** The last few lines for the preview under the steps. */
export function tailLines(lines: readonly LogTranscriptLine[], count = 5): LogTranscriptLine[] {
  return lines.slice(-count)
}
