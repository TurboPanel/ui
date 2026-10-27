import { formatLocalDateTime } from '@/lib/format-datetime'
import {
  UpdateCheckTooSoonError,
  type InstanceUpdates,
  type UpdatesPausedBy,
} from '@/lib/instance-api'
import { joinWithAnd } from '@/lib/upgrade-display'
import { userErrorMessage } from '@/lib/user-error'

/**
 * Words for automatic updates on Admin > Updates. Updates of the control
 * plane, the web interface and every daemon start on their own at the hourly
 * check; the controls are Pause All Updates / Resume Updates and Check Now,
 * which only looks for new builds.
 */

/** Formats an ISO instant for a sentence; the screens use local time. */
export type FormatInstant = (iso: string) => string

/** Local date and time, without seconds (`Oct 27, 2026, 3:12 PM PDT`). */
export function formatUpdateTime(iso: string): string {
  return formatLocalDateTime(iso, { includeSeconds: false })
}

/** Who paused updates: their name, else their email, else "an administrator". */
export function pausedByLabel(pausedBy: UpdatesPausedBy | null | undefined): string {
  return pausedBy?.name?.trim() || pausedBy?.email?.trim() || 'an administrator'
}

/** "Updates paused since <time> by <name>", or null while updates run. */
export function pausedSinceText(
  updates: Pick<InstanceUpdates, 'updatesPaused' | 'pausedAt' | 'pausedBy'>,
  format: FormatInstant = formatUpdateTime
): string | null {
  if (updates.updatesPaused !== true) return null
  const by = pausedByLabel(updates.pausedBy)
  return updates.pausedAt
    ? `Updates paused since ${format(updates.pausedAt)} by ${by}`
    : `Updates paused by ${by}`
}

/** "Next check: <time>", or null when the control plane names none. */
export function nextCheckText(
  nextCheckAt: string | null | undefined,
  format: FormatInstant = formatUpdateTime
): string | null {
  return nextCheckAt ? `Next check: ${format(nextCheckAt)}` : null
}

/** "Last checked <time>", scheduled or Check Now, or null before the first check. */
export function lastCheckedText(
  lastCheckAt: string | null | undefined,
  format: FormatInstant = formatUpdateTime
): string | null {
  return lastCheckAt ? `Last checked ${format(lastCheckAt)}` : null
}

/** How often the scheduled check runs, for a sentence: "once an hour", "every 5 minutes". */
export function checkCadence(checkIntervalMinutes: number | null | undefined): string {
  if (!checkIntervalMinutes || checkIntervalMinutes === 60) return 'once an hour'
  if (checkIntervalMinutes === 1) return 'every minute'
  return `every ${checkIntervalMinutes} minutes`
}

/** What Check Now does, under the button. */
export const CHECK_NOW_HELP =
  'Check Now only looks for new builds. The next scheduled check starts the update.'

/**
 * Why Check Now did not run, in plain words, and when that line should go
 * away: a check too soon after the last one clears once the wait has passed;
 * any other error stays until the next try.
 */
export function checkNowRefusal(
  err: unknown
): Readonly<{ text: string; clearAfterMs: number | null }> {
  if (err instanceof UpdateCheckTooSoonError) {
    const seconds = Math.max(1, Math.ceil(err.retryAfterSeconds))
    return {
      text: `Checked a moment ago. Try again in ${seconds} second${seconds === 1 ? '' : 's'}.`,
      clearAfterMs: seconds * 1000,
    }
  }
  return { text: userErrorMessage(err, 'Could not check for updates'), clearAfterMs: null }
}

/** What the Pause confirmation says before anything stops. */
export const PAUSE_UPDATES_PROMPT =
  'Pause all updates? Nothing new starts until you resume. An update in progress finishes the servers it is updating, then stops.'

/** What the Resume confirmation says: updates start again at the next check. */
export function resumeUpdatesPrompt(
  nextCheckAt: string | null | undefined,
  format: FormatInstant = formatUpdateTime
): string {
  const when = nextCheckAt ? ` (${format(nextCheckAt)})` : ''
  return `Resume updates? They start again at the next check${when}.`
}

/**
 * What waits to update, as one sentence: the pieces with a newer build (each
 * with its version) and, when a connected daemon is behind, the daemons on
 * those servers. Null when nothing waits.
 */
export function waitingSentence(
  input: Readonly<{ pieceLabels: readonly string[]; daemonsBehind: boolean }>
): string | null {
  const items = [...input.pieceLabels]
  if (input.daemonsBehind) items.push('the daemon on some servers')
  if (items.length === 0) return null
  return `Waiting to update: ${joinWithAnd(items)}. It starts on its own at the next check.`
}

/** When something waits that the screen cannot name piece by piece. */
export const UPDATE_WAITING_COPY = 'An update is waiting. It starts on its own at the next check.'

/**
 * Whether anything waits to update. The control plane's `updateWaiting` is the
 * answer; an older control plane without the field falls back to what the
 * screen worked out itself.
 */
export function isUpdateWaiting(
  updates: Pick<InstanceUpdates, 'updateWaiting' | 'daemonsBehind'>,
  localWaiting: boolean
): boolean {
  if (typeof updates.updateWaiting === 'boolean') return updates.updateWaiting
  return localWaiting || updates.daemonsBehind === true
}

/** Plain status of updates on a server page: nobody starts a server update by hand. */
export const SERVER_UPDATES_AUTOMATIC_COPY =
  'Updates automatically. An instance administrator can use Pause All Updates in Admin > Updates.'
