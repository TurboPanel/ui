import { describe, expect, it, vi } from 'vitest'
import type { InstanceUpdates } from '@/lib/instance-api'
import {
  consoleUpdateAvailable,
  installedIdentity,
  platformUpdateAvailable,
  selfHostedUpdateAvailable,
  unitUpdateAvailable,
  unitUpdateFeedback,
  updatePieceLabel,
  updatePieces,
  waitForUnitUpdate,
} from '@/lib/instance-updates'

describe('waitForUnitUpdate', () => {
  it('returns applied when the installed version matches the target', async () => {
    let calls = 0
    const result = await waitForUnitUpdate({
      read: () => {
        calls += 1
        const version = calls < 2 ? '0.1.0' : '0.1.1'
        return Promise.resolve({ version, commit: 'abc' })
      },
      target: { version: '0.1.1', commit: null },
      before: installedIdentity({ version: '0.1.0', commit: 'abc' }),
      timeoutMs: 10_000,
      intervalMs: 1,
      sleep: () => Promise.resolve(),
      now: () => 0,
    })
    expect(result).toEqual({ kind: 'applied' })
  })

  it('returns reconnected when the control plane answers and the version does not move', async () => {
    let clock = 0
    const result = await waitForUnitUpdate({
      read: () => Promise.resolve({ version: '0.1.0', commit: 'abc' }),
      target: { version: '0.1.1', commit: null },
      before: '0.1.0:abc',
      timeoutMs: 5,
      intervalMs: 1,
      sleep: () => {
        clock += 3
        return Promise.resolve()
      },
      now: () => clock,
    })
    expect(result).toEqual({ kind: 'reconnected' })
  })

  it('waits through a restart-shaped error and then reads the new version', async () => {
    let calls = 0
    const result = await waitForUnitUpdate({
      read: () => {
        calls += 1
        if (calls === 1) return Promise.reject(new Error('updates failed: HTTP 502'))
        return Promise.resolve({ version: '0.1.1', commit: 'def' })
      },
      target: { version: '0.1.1', commit: null },
      before: '0.1.0:abc',
      timeoutMs: 10_000,
      intervalMs: 1,
      sleep: () => Promise.resolve(),
      now: () => 0,
    })
    expect(result).toEqual({ kind: 'applied' })
  })

  it('rethrows a JSON-bodied failure', async () => {
    await expect(
      waitForUnitUpdate({
        read: () => Promise.reject(new Error('updates failed: HTTP 503: no co-located daemon')),
        target: { version: '0.1.1', commit: null },
        before: '0.1.0:abc',
        sleep: () => Promise.resolve(),
        now: () => 0,
      })
    ).rejects.toThrow('HTTP 503: no co-located daemon')
  })
})

describe('canary target identity', () => {
  it('stays unapplied when the version matches and the commit does not', async () => {
    let clock = 0
    const result = await waitForUnitUpdate({
      read: () => Promise.resolve({ version: '0.1.1', commit: 'aaa' }),
      target: { version: '0.1.1', commit: 'bbb', buildId: 'build-bbb' },
      before: '0.1.1:aaa',
      timeoutMs: 5,
      intervalMs: 1,
      sleep: () => {
        clock += 3
        return Promise.resolve()
      },
      now: () => clock,
    })
    expect(result).toEqual({ kind: 'reconnected' })
  })

  it('applies when the canary commit matches', async () => {
    const result = await waitForUnitUpdate({
      read: () => Promise.resolve({ version: '0.1.1', commit: 'bbb' }),
      target: { version: '0.1.1', commit: 'bbb' },
      before: '0.1.1:aaa',
      timeoutMs: 10_000,
      intervalMs: 1,
      sleep: () => Promise.resolve(),
      now: () => 0,
    })
    expect(result).toEqual({ kind: 'applied' })
  })

  it('falls back to version only when the manifest has no commit or build id', async () => {
    const result = await waitForUnitUpdate({
      read: () => Promise.resolve({ version: '0.1.1', commit: 'still-old' }),
      target: { version: '0.1.1', commit: null, buildId: null },
      before: '0.1.0:still-old',
      timeoutMs: 10_000,
      intervalMs: 1,
      sleep: () => Promise.resolve(),
      now: () => 0,
    })
    expect(result).toEqual({ kind: 'applied' })
  })

  it('uses the build id when the manifest commit is absent', async () => {
    let clock = 0
    const pending = await waitForUnitUpdate({
      read: () => Promise.resolve({ version: '0.1.1', commit: 'old-build' }),
      target: { version: '0.1.1', commit: 'unknown', buildId: 'build-new' },
      before: '0.1.1:old-build',
      timeoutMs: 5,
      intervalMs: 1,
      sleep: () => {
        clock += 3
        return Promise.resolve()
      },
      now: () => clock,
    })
    expect(pending).toEqual({ kind: 'reconnected' })

    const applied = await waitForUnitUpdate({
      read: () => Promise.resolve({ version: '0.1.1', commit: 'build-new' }),
      target: { version: '0.1.1', commit: null, buildId: 'build-new' },
      before: '0.1.1:old-build',
      timeoutMs: 10_000,
      intervalMs: 1,
      sleep: () => Promise.resolve(),
      now: () => 0,
    })
    expect(applied).toEqual({ kind: 'applied' })
  })
})

describe('unitUpdateFeedback', () => {
  it('names the unit and the outcome', () => {
    expect(unitUpdateFeedback('instance', 'applied')).toBe('Control plane updated.')
    expect(unitUpdateFeedback('daemon', 'reconnected')).toContain('Daemon')
    expect(unitUpdateFeedback('instance', 'unreachable')).toContain('Lost contact')
    expect(unitUpdateFeedback('daemon', 'unreachable')).toBe(
      'Lost contact while the daemon updated.'
    )
  })
})

describe('waitForUnitUpdate edges', () => {
  it('is unreachable when the deadline has already passed', async () => {
    const result = await waitForUnitUpdate({
      read: () => Promise.reject(new Error('not called')),
      target: { version: '0.1.1', commit: null },
      before: '0.1.0:',
      timeoutMs: 0,
      now: () => 1_000,
    })
    expect(result).toEqual({ kind: 'unreachable' })
  })

  it('treats a blank target as applied once the installed identity changes', async () => {
    const result = await waitForUnitUpdate({
      read: () => Promise.resolve({ version: '0.1.1', commit: 'abc' }),
      target: { version: 'unknown', commit: '  ', buildId: '' },
      before: '0.1.0:abc',
      timeoutMs: 1_000,
      intervalMs: 1,
      sleep: () => Promise.resolve(),
      now: () => 0,
    })
    expect(result).toEqual({ kind: 'applied' })
  })

  it('sleeps on the default timer until the version lands', async () => {
    vi.useFakeTimers()
    try {
      let calls = 0
      const pending = waitForUnitUpdate({
        read: () => {
          calls += 1
          return Promise.resolve({
            version: calls < 2 ? '0.1.0' : '0.1.1',
            commit: 'abc',
          })
        },
        target: { version: '0.1.1', commit: null },
        before: '0.1.0:abc',
        timeoutMs: 50,
        intervalMs: 10,
      })
      await vi.advanceTimersByTimeAsync(20)
      await expect(pending).resolves.toEqual({ kind: 'applied' })
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('waitForUnitUpdate polling', () => {
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

  it('reads first, sleeps the interval between reads, and never after the landing read', async () => {
    const { sleep, sleeps, now } = clockHarness()
    const read = vi
      .fn()
      .mockResolvedValueOnce({ version: '0.1.0', commit: 'abc' })
      .mockResolvedValueOnce({ version: '0.1.0', commit: 'abc' })
      .mockResolvedValue({ version: '0.1.1', commit: 'abc' })
    const result = await waitForUnitUpdate({
      read,
      target: { version: '0.1.1', commit: null },
      before: '0.1.0:abc',
      timeoutMs: 10_000,
      intervalMs: 100,
      sleep,
      now,
    })
    expect(result).toEqual({ kind: 'applied' })
    expect(read).toHaveBeenCalledTimes(3)
    expect(sleeps).toEqual([100, 100])
  })

  it('clamps the last sleep to the time left and reports reconnected', async () => {
    const { sleep, sleeps, now } = clockHarness()
    const read = vi.fn().mockResolvedValue({ version: '0.1.0', commit: 'abc' })
    const result = await waitForUnitUpdate({
      read,
      target: { version: '0.1.1', commit: null },
      before: '0.1.0:abc',
      timeoutMs: 250,
      intervalMs: 100,
      sleep,
      now,
    })
    expect(result).toEqual({ kind: 'reconnected' })
    expect(sleeps).toEqual([100, 100, 50])
    expect(read).toHaveBeenCalledTimes(3)
  })

  it('hands a restart-shaped read to recovery and keeps polling if the old build answers', async () => {
    const { sleep, sleeps, now } = clockHarness()
    const read = vi
      .fn()
      .mockRejectedValueOnce(new Error('updates failed: HTTP 502'))
      .mockResolvedValueOnce({ version: '0.1.0', commit: 'abc' })
      .mockResolvedValue({ version: '0.1.1', commit: 'abc' })
    const result = await waitForUnitUpdate({
      read,
      target: { version: '0.1.1', commit: null },
      before: '0.1.0:abc',
      timeoutMs: 10_000,
      intervalMs: 100,
      sleep,
      now,
    })
    expect(result).toEqual({ kind: 'applied' })
    // Recovery's leading sleep, then the poll pause before the next read.
    expect(sleeps).toEqual([100, 100])
    expect(read).toHaveBeenCalledTimes(3)
  })

  it('is unreachable when recovery gives up', async () => {
    const { sleep, now } = clockHarness()
    const read = vi.fn().mockRejectedValue(new Error('updates failed: HTTP 502'))
    const result = await waitForUnitUpdate({
      read,
      target: { version: '0.1.1', commit: null },
      before: '0.1.0:abc',
      timeoutMs: 300,
      intervalMs: 100,
      sleep,
      now,
    })
    expect(result).toEqual({ kind: 'unreachable' })
  })

  it('is unreachable, not reconnected, when the control plane drops after answering', async () => {
    const { sleep, now } = clockHarness()
    const read = vi
      .fn()
      .mockResolvedValueOnce({ version: '0.1.0', commit: 'abc' })
      .mockRejectedValue(new TypeError('Failed to fetch'))
    const result = await waitForUnitUpdate({
      read,
      target: { version: '0.1.1', commit: null },
      before: '0.1.0:abc',
      timeoutMs: 300,
      intervalMs: 100,
      sleep,
      now,
    })
    expect(result).toEqual({ kind: 'unreachable' })
  })

  it('rethrows an answered failure on a later read', async () => {
    const { sleep, now } = clockHarness()
    const read = vi
      .fn()
      .mockResolvedValueOnce({ version: '0.1.0', commit: 'abc' })
      .mockRejectedValue(new Error('updates failed: HTTP 403: forbidden'))
    await expect(
      waitForUnitUpdate({
        read,
        target: { version: '0.1.1', commit: null },
        before: '0.1.0:abc',
        intervalMs: 100,
        sleep,
        now,
      })
    ).rejects.toThrow('HTTP 403')
    expect(read).toHaveBeenCalledTimes(2)
  })

  it('propagates a failing sleep', async () => {
    await expect(
      waitForUnitUpdate({
        read: () => Promise.resolve({ version: '0.1.0', commit: 'abc' }),
        target: { version: '0.1.1', commit: null },
        before: '0.1.0:abc',
        sleep: () => Promise.reject(new Error('sleep broke')),
        now: () => 0,
      })
    ).rejects.toThrow('sleep broke')
  })

  it('survives a long wait without growing the stack', async () => {
    let reads = 0
    const result = await waitForUnitUpdate({
      read: () => {
        reads += 1
        return Promise.resolve({ version: reads < 5_000 ? '0.1.0' : '0.1.1', commit: 'abc' })
      },
      target: { version: '0.1.1', commit: null },
      before: '0.1.0:abc',
      timeoutMs: 1_000_000,
      sleep: () => Promise.resolve(),
      now: () => 0,
    })
    expect(result).toEqual({ kind: 'applied' })
    expect(reads).toBe(5_000)
  })
})

describe('unitUpdateAvailable', () => {
  const installed = { version: '0.1.1', commit: 'aaa' }

  it("renders the server's answer, whatever the identities look like", () => {
    expect(
      unitUpdateAvailable({ installed, target: { commit: 'bbb' }, updateAvailable: false })
    ).toBe(false)
    expect(
      unitUpdateAvailable({ installed, target: { commit: 'aaa' }, updateAvailable: true })
    ).toBe(true)
  })

  it('reads an older control plane by commit only, as the server does', () => {
    // The 2 s loop: the old check compared version:commit, so a target that
    // named the same commit under a different version label read as "behind".
    expect(unitUpdateAvailable({ installed, target: { commit: 'aaa' } })).toBe(false)
    expect(unitUpdateAvailable({ installed, target: { commit: 'bbb' } })).toBe(true)
    expect(unitUpdateAvailable({ installed, target: null })).toBe(false)
    expect(unitUpdateAvailable({ installed: null, target: { commit: 'bbb' } })).toBe(false)
  })

  it('is true for the platform when either unit has an update', () => {
    const none = { installed, target: null }
    expect(platformUpdateAvailable({ instance: none, daemon: none })).toBe(false)
    expect(
      platformUpdateAvailable({ instance: none, daemon: { ...none, updateAvailable: true } })
    ).toBe(true)
  })
})

describe('consoleUpdateAvailable', () => {
  it('compares commits by prefix and is unknown without both', () => {
    const consoleBuild = { version: '0.1.4', commit: 'abc1234' }
    expect(consoleUpdateAvailable(consoleBuild, { commit: 'abc1234def' })).toBe(false)
    expect(consoleUpdateAvailable(consoleBuild, { commit: 'fff9999' })).toBe(true)
    expect(consoleUpdateAvailable(consoleBuild, { commit: 'unknown' })).toBeNull()
    expect(consoleUpdateAvailable(consoleBuild, null)).toBeNull()
    expect(consoleUpdateAvailable(null, { commit: 'fff9999' })).toBeNull()
  })
})

describe('selfHostedUpdateAvailable', () => {
  const current = { installed: { version: '0.1.4', commit: 'same' }, target: { commit: 'same' } }
  const units = {
    instance: { ...current, updateAvailable: false, uiTarget: { commit: 'fff9999' } },
    daemon: { ...current, updateAvailable: false },
  } as unknown as InstanceUpdates['units']

  it('counts a UI-only change, because the UI ships inside the control-plane install', () => {
    expect(platformUpdateAvailable(units)).toBe(false)
    expect(selfHostedUpdateAvailable(units, { version: '0.1.4', commit: 'abc1234' })).toBe(true)
  })

  it('is off when the console already runs the UI target or its build is unknown', () => {
    expect(selfHostedUpdateAvailable(units, { version: '0.1.4', commit: 'fff99999' })).toBe(false)
    expect(selfHostedUpdateAvailable(units, null)).toBe(false)
  })

  it('still follows the control plane and daemon', () => {
    const behind = {
      ...units,
      instance: { ...units.instance, updateAvailable: true },
    } as unknown as InstanceUpdates['units']
    expect(selfHostedUpdateAvailable(behind, null)).toBe(true)
  })
})

describe('updatePieces', () => {
  function target(version: string, commit: string) {
    return { commit, buildId: 'b', builtAt: '', channel: 'canary', manifestUrl: '', version }
  }

  function units(): InstanceUpdates['units'] {
    return {
      instance: {
        installed: { version: '0.1.4', commit: 'old' },
        target: target('0.1.5-canary.1', 'cp1'),
        uiTarget: target('0.1.5-canary.2', 'ui2'),
        updateAvailable: true,
      },
      daemon: {
        installed: { version: '0.1.5', commit: 'old' },
        target: target('0.1.6-canary.3', 'dm3'),
        serverId: 'server-1',
        connected: true,
        updateAvailable: true,
      },
    }
  }

  const oldConsole = { version: '0.1.4', commit: 'ui0' }

  it('lists control plane, web app and daemon in that order, each with its own version', () => {
    expect(updatePieces(units(), oldConsole).map(updatePieceLabel)).toEqual([
      'control plane v0.1.5-canary.1',
      'web app v0.1.5-canary.2',
      'daemon v0.1.6-canary.3',
    ])
  })

  it('leaves out pieces that are current, unknown, disconnected or have nothing to name', () => {
    const data = units()
    data.instance.updateAvailable = false
    data.daemon.connected = false
    expect(updatePieces(data, null)).toEqual([])
    const noTarget = units()
    noTarget.instance.target = null
    noTarget.instance.uiTarget = null
    expect(updatePieces(noTarget, oldConsole).map((piece) => piece.name)).toEqual(['daemon'])
  })
})
