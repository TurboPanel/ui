import { isControlPlaneRestartError } from '@/lib/control-plane-recovery'

/**
 * Pure state for the "reconnecting to the control plane" experience: what the
 * updating overlay says while the control plane is unreachable, how often it
 * retries, and how a network failure reads on the Updates page.
 */

/** After this long unreachable, say the update is taking longer than usual. */
export const RECONNECT_SLOW_AFTER_MS = 3 * 60 * 1000

const RETRY_FIRST_MS = 2_000
const RETRY_MAX_MS = 10_000

export const RECONNECTING_TITLE = 'Reconnecting to the control plane…'
export const RECONNECT_COPY =
  'The panel is restarting to finish an update. This page will reconnect by itself.'
export const RECONNECT_SLOW_COPY =
  'This is taking longer than usual. The update may still be running.'

/** Retry gap for the nth failed attempt (0-based): 2 s, 3 s, 4.5 s ... capped at 10 s. */
export function reconnectRetryDelayMs(attempt: number): number {
  const safe = Number.isFinite(attempt) && attempt > 0 ? Math.floor(attempt) : 0
  return Math.min(Math.round(RETRY_FIRST_MS * 1.5 ** safe), RETRY_MAX_MS)
}

/** `42 s`, `1 min 05 s`. Negative or invalid input reads as `0 s`. */
export function formatReconnectElapsed(ms: number): string {
  const total = Number.isFinite(ms) && ms > 0 ? Math.floor(ms / 1000) : 0
  if (total < 60) return `${total} s`
  const seconds = String(total % 60).padStart(2, '0')
  return `${Math.floor(total / 60)} min ${seconds} s`
}

export type ReconnectView = Readonly<{
  /** `slow` shows the longer-than-usual message and the two buttons. */
  phase: 'reconnecting' | 'slow'
  elapsedLabel: string
}>

/**
 * The view for `elapsedMs` of unreachability. `extendedMs` is extra waiting
 * the person asked for with "Keep waiting": it pushes the slow message back.
 */
export function reconnectView(elapsedMs: number, extendedMs = 0): ReconnectView {
  const slow = elapsedMs - extendedMs >= RECONNECT_SLOW_AFTER_MS
  return { phase: slow ? 'slow' : 'reconnecting', elapsedLabel: formatReconnectElapsed(elapsedMs) }
}

/** Whether a failure is the control plane being unreachable (not a real answer). */
export function isControlPlaneUnreachable(err: unknown): boolean {
  return isControlPlaneRestartError(err)
}
