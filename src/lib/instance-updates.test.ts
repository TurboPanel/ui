import { describe, expect, it } from 'vitest'
import {
  installedIdentity,
  unitUpdateFeedback,
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
        read: () =>
          Promise.reject(
            new Error('updates failed: HTTP 503: no co-located daemon'),
          ),
        target: { version: '0.1.1', commit: null },
        before: '0.1.0:abc',
        sleep: () => Promise.resolve(),
        now: () => 0,
      }),
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
  })
})
