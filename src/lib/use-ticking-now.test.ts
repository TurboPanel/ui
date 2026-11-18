// @vitest-environment happy-dom
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useTickingNow } from './use-ticking-now'

describe('useTickingNow', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-01T12:00:00Z'))
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('ticks every second while active', () => {
    const { result } = renderHook(() => useTickingNow(true))
    const start = result.current
    act(() => {
      vi.advanceTimersByTime(3000)
    })
    expect(result.current - start).toBe(3000)
  })

  it('never ticks with a fixed clock', () => {
    const { result } = renderHook(() => useTickingNow(true, 42))
    act(() => {
      vi.advanceTimersByTime(3000)
    })
    expect(result.current).toBe(42)
  })

  it('stops ticking once the clock reaches stopAt', () => {
    const stopAt = Date.now() + 2000
    const { result } = renderHook(() => useTickingNow(true, undefined, stopAt))
    act(() => {
      vi.advanceTimersByTime(2000)
    })
    expect(result.current).toBeGreaterThanOrEqual(stopAt)
    expect(vi.getTimerCount()).toBe(0)
    const frozen = result.current
    act(() => {
      vi.advanceTimersByTime(5000)
    })
    expect(result.current).toBe(frozen)
  })

  it('does not tick for a stopAt that cannot be read', () => {
    renderHook(() => useTickingNow(true, undefined, Number.NaN))
    expect(vi.getTimerCount()).toBe(0)
  })
})
