// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import {
  clearControlPlaneUpgradeWatch,
  CONTROL_PLANE_UPGRADE_WATCH_TTL_MS,
  controlPlaneOverlayState,
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
