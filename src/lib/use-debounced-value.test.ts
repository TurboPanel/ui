// @vitest-environment happy-dom
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useDebouncedValue } from './use-debounced-value'

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('useDebouncedValue', () => {
  it('starts on the current value, with no wait', () => {
    const { result } = renderHook(() => useDebouncedValue('main', 500))
    expect(result.current[0]).toBe('main')
  })

  it('takes a new value only once it has stopped changing', () => {
    const { result, rerender } = renderHook(
      ({ value }: { value: string }) => useDebouncedValue(value, 500),
      { initialProps: { value: '' } },
    )
    rerender({ value: 'l' })
    act(() => {
      vi.advanceTimersByTime(300)
    })
    rerender({ value: 'li' })
    act(() => {
      vi.advanceTimersByTime(300)
    })
    rerender({ value: 'live' })
    expect(result.current[0]).toBe('')
    act(() => {
      vi.advanceTimersByTime(499)
    })
    expect(result.current[0]).toBe('')
    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(result.current[0]).toBe('live')
  })

  it('flush takes the value at once', () => {
    const { result, rerender } = renderHook(
      ({ value }: { value: string }) => useDebouncedValue(value, 500),
      { initialProps: { value: '' } },
    )
    rerender({ value: 'live' })
    act(() => {
      result.current[1]()
    })
    expect(result.current[0]).toBe('live')
  })
})
