import { describe, expect, it, vi } from 'vitest'
import {
  isControlPlaneRestartError,
  RECOVERY_INTERVAL_MS,
  RECOVERY_TIMEOUT_MS,
  waitForControlPlaneRecovery,
} from '@/lib/control-plane-recovery'

/** The shape `apiFetch` throws for an HTTP failure. */
function apiError(detail: string): Error {
  return new Error(`/api/admin/v1/instance/public-urls/apply failed: ${detail}`)
}

describe('isControlPlaneRestartError', () => {
  it('treats a status-only gateway failure as the control plane restarting', () => {
    for (const status of [408, 502, 503, 504, 520, 521, 522, 523, 524, 525, 526, 527]) {
      expect(isControlPlaneRestartError(apiError(`HTTP ${status}`))).toBe(true)
    }
  })

  it('treats a transport-level rejection as the control plane restarting', () => {
    expect(isControlPlaneRestartError(new TypeError('Failed to fetch'))).toBe(true)
    expect(isControlPlaneRestartError(new TypeError('Network request failed'))).toBe(true)
    expect(isControlPlaneRestartError({ name: 'AbortError' })).toBe(true)
  })

  it('does not swallow a failure the control plane actually answered', () => {
    expect(
      isControlPlaneRestartError(apiError('HTTP 503: no co-located daemon connected')),
    ).toBe(false)
    expect(isControlPlaneRestartError(apiError('HTTP 500: timeout waiting for daemon'))).toBe(
      false,
    )
    expect(
      isControlPlaneRestartError(apiError('HTTP 422: cert apply is not applicable on this runtime')),
    ).toBe(false)
    expect(isControlPlaneRestartError(apiError('HTTP 403'))).toBe(false)
    expect(isControlPlaneRestartError(apiError('HTTP 400'))).toBe(false)
  })

  it('ignores a non-error value', () => {
    expect(isControlPlaneRestartError('nope')).toBe(false)
    expect(isControlPlaneRestartError(null)).toBe(false)
  })
})

describe('waitForControlPlaneRecovery', () => {
  const harness = () => {
    const sleep = vi.fn(async (ms: number) => {
      elapsed += ms
    })
    let elapsed = 0
    return { sleep, now: () => elapsed }
  }

  it('waits before the first probe, then reports what came back', async () => {
    const { sleep, now } = harness()
    const probe = vi.fn().mockResolvedValue({ urls: ['https://panel.lan'] })

    await expect(
      waitForControlPlaneRecovery({ probe, sleep, now, intervalMs: 1_000 }),
    ).resolves.toEqual({ kind: 'recovered', value: { urls: ['https://panel.lan'] } })

    expect(sleep).toHaveBeenCalledExactlyOnceWith(1_000)
    expect(probe).toHaveBeenCalledTimes(1)
  })

  it('keeps probing while the control plane is still down', async () => {
    const { sleep, now } = harness()
    const probe = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockRejectedValueOnce(apiError('HTTP 502'))
      .mockResolvedValue({ urls: [] })

    await expect(
      waitForControlPlaneRecovery({ probe, sleep, now, intervalMs: 1_000 }),
    ).resolves.toEqual({ kind: 'recovered', value: { urls: [] } })
    expect(probe).toHaveBeenCalledTimes(3)
  })

  it('gives up once the window closes', async () => {
    const { sleep, now } = harness()
    const probe = vi.fn().mockRejectedValue(apiError('HTTP 502'))

    await expect(
      waitForControlPlaneRecovery({
        probe,
        sleep,
        now,
        intervalMs: 1_000,
        timeoutMs: 3_000,
      }),
    ).resolves.toEqual({ kind: 'unreachable' })
    expect(probe).toHaveBeenCalledTimes(3)
  })

  it('rethrows anything the control plane actually answered', async () => {
    const { sleep, now } = harness()
    const probe = vi.fn().mockRejectedValue(apiError('HTTP 403: forbidden'))

    await expect(
      waitForControlPlaneRecovery({ probe, sleep, now }),
    ).rejects.toThrow('HTTP 403')
    expect(probe).toHaveBeenCalledTimes(1)
  })

  it('defaults to a real timer and a 90 second window', async () => {
    const probe = vi.fn().mockResolvedValue('back')
    vi.useFakeTimers()
    try {
      const pending = waitForControlPlaneRecovery({ probe })
      await vi.advanceTimersByTimeAsync(RECOVERY_INTERVAL_MS)
      await expect(pending).resolves.toEqual({ kind: 'recovered', value: 'back' })
    } finally {
      vi.useRealTimers()
    }
    expect(RECOVERY_TIMEOUT_MS).toBe(90_000)
  })
})
