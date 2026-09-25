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
