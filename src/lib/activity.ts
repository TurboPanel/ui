import type { BadgeTone } from '@/components/ui'
import type { DeploymentTriggerRecord, OrganizationActivityItem } from '@/lib/instance-api'

const ACTION_LABELS: Record<OrganizationActivityItem['action'], string> = {
  deploy: 'Deploy',
  start: 'Start',
  restart: 'Restart',
  stop: 'Stop',
}

export function activityActionLabel(action: OrganizationActivityItem['action']): string {
  return ACTION_LABELS[action]
}

/** What an item that is being worked on is called: only a deploy is "Deploying". */
const WORKING_LABELS: Record<OrganizationActivityItem['action'], string> = {
  deploy: 'Deploying',
  start: 'Starting',
  restart: 'Restarting',
  stop: 'Stopping',
}

type FailureKind = NonNullable<OrganizationActivityItem['failure']>

const FAILURE_LABELS: Record<FailureKind, string> = {
  timed_out: 'Timed Out',
  rolled_back: 'Rolled Back',
  needs_attention: 'Needs Attention',
}

const FINISHED_LABELS: Record<'succeeded' | 'cancelled', string> = {
  succeeded: 'Succeeded',
  cancelled: 'Cancelled',
}

export function activityStateLabel(
  state: OrganizationActivityItem['state'],
  action: OrganizationActivityItem['action'],
  failure?: OrganizationActivityItem['failure']
): string {
  if (state === 'failed') return failure ? FAILURE_LABELS[failure] : 'Failed'
  if (state === 'succeeded' || state === 'cancelled') return FINISHED_LABELS[state]
  return state === 'queued' ? 'Queued' : WORKING_LABELS[action]
}

const STATE_TONES: Record<OrganizationActivityItem['state'], BadgeTone> = {
  queued: 'muted',
  deploying: 'pending',
  succeeded: 'ok',
  failed: 'danger',
  cancelled: 'muted',
}

export function activityStateTone(
  state: OrganizationActivityItem['state'],
  failure?: OrganizationActivityItem['failure']
): BadgeTone {
  // The previous version is serving again: worth a look, not an outage.
  if (state === 'failed' && failure === 'rolled_back') return 'info'
  return STATE_TONES[state] ?? 'pending'
}

/** Whether the item is still in progress (queued or being worked on). */
export function isActivityLive(item: Pick<OrganizationActivityItem, 'state'>): boolean {
  return item.state === 'queued' || item.state === 'deploying'
}

/** The git login behind a push, or null when the panel did not record one. */
export function gitPusherLogin(
  trigger: Pick<DeploymentTriggerRecord, 'pushedBy'> | null | undefined
): string | null {
  return trigger?.pushedBy?.trim() || null
}

/**
 * A push in a few words: "octocat (Push to main)" when the pusher's git login
 * is known, else "Push to main", or "Git push" when no branch was recorded.
 */
export function gitPushLabel(
  trigger: Pick<DeploymentTriggerRecord, 'branch' | 'pushedBy'>
): string {
  const branch = trigger.branch?.trim()
  const push = branch ? `Push to ${branch}` : 'Git push'
  const login = gitPusherLogin(trigger)
  return login ? `${login} (${push})` : push
}

/**
 * The git login to show beside a git icon when a push started this, else null
 * (a person, the panel, or a push that named nobody).
 */
export function activityPushedBy(
  item: Pick<OrganizationActivityItem, 'actorName' | 'trigger'>
): string | null {
  return item.actorName ? null : gitPusherLogin(item.trigger)
}

/**
 * Who or what started it, in a few words: the person, the push ("octocat
 * (Push to main)", or "Push to main" when the pusher is unknown), or "System"
 * for the panel's own work.
 */
export function activityStartedByLabel(
  item: Pick<OrganizationActivityItem, 'actorType' | 'actorName' | 'trigger'>
): string {
  if (item.actorName) return item.actorName
  if (item.trigger) return gitPushLabel(item.trigger)
  return item.actorType === 'user' ? 'Former Member' : 'System'
}

/** The commit as "abc1234 Fix the login page", or null when none was recorded. */
export function activityCommitText(item: Pick<OrganizationActivityItem, 'commit'>): string | null {
  if (!item.commit) return null
  const sha = item.commit.sha.slice(0, 7)
  const message = item.commit.message?.trim()
  return message ? `${sha} ${message}` : sha
}

/** "Project / Environment", degrading to whichever half is known, or a dash. */
export function activityTargetLabel(
  item: Pick<OrganizationActivityItem, 'projectName' | 'environmentName'>
): string {
  const parts = [item.projectName, item.environmentName].filter(
    (part): part is string => typeof part === 'string' && part.length > 0
  )
  return parts.length > 0 ? parts.join(' / ') : '—'
}

/** "1–25 of 237" for the pager ("of 1,025+" when the count stopped early); "0 of 0" when empty. */
export function activityRangeLabel(
  offset: number,
  shown: number,
  total: number,
  capped = false
): string {
  if (total === 0 || shown === 0) return '0 of 0'
  const of = capped ? `${total.toLocaleString('en-US')}+` : total.toLocaleString('en-US')
  return `${offset + 1}–${offset + shown} of ${of}`
}
