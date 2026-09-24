import { describe, expect, it, vi } from 'vitest'
import { isUpgradeRunActive, waitForUpgradeRunSettlement } from '@/lib/upgrade-run-poll'

describe('isUpgradeRunActive', () => {
  it('is true for pending and running', () => {
    expect(isUpgradeRunActive('pending')).toBe(true)
    expect(isUpgradeRunActive('running')).toBe(true)
    expect(isUpgradeRunActive('succeeded')).toBe(false)
  })
})

describe('waitForUpgradeRunSettlement', () => {
  it('completes when the same run reports a terminal status', async () => {
    const outcome = await waitForUpgradeRunSettlement({
      readRun: async () => ({ status: 'succeeded' as const }),
      intervalMs: 1,
      sleep: () => Promise.resolve(),
      now: () => 0,
      timeoutMs: 5_000,
    })
    expect(outcome).toEqual({ kind: 'completed', status: 'succeeded' })
  })

  it('does not treat a vanished run as success', async () => {
    let calls = 0
    const outcome = await waitForUpgradeRunSettlement({
      readRun: async () => {
        calls += 1
        if (calls < 2) return { status: 'running' as const }
        return null
      },
      intervalMs: 1,
      sleep: () => Promise.resolve(),
      now: () => 0,
      timeoutMs: 5_000,
    })
    expect(outcome).toEqual({ kind: 'missing' })
  })

  it('keeps a failed run that disappears from the active read distinct from success', async () => {
    let calls = 0
    const outcome = await waitForUpgradeRunSettlement({
      readRun: async () => {
        calls += 1
        if (calls === 1) return { status: 'running' as const }
        return null
      },
      intervalMs: 1,
      sleep: () => Promise.resolve(),
      now: () => 0,
      timeoutMs: 5_000,
    })
    expect(outcome).toEqual({ kind: 'missing' })
  })

  it('reports failed, partially failed, and cancelled without calling them success', async () => {
    for (const status of ['failed', 'partially_failed', 'cancelled'] as const) {
      const outcome = await waitForUpgradeRunSettlement({
        readRun: async () => ({ status }),
        intervalMs: 1,
        sleep: () => Promise.resolve(),
        now: () => 0,
        timeoutMs: 5_000,
      })
      expect(outcome).toEqual({ kind: 'completed', status })
    }
  })
})
