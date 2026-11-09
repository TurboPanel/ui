import { formatLocalDateTime } from '@/lib/format-datetime'
import {
  UpdateCheckTooSoonError,
  UpdateNowRefusedError,
  type InstanceUpdates,
  type UpdatesPausedBy,
} from '@/lib/instance-api'
import { joinWithAnd } from '@/lib/upgrade-display'
import { userErrorMessage } from '@/lib/user-error'

/**
 * Words for automatic updates on Admin > Updates. Updates of the control
 * plane, the web interface and every daemon start on their own at the hourly
 * check, or at once with Update Now (superadmins, release installs); the
 * other controls are the Pause All Updates switch and Check Now, which only
 * looks for new builds.
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

/** "Next Check: <time>", or null when the control plane names none. */
export function nextCheckText(
  nextCheckAt: string | null | undefined,
  format: FormatInstant = formatUpdateTime
): string | null {
  return nextCheckAt ? `Next Check: ${format(nextCheckAt)}` : null
}

/** "Last Checked: <time>", scheduled or Check Now, or null before the first check. */
export function lastCheckedText(
  lastCheckAt: string | null | undefined,
  format: FormatInstant = formatUpdateTime
): string | null {
  return lastCheckAt ? `Last Checked: ${format(lastCheckAt)}` : null
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

/** What Check Now does while paused (the card already says nothing starts). */
export const CHECK_NOW_PAUSED_HELP = 'Check Now only looks for new builds.'

/** What Check Now and Update Now do, where the person can press Update Now. */
export const CHECK_NOW_UPDATE_NOW_HELP =
  'Check Now only looks for new builds. Update Now installs a waiting build right away; otherwise the next scheduled check starts it.'

export function checkNowHelp(paused: boolean, canUpdateNow = false): string {
  if (paused) return CHECK_NOW_PAUSED_HELP
  return canUpdateNow ? CHECK_NOW_UPDATE_NOW_HELP : CHECK_NOW_HELP
}

/** Under a disabled Update Now while updates are paused. */
export const UPDATE_NOW_PAUSED_HINT = 'Turn off Pause All Updates to update now.'

/** Under a disabled Update Now while an update runs. */
export const UPDATE_NOW_RUNNING_HINT = 'An update is in progress.'

/** Under a disabled Update Now when nothing waits to install. */
export const UPDATE_NOW_NOTHING_WAITING =
  'Everything is up to date. Check Now looks for newer builds.'

/**
 * Whether Update Now can be pressed, and the one line that says why not.
 * It needs something waiting to install (`updateWaiting`: a daemon behind, or
 * a control plane or web interface build a run would install), no update in
 * progress and updates not paused. An older control plane without
 * `updateWaiting` keeps the button usable; the press then answers "Already up
 * to date." when nothing is newer.
 */
export function updateNowAvailability(
  updates: Pick<InstanceUpdates, 'updatesPaused' | 'activeRunId' | 'updateWaiting'>
): Readonly<{ enabled: boolean; reason: string | null }> {
  if (updates.activeRunId) return { enabled: false, reason: UPDATE_NOW_RUNNING_HINT }
  if (updates.updatesPaused === true) return { enabled: false, reason: UPDATE_NOW_PAUSED_HINT }
  if (updates.updateWaiting === false) {
    return { enabled: false, reason: UPDATE_NOW_NOTHING_WAITING }
  }
  return { enabled: true, reason: null }
}

/** Update Now found nothing newer to install. */
export const UPDATE_NOW_UP_TO_DATE = 'Already up to date.'

/** Update Now refused because an update is already going. */
export const UPDATE_NOW_RUN_ACTIVE = 'An update is already running.'

/** Update Now could not reach the release server. */
export const UPDATE_NOW_UNREACHABLE =
  'The release server could not be reached. Try again in a few minutes.'

/** Update Now pressed again within a minute: how long to wait. */
export function updateNowTooSoonText(retryAfterSeconds: number | null): string {
  if (retryAfterSeconds == null) return 'Wait a minute before trying again.'
  const seconds = Math.max(1, Math.ceil(retryAfterSeconds))
  return `Wait ${seconds} second${seconds === 1 ? '' : 's'} before trying again.`
}

/** Update Now on a development install, which updates by Build and Push Daemon. */
export const UPDATE_NOW_DEVELOPMENT = 'A development install updates with Build and Push Daemon.'

/** Why Update Now did not start an update, in plain words. */
export function updateNowRefusal(err: unknown): string {
  if (err instanceof UpdateNowRefusedError) {
    switch (err.code) {
      case 'run_active':
        return UPDATE_NOW_RUN_ACTIVE
      case 'paused':
        return UPDATE_NOW_PAUSED_HINT
      case 'development':
        return UPDATE_NOW_DEVELOPMENT
      case 'release_unreachable':
        return UPDATE_NOW_UNREACHABLE
      case 'check_too_soon':
        return updateNowTooSoonText(err.retryAfterSeconds)
      default:
        return err.serverMessage ?? 'The update could not start.'
    }
  }
  return userErrorMessage(err, 'Could not start the update')
}

/**
 * How updates run, for the Status card and the High Availability notice:
 * "Updates install on their own: TurboPanel checks every 5 minutes." Paused:
 * updates are paused and nothing new starts until the pause is turned off.
 */
export function updatesCadenceText(
  updates: Pick<InstanceUpdates, 'updatesPaused' | 'checkIntervalMinutes'>,
  what = 'Updates install on their own'
): string {
  if (updates.updatesPaused === true) {
    return 'Updates are paused. Nothing new starts until Pause All Updates is turned off.'
  }
  return `${what}: TurboPanel checks ${checkCadence(updates.checkIntervalMinutes)}.`
}

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

/** Title of the confirmation shown when Pause All Updates is turned on. */
export const PAUSE_UPDATES_TITLE = 'Pause All Updates?'

/**
 * What the confirmation says before updates are paused, one paragraph each.
 * It follows what the control plane does: no new update starts (scheduled
 * check or Update Now); an update in progress is not cut off, so servers it
 * already started finish (with their retries) and servers it has not reached
 * are skipped; checks for new builds go on; turning the pause off starts
 * nothing by itself.
 */
export const PAUSE_UPDATES_EXPLAINED: readonly string[] = [
  'No new update starts while updates are paused: not at the scheduled check, and not with Update Now.',
  'An update already in progress is not stopped. Servers it has already started updating finish, and are tried again if they fail. Servers it has not reached yet are skipped, and the update ends there.',
  'Check Now still looks for new builds.',
  'Turning this off starts nothing right away. The next scheduled check, or Update Now, updates whatever is still behind, including skipped servers.',
]

/** The note under the Pause All Updates switch: what its state means. */
export function pauseSwitchNote(paused: boolean): string {
  return paused
    ? 'No update starts. Turning this off starts nothing right away; the next check or Update Now does.'
    : 'Updates start on their own.'
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
  'Updates automatically. An administrator can use Pause All Updates in Admin > Updates.'
