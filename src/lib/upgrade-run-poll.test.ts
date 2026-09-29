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

  const clockHarness = () => {
    let elapsed = 0
    const sleeps: number[] = []
    const sleep = vi.fn((ms: number) => {
      sleeps.push(ms)
      elapsed += ms
      return Promise.resolve()
    })
    return { sleep, sleeps, now: () => elapsed }
  }

  it('reads first, then sleeps the interval between reads', async () => {
    const { sleep, sleeps, now } = clockHarness()
    const readRun = vi
      .fn()
      .mockResolvedValueOnce({ status: 'pending' })
      .mockResolvedValueOnce({ status: 'running' })
      .mockResolvedValue({ status: 'succeeded' })
    const outcome = await waitForUpgradeRunSettlement({
      readRun,
      intervalMs: 100,
      timeoutMs: 5_000,
      sleep,
      now,
    })
    expect(outcome).toEqual({ kind: 'completed', status: 'succeeded' })
    expect(readRun).toHaveBeenCalledTimes(3)
    expect(sleeps).toEqual([100, 100])
  })

  it('gives up with unreachable at the deadline, clamping the last sleep', async () => {
    const { sleep, sleeps, now } = clockHarness()
    const readRun = vi.fn().mockResolvedValue({ status: 'running' })
    const outcome = await waitForUpgradeRunSettlement({
      readRun,
      intervalMs: 100,
      timeoutMs: 250,
      sleep,
      now,
    })
    expect(outcome).toEqual({ kind: 'unreachable' })
    expect(sleeps).toEqual([100, 100, 50])
    expect(readRun).toHaveBeenCalledTimes(3)
  })

  it('does not read at all when the deadline has already passed', async () => {
    const readRun = vi.fn()
    const outcome = await waitForUpgradeRunSettlement({
      readRun,
      timeoutMs: 0,
      sleep: () => Promise.resolve(),
      now: () => 10,
    })
    expect(outcome).toEqual({ kind: 'unreachable' })
    expect(readRun).not.toHaveBeenCalled()
  })

  it('keeps polling through restart-shaped errors', async () => {
    const { sleep, sleeps, now } = clockHarness()
    const readRun = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockRejectedValueOnce(new Error('/api/x failed: HTTP 502'))
      .mockResolvedValue({ status: 'failed' })
    const outcome = await waitForUpgradeRunSettlement({
      readRun,
      intervalMs: 100,
      timeoutMs: 5_000,
      sleep,
      now,
    })
    expect(outcome).toEqual({ kind: 'completed', status: 'failed' })
    expect(readRun).toHaveBeenCalledTimes(3)
    expect(sleeps).toEqual([100, 100])
  })

  it('rethrows an error the control plane actually answered, without sleeping', async () => {
    const { sleep, now } = clockHarness()
    const readRun = vi
      .fn()
      .mockResolvedValueOnce({ status: 'running' })
      .mockRejectedValue(new Error('/api/x failed: HTTP 403: forbidden'))
    await expect(
      waitForUpgradeRunSettlement({ readRun, intervalMs: 100, sleep, now }),
    ).rejects.toThrow('HTTP 403')
    expect(readRun).toHaveBeenCalledTimes(2)
    expect(sleep).toHaveBeenCalledTimes(1)
  })

  it('propagates a failing sleep', async () => {
    const readRun = vi.fn().mockResolvedValue({ status: 'running' })
    await expect(
      waitForUpgradeRunSettlement({
        readRun,
        sleep: () => Promise.reject(new Error('sleep broke')),
        now: () => 0,
      }),
    ).rejects.toThrow('sleep broke')
    expect(readRun).toHaveBeenCalledTimes(1)
  })

  it('survives a long wait without growing the stack', async () => {
    let reads = 0
    const outcome = await waitForUpgradeRunSettlement({
      readRun: () => {
        reads += 1
        return Promise.resolve({ status: reads < 5_000 ? ('running' as const) : ('succeeded' as const) })
      },
      timeoutMs: 1_000_000,
      sleep: () => Promise.resolve(),
      now: () => 0,
    })
    expect(outcome).toEqual({ kind: 'completed', status: 'succeeded' })
    expect(reads).toBe(5_000)
  })
})
