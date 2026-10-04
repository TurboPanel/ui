// @vitest-environment happy-dom
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RECONNECT_SLOW_AFTER_MS } from '@/lib/control-plane-reconnect'
import { useControlPlaneReconnect } from '@/lib/use-control-plane-reconnect'

describe('useControlPlaneReconnect', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-01T12:00:00Z'))
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('shows nothing while the control plane is reachable', () => {
    const retry = vi.fn()
    const { result } = renderHook(() => useControlPlaneReconnect(false, retry))
    act(() => {
      vi.advanceTimersByTime(30_000)
    })
    expect(result.current.view).toBeNull()
    expect(retry).not.toHaveBeenCalled()
  })

  it('counts elapsed time and retries with a growing gap', () => {
    const retry = vi.fn()
    const { result } = renderHook(() => useControlPlaneReconnect(true, retry))
    act(() => {
      vi.advanceTimersByTime(2_000)
    })
    expect(retry).toHaveBeenCalledTimes(1)
    act(() => {
      vi.advanceTimersByTime(3_000)
    })
    expect(retry).toHaveBeenCalledTimes(2)
    expect(result.current.view?.phase).toBe('reconnecting')
    expect(result.current.view?.elapsedLabel).toBe('5 s')
  })

  it('turns slow after three minutes, and Keep waiting pushes it back', () => {
    const { result } = renderHook(() => useControlPlaneReconnect(true, vi.fn()))
    act(() => {
      vi.advanceTimersByTime(RECONNECT_SLOW_AFTER_MS + 1_000)
    })
    expect(result.current.view?.phase).toBe('slow')
    act(() => {
      result.current.keepWaiting()
    })
    expect(result.current.view?.phase).toBe('reconnecting')
    act(() => {
      vi.advanceTimersByTime(RECONNECT_SLOW_AFTER_MS + 1_000)
    })
    expect(result.current.view?.phase).toBe('slow')
  })

  it('resets when the control plane answers again', () => {
    const retry = vi.fn()
    const { result, rerender } = renderHook(({ down }) => useControlPlaneReconnect(down, retry), {
      initialProps: { down: true },
    })
    act(() => {
      vi.advanceTimersByTime(4_000)
    })
    expect(result.current.view).not.toBeNull()
    rerender({ down: false })
    expect(result.current.view).toBeNull()
    rerender({ down: true })
    act(() => {
      vi.advanceTimersByTime(1_000)
    })
    expect(result.current.view?.elapsedLabel).toBe('1 s')
  })
})
