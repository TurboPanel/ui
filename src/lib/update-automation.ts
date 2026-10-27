import { formatLocalDateTime } from '@/lib/format-datetime'
import type { InstanceUpdates, UpdatesPausedBy } from '@/lib/instance-api'
import { joinWithAnd } from '@/lib/upgrade-display'

/**
 * Words for automatic updates on Admin > Updates. Updates of the control
 * plane, the web interface and every daemon start on their own at the hourly
 * check; the only control is Pause all updates / Resume.
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
  'Updates automatically. An instance administrator can pause all updates in Admin > Updates.'
