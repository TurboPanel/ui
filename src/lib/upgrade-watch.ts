const STORAGE_KEY = 'turbopanel_upgrade_cp_watch'

/**
 * How long a started upgrade may keep the "TurboPanel is updating" overlay up
 * without the run itself saying so. Long enough to cover a control-plane
 * restart; short enough that a stale flag can never pin the overlay.
 */
export const CONTROL_PLANE_UPGRADE_WATCH_TTL_MS = 10 * 60 * 1000

function readExpiry(): number | null {
  if (typeof sessionStorage === 'undefined') return null
  const raw = sessionStorage.getItem(STORAGE_KEY)
  if (raw === null) return null
  const expiresAt = Number(raw)
  return Number.isFinite(expiresAt) ? expiresAt : null
}

/** Remember, for this tab only, that an upgrade was just started. */
export function markControlPlaneUpgradeWatch(now: number = Date.now()): void {
  if (typeof sessionStorage === 'undefined') return
  sessionStorage.setItem(
    STORAGE_KEY,
    String(now + CONTROL_PLANE_UPGRADE_WATCH_TTL_MS),
  )
}

export function clearControlPlaneUpgradeWatch(): void {
  if (typeof sessionStorage === 'undefined') return
  sessionStorage.removeItem(STORAGE_KEY)
}

/**
 * Milliseconds left on the watch, or 0 when there is none. A flag written by
 * an older build (`'1'`, no expiry) or one past its expiry counts as none and
 * is removed.
 */
export function controlPlaneUpgradeWatchRemainingMs(now: number = Date.now()): number {
  const expiresAt = readExpiry()
  if (expiresAt === null || expiresAt <= now) {
    clearControlPlaneUpgradeWatch()
    return 0
  }
  return expiresAt - now
}

export function isControlPlaneUpgradeWatchActive(now: number = Date.now()): boolean {
  return controlPlaneUpgradeWatchRemainingMs(now) > 0
}

/**
 * Whether the updating overlay shows, and whether the watch has done its job.
 *
 * - The run is the authority. While its control-plane step is active the
 *   overlay shows.
 * - The watch only covers the gap when the run cannot be read (the control
 *   plane is restarting). Once the run answers and no control-plane step is
 *   active, the watch is spent and is cleared, so it cannot keep the overlay up.
 */
export function controlPlaneOverlayState(input: Readonly<{
  canReadRun: boolean
  runAnswered: boolean
  controlPlaneStepActive: boolean
  watchActive: boolean
}>): { visible: boolean; clearWatch: boolean } {
  if (input.canReadRun && input.controlPlaneStepActive) {
    return { visible: true, clearWatch: false }
  }
  if (input.canReadRun && input.runAnswered) {
    return { visible: false, clearWatch: input.watchActive }
  }
  return { visible: input.watchActive, clearWatch: false }
}

/** A control-plane step that never answered the command is stuck after this. */
export const CONTROL_PLANE_STEP_ACK_STALE_MS = 5 * 60 * 1000

/** Any other open control-plane step silent this long is stale (the daemon's verify budget is 10 min). */
export const CONTROL_PLANE_STEP_STALE_MS = 20 * 60 * 1000

/**
 * Whether the control-plane step has stopped making progress: the daemon never
 * answered the command, or the step has been silent for a long time. A stale
 * step must not pin the "TurboPanel is updating" overlay; the Updates page
 * shows what the step needs.
 */
export function controlPlaneStepStale(
  steps: ReadonlyArray<{ unit: string; status: string; lastStageAt?: string | null }> | undefined,
  nowMs: number = Date.now()
): boolean {
  const step = steps?.find((item) => item.unit === 'instance')
  if (!step) return false
  if (step.status === 'needs_attention' || step.status === 'failed') return true
  const at = step.lastStageAt ? Date.parse(step.lastStageAt) : Number.NaN
  if (!Number.isFinite(at)) return false
  const limit =
    step.status === 'dispatched' ? CONTROL_PLANE_STEP_ACK_STALE_MS : CONTROL_PLANE_STEP_STALE_MS
  return nowMs - at > limit
}
