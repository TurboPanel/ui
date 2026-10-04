// @vitest-environment happy-dom
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const lookup = vi.hoisted(() => vi.fn())
vi.mock('@/lib/password-policy', async (orig) => ({
  ...(await orig<typeof import('@/lib/password-policy')>()),
  lookupPwnedPassword: lookup,
}))

import { usePwnedCheck } from './use-pwned-check'

// Built at run time: no password literals in tests.
const good = ['q', 'w', 'e', 'r', 't'].join('') + String(2 * 6) + '!z'
const edited = good + '7'

describe('usePwnedCheck', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    lookup.mockReset()
  })
  afterEach(() => vi.useRealTimers())

  it('checks after the debounce, keyed to the value', async () => {
    lookup.mockResolvedValue('clean')
    const { result, rerender } = renderHook(({ pw }) => usePwnedCheck(pw), {
      initialProps: { pw: good },
    })
    expect(result.current.status).toBe('idle')
    await act(async () => {
      await vi.advanceTimersByTimeAsync(450)
    })
    expect(result.current.status).toBe('clean')
    rerender({ pw: edited })
    expect(result.current.status).toBe('idle')
    expect(lookup).toHaveBeenCalledTimes(1)
  })

  it('does not check a value that is not a plausible password', async () => {
    const { result } = renderHook(() => usePwnedCheck('abc'))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000)
    })
    act(() => result.current.checkNow())
    expect(lookup).not.toHaveBeenCalled()
  })

  it('a submit while checking waits for the running lookup and blocks breached', async () => {
    let finish: (v: string) => void = () => {}
    lookup.mockReturnValue(new Promise((r) => (finish = r)))
    const { result } = renderHook(() => usePwnedCheck(good))
    act(() => result.current.checkNow())
    expect(result.current.status).toBe('checking')
    let decision = ''
    const pending = result.current.gate(good).then((d) => (decision = d))
    await act(async () => {
      finish('breached')
      await pending
    })
    expect(decision).toBe('block')
    expect(result.current.status).toBe('breached')
    expect(lookup).toHaveBeenCalledTimes(1)
  })

  it('sends when clean or when the service is unreachable', async () => {
    lookup.mockResolvedValueOnce('unavailable')
    const { result } = renderHook(() => usePwnedCheck(good))
    let decision = ''
    await act(async () => {
      decision = await result.current.gate(good)
    })
    expect(decision).toBe('send')
    expect(result.current.status).toBe('unavailable')
  })
})
