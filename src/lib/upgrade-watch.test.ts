// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import {
  clearControlPlaneUpgradeWatch,
  CONTROL_PLANE_UPGRADE_WATCH_TTL_MS,
  controlPlaneOverlayState,
  controlPlaneStepStale,
  controlPlaneUpgradeWatchRemainingMs,
  isControlPlaneUpgradeWatchActive,
  markControlPlaneUpgradeWatch,
} from '@/lib/upgrade-watch'

const STORAGE_KEY = 'turbopanel_upgrade_cp_watch'

describe('control plane upgrade watch', () => {
  afterEach(() => {
    sessionStorage.clear()
  })

  it('marks, reads, and clears the session flag', () => {
    expect(isControlPlaneUpgradeWatchActive()).toBe(false)
    markControlPlaneUpgradeWatch()
    expect(isControlPlaneUpgradeWatchActive()).toBe(true)
    clearControlPlaneUpgradeWatch()
    expect(isControlPlaneUpgradeWatchActive()).toBe(false)
  })

  it('lapses on its own after the TTL and removes itself', () => {
    const start = 1_000_000
    markControlPlaneUpgradeWatch(start)
    expect(controlPlaneUpgradeWatchRemainingMs(start + 1)).toBe(
      CONTROL_PLANE_UPGRADE_WATCH_TTL_MS - 1,
    )
    expect(isControlPlaneUpgradeWatchActive(start + CONTROL_PLANE_UPGRADE_WATCH_TTL_MS)).toBe(false)
    expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull()
  })

  it('treats a flag from an older build, which had no expiry, as spent', () => {
    sessionStorage.setItem(STORAGE_KEY, '1')
    expect(isControlPlaneUpgradeWatchActive(Date.now())).toBe(false)
    expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull()
  })
})

describe('controlPlaneOverlayState', () => {
  const base = {
    canReadRun: true,
    runAnswered: true,
    controlPlaneStepActive: false,
    watchActive: false,
  }

  it('shows while the run reports an active control-plane step', () => {
    expect(controlPlaneOverlayState({ ...base, controlPlaneStepActive: true })).toEqual({
      visible: true,
      clearWatch: false,
    })
  })

  it('hides and spends the watch once the run answers with no control-plane step', () => {
    // The stuck-overlay bug: the watch kept the overlay visible, and the old
    // code only cleared the watch once the overlay was already hidden.
    expect(controlPlaneOverlayState({ ...base, watchActive: true })).toEqual({
      visible: false,
      clearWatch: true,
    })
  })

  it('lets the watch cover the restart gap while the run cannot be read', () => {
    expect(
      controlPlaneOverlayState({ ...base, runAnswered: false, watchActive: true }),
    ).toEqual({ visible: true, clearWatch: false })
    expect(
      controlPlaneOverlayState({ ...base, canReadRun: false, watchActive: true }),
    ).toEqual({ visible: true, clearWatch: false })
  })

  it('shows nothing when there is no run and no watch', () => {
    expect(controlPlaneOverlayState({ ...base, runAnswered: false })).toEqual({
      visible: false,
      clearWatch: false,
    })
  })
})

describe('controlPlaneStepStale', () => {
  const now = Date.parse('2026-10-01T12:00:00.000Z')
  const ago = (minutes: number) => new Date(now - minutes * 60_000).toISOString()

  it('is stale when the daemon never answered the command for 5 minutes', () => {
    const step = (minutes: number) => [
      { unit: 'instance', status: 'dispatched', lastStageAt: ago(minutes) },
    ]
    expect(controlPlaneStepStale(step(4), now)).toBe(false)
    expect(controlPlaneStepStale(step(6), now)).toBe(true)
  })

  it('keeps a verifying step on screen through a slow restart', () => {
    const step = (minutes: number) => [
      { unit: 'instance', status: 'verifying', lastStageAt: ago(minutes) },
    ]
    expect(controlPlaneStepStale(step(12), now)).toBe(false)
    expect(controlPlaneStepStale(step(25), now)).toBe(true)
  })

  it('is stale once the step needs attention and ignores daemon steps', () => {
    expect(controlPlaneStepStale([{ unit: 'instance', status: 'needs_attention' }], now)).toBe(true)
    expect(controlPlaneStepStale([{ unit: 'daemon', status: 'dispatched', lastStageAt: ago(30) }], now)).toBe(false)
    expect(controlPlaneStepStale(undefined, now)).toBe(false)
  })
})
