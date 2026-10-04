import { describe, expect, it, vi } from 'vitest'
import type { InstanceHostnameRecord } from '@/lib/instance-api'
import { judgeIssuance, settleIssuance } from '@/lib/issuance-settle'

const START = Date.parse('2026-10-04T10:00:00.000Z')

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

const issuedRow = row({ notAfter: '2027-01-01T00:00:00.000Z' })
const freshError = row({
  acmeLastError: 'rate limited',
  acmeLastAttemptAt: '2026-10-04T10:00:30.000Z',
})
const staleError = row({
  acmeLastError: 'rate limited',
  acmeLastAttemptAt: '2026-10-03T10:00:00.000Z',
})

describe('judgeIssuance', () => {
  it("is issued when every Let's Encrypt name has a certificate", () => {
    expect(judgeIssuance([issuedRow, row({ source: 'platform-ca' })], START)).toEqual({
      state: 'issued',
    })
  })

  it('fails on an error from after the apply started, even with an old certificate', () => {
    const verdict = judgeIssuance([{ ...freshError, notAfter: '2027-01-01T00:00:00.000Z' }], START)
    expect(verdict).toMatchObject({ state: 'failed' })
    expect(verdict).toMatchObject({ message: expect.stringContaining('rate limited') })
  })

  it('ignores an error from an earlier attempt', () => {
    expect(judgeIssuance([{ ...staleError, notAfter: '2027-01-01T00:00:00.000Z' }], START)).toEqual(
      { state: 'issued' }
    )
    expect(judgeIssuance([staleError], START)).toMatchObject({ state: 'pending' })
  })
})

describe('settleIssuance', () => {
  const sleep = vi.fn(() => Promise.resolve())

  it('answers at once when there is nothing to wait for', async () => {
    const refetch = vi.fn()
    const result = await settleIssuance({ rows: [issuedRow], startedAt: START, refetch, sleep })
    expect(result.kind).toBe('issued')
    expect(refetch).not.toHaveBeenCalled()
  })

  it('waits for a slow issuance and then reports it issued', async () => {
    const refetch = vi.fn().mockResolvedValueOnce([row()]).mockResolvedValueOnce([issuedRow])
    const result = await settleIssuance({ rows: [row()], startedAt: START, refetch, sleep })
    expect(result.kind).toBe('issued')
    expect(refetch).toHaveBeenCalledTimes(2)
  })

  it('reports a fresh error without waiting', async () => {
    const refetch = vi.fn()
    const result = await settleIssuance({ rows: [freshError], startedAt: START, refetch, sleep })
    expect(result).toMatchObject({
      kind: 'not-issued',
      error: expect.stringContaining('rate limited'),
    })
    expect(refetch).not.toHaveBeenCalled()
  })

  it('gives up with a plain message when no certificate shows up in time', async () => {
    let clock = 0
    const result = await settleIssuance({
      rows: [row()],
      startedAt: START,
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
      error: expect.stringContaining('has not confirmed a certificate'),
    })
  })

  it('keeps waiting through a dropped connection', async () => {
    const refetch = vi
      .fn()
      .mockRejectedValueOnce(new Error('/x failed: HTTP 502'))
      .mockResolvedValueOnce([issuedRow])
    const result = await settleIssuance({ rows: [row()], startedAt: START, refetch, sleep })
    expect(result.kind).toBe('issued')
  })
})
