import { describe, expect, it, vi } from 'vitest'
import type { InstanceHostnameRecord } from '@/lib/instance-api'
import { judgeIssuance, settleIssuance, takeIssuanceBaseline } from '@/lib/issuance-settle'

function row(overrides: Partial<InstanceHostnameRecord> = {}): InstanceHostnameRecord {
  return {
    id: 'h1',
    host: 'panel.example.com',
    source: 'lets-encrypt',
    uploadedCertId: null,
    status: 'ready',
    notAfter: null,
    acmeLastAttemptAt: null,
    acmeLastError: null,
    ...overrides,
  }
}

const OLD_CERT = '2026-11-01T00:00:00.000Z'
const NEW_CERT = '2027-01-30T00:00:00.000Z'
const oldAttempt = '2026-10-03T10:00:00.000Z'
const newAttempt = '2026-10-04T10:00:00.000Z'

const none = takeIssuanceBaseline([])
const sleep = () => Promise.resolve()

describe('judgeIssuance', () => {
  it('is issued when a name with no earlier certificate now has one', () => {
    expect(judgeIssuance([row({ notAfter: NEW_CERT })], none)).toEqual({
      state: 'issued',
      kept: false,
    })
  })

  it('does not call an old certificate success while it is renewing', () => {
    const baseline = takeIssuanceBaseline([row({ notAfter: OLD_CERT })])
    expect(judgeIssuance([row({ notAfter: OLD_CERT })], baseline)).toMatchObject({
      state: 'pending',
    })
    expect(judgeIssuance([row({ notAfter: NEW_CERT })], baseline)).toEqual({
      state: 'issued',
      kept: false,
    })
  })

  it('lets a still-valid earlier certificate stand once the wait is over', () => {
    const baseline = takeIssuanceBaseline([row({ notAfter: OLD_CERT })])
    const same = [row({ notAfter: OLD_CERT })]
    expect(judgeIssuance(same, baseline, true)).toEqual({
      state: 'issued',
      kept: true,
    })
    expect(judgeIssuance([row()], none, true)).toMatchObject({
      state: 'pending',
    })
  })

  it('accepts a kept certificate once the server records a clean run', () => {
    const baseline = takeIssuanceBaseline([
      row({ notAfter: OLD_CERT, acmeLastAttemptAt: oldAttempt }),
    ])
    expect(
      judgeIssuance([row({ notAfter: OLD_CERT, acmeLastAttemptAt: newAttempt })], baseline)
    ).toEqual({ state: 'issued', kept: false })
  })

  it('treats an error identical to the one before the apply as stale', () => {
    const stale = row({
      notAfter: NEW_CERT,
      acmeLastError: 'rate limited',
      acmeLastAttemptAt: oldAttempt,
    })
    const baseline = takeIssuanceBaseline([stale])
    expect(judgeIssuance([stale], baseline)).toMatchObject({ state: 'pending' })
    expect(judgeIssuance([stale], baseline, true)).toEqual({
      state: 'issued',
      kept: true,
    })
  })

  it('treats an error with a newer attempt time as new, whatever the browser clock says', () => {
    const before = row({
      acmeLastError: 'rate limited',
      acmeLastAttemptAt: oldAttempt,
    })
    const after = { ...before, acmeLastAttemptAt: newAttempt }
    for (const skewMs of [-3_600_000, 0, 3_600_000]) {
      vi.useFakeTimers({ now: Date.now() + skewMs })
      try {
        expect(judgeIssuance([after], takeIssuanceBaseline([before]))).toMatchObject({
          state: 'failed',
        })
        expect(judgeIssuance([before], takeIssuanceBaseline([before]))).toMatchObject({
          state: 'pending',
        })
      } finally {
        vi.useRealTimers()
      }
    }
  })

  it('treats a different error text as new', () => {
    const before = row({ acmeLastError: 'a', acmeLastAttemptAt: oldAttempt })
    expect(
      judgeIssuance([{ ...before, acmeLastError: 'b' }], takeIssuanceBaseline([before]))
    ).toMatchObject({ state: 'failed' })
  })
})

describe('judgeIssuance edge cases', () => {
  it('never accepts an expired certificate, even at the end of the wait', () => {
    const expired = row({
      notAfter: '2026-10-01T00:00:00.000Z',
      acmeLastAttemptAt: oldAttempt,
    })
    const baseline = takeIssuanceBaseline([expired])
    expect(judgeIssuance([expired], baseline, true)).toMatchObject({
      state: 'pending',
    })
  })

  it('fails the whole set when one name is issued and another failed', () => {
    const good = row({ id: 'a', host: 'a.example.com', notAfter: NEW_CERT })
    const bad = row({
      id: 'b',
      host: 'b.example.com',
      acmeLastError: 'dns',
      acmeLastAttemptAt: newAttempt,
    })
    expect(judgeIssuance([good, bad], none)).toMatchObject({
      state: 'failed',
      message: expect.stringContaining('b.example.com'),
    })
  })
})

describe('settleIssuance with an unknown baseline', () => {
  const old = row({ notAfter: OLD_CERT, acmeLastAttemptAt: oldAttempt })

  it('does not take an earlier certificate as proof, even at the deadline', async () => {
    let clock = 0
    const result = await settleIssuance({
      rows: [old],
      baseline: null,
      refetch: () => Promise.resolve([old]),
      timeoutMs: 10,
      intervalMs: 4,
      sleep: () => {
        clock += 4
        return Promise.resolve()
      },
      now: () => clock,
    })
    expect(result.kind).toBe('not-issued')
  })

  it('does not take an existing error as new on the first look', async () => {
    let clock = 0
    const withError = row({
      acmeLastError: 'old',
      acmeLastAttemptAt: oldAttempt,
    })
    const result = await settleIssuance({
      rows: [withError],
      baseline: null,
      refetch: () => Promise.resolve([withError]),
      timeoutMs: 10,
      intervalMs: 4,
      sleep: () => {
        clock += 4
        return Promise.resolve()
      },
      now: () => clock,
    })
    expect(result).toMatchObject({
      kind: 'not-issued',
      error: expect.stringContaining('has not confirmed a new certificate'),
    })
  })

  it('accepts a certificate that changes on a later read', async () => {
    const refetch = vi
      .fn()
      .mockResolvedValueOnce([row({ notAfter: NEW_CERT, acmeLastAttemptAt: newAttempt })])
    const result = await settleIssuance({
      rows: [old],
      baseline: null,
      refetch,
      sleep,
    })
    expect(result).toMatchObject({ kind: 'issued', kept: false })
  })
})

describe('settleIssuance', () => {
  it('says so when an earlier certificate was kept at the end of the wait', async () => {
    let clock = 0
    const old = row({ notAfter: OLD_CERT, acmeLastAttemptAt: oldAttempt })
    const result = await settleIssuance({
      rows: [old],
      baseline: takeIssuanceBaseline([old]),
      refetch: () => Promise.resolve([old]),
      timeoutMs: 10,
      intervalMs: 4,
      sleep: () => {
        clock += 4
        return Promise.resolve()
      },
      now: () => clock,
    })
    expect(result).toMatchObject({ kind: 'issued', kept: true })
  })

  it('waits for a slow issuance and then reports it issued', async () => {
    const refetch = vi.fn().mockResolvedValueOnce([row({ notAfter: NEW_CERT })])
    const result = await settleIssuance({
      rows: [row()],
      baseline: none,
      refetch,
      sleep,
    })
    expect(result.kind).toBe('issued')
    expect(refetch).toHaveBeenCalledTimes(1)
  })

  it('reports a new error without waiting', async () => {
    const refetch = vi.fn()
    const result = await settleIssuance({
      rows: [row({ acmeLastError: 'rate limited', acmeLastAttemptAt: newAttempt })],
      baseline: none,
      refetch,
      sleep,
    })
    expect(result).toMatchObject({
      kind: 'not-issued',
      error: expect.stringContaining('rate limited'),
    })
    expect(refetch).not.toHaveBeenCalled()
  })

  it('gives up in plain words when nothing new shows up in time', async () => {
    let clock = 0
    const result = await settleIssuance({
      rows: [row()],
      baseline: none,
      refetch: () => Promise.resolve([row()]),
      timeoutMs: 10,
      intervalMs: 4,
      sleep: () => {
        clock += 4
        return Promise.resolve()
      },
      now: () => clock,
    })
    expect(result).toMatchObject({
      kind: 'not-issued',
      error: expect.stringContaining('has not confirmed a new certificate'),
    })
  })

  it('keeps waiting through a dropped connection', async () => {
    const refetch = vi
      .fn()
      .mockRejectedValueOnce(new Error('/x failed: HTTP 502'))
      .mockResolvedValueOnce([row({ notAfter: NEW_CERT })])
    const result = await settleIssuance({
      rows: [row()],
      baseline: none,
      refetch,
      sleep,
    })
    expect(result.kind).toBe('issued')
  })

  it('stops at the deadline even when a read hangs', async () => {
    vi.useFakeTimers()
    try {
      const pending = settleIssuance({
        rows: [row()],
        baseline: none,
        refetch: () => new Promise(() => {}),
        timeoutMs: 20_000,
        intervalMs: 1_000,
      })
      await vi.advanceTimersByTimeAsync(25_000)
      await expect(pending).resolves.toMatchObject({ kind: 'not-issued' })
    } finally {
      vi.useRealTimers()
    }
  })

  it('stops when the caller goes away, without reading again', async () => {
    const controller = new AbortController()
    const refetch = vi.fn(() => new Promise<InstanceHostnameRecord[]>(() => {}))
    vi.useFakeTimers()
    try {
      const pending = settleIssuance({
        rows: [row()],
        baseline: none,
        refetch,
        signal: controller.signal,
        intervalMs: 1_000,
      })
      await vi.advanceTimersByTimeAsync(1_500)
      expect(refetch).toHaveBeenCalledTimes(1)
      controller.abort()
      await expect(pending).resolves.toMatchObject({ kind: 'not-issued' })
      await vi.advanceTimersByTimeAsync(30_000)
      expect(refetch).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })
})
