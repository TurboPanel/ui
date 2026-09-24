// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import {
  clearControlPlaneUpgradeWatch,
  isControlPlaneUpgradeWatchActive,
  markControlPlaneUpgradeWatch,
} from '@/lib/upgrade-watch'

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
})
