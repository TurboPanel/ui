// @vitest-environment happy-dom
import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useCrashRetry } from '@/components/org/project/environment-overview/use-crash-retry'

const lifecycle = vi.hoisted(() => ({
  run: vi.fn(),
  isPending: false,
}))
const names = vi.hoisted(() => ({ args: [] as unknown[] }))

vi.mock('@/lib/queries/environments', () => ({
  useRunEnvironmentLifecycle: (...args: unknown[]) => {
    names.args = args
    return lifecycle
  },
}))

beforeEach(() => {
  lifecycle.run.mockReset()
  lifecycle.isPending = false
})

describe('useCrashRetry', () => {
  it('restarts the environment and says the restart was asked for', async () => {
    lifecycle.run.mockResolvedValue({ ok: true, value: {} })
    const { result } = renderHook(() => useCrashRetry('o', 'env-1', true))
    expect(names.args).toEqual(['o', 'env-1'])
    expect(result.current).toMatchObject({ canRetry: true, busy: false, requested: false, error: null })
    act(() => result.current.onRetry())
    await waitFor(() => expect(result.current.requested).toBe(true))
    expect(lifecycle.run).toHaveBeenCalledWith('restart')
  })

  it('reports a refusal in plain words, and clears it on the next try', async () => {
    lifecycle.run.mockResolvedValueOnce({ ok: false, error: 'busy', cause: new Error('A deploy is running.') })
    const { result } = renderHook(() => useCrashRetry('o', 'env-1', true))
    act(() => result.current.onRetry())
    await waitFor(() => expect(result.current.error).toBe('A deploy is running.'))
    lifecycle.run.mockResolvedValueOnce({ ok: true, value: {} })
    act(() => result.current.onRetry())
    await waitFor(() => expect(result.current).toMatchObject({ error: null, requested: true }))
  })

  it('falls back to its own words when nothing says why', async () => {
    lifecycle.run.mockResolvedValue({ ok: false, error: null })
    const { result } = renderHook(() => useCrashRetry('o', 'env-1', true))
    act(() => result.current.onRetry())
    await waitFor(() => expect(result.current.error).toBe('Could not restart. Try again.'))
  })

  it('falls back when the call itself throws', async () => {
    lifecycle.run.mockRejectedValue(new Error('x'))
    const { result } = renderHook(() => useCrashRetry('o', 'env-1', true))
    act(() => result.current.onRetry())
    await waitFor(() => expect(result.current.error).toBe('Could not restart. Try again.'))
  })

  it('does nothing while a restart is already in flight, and passes the manage right through', () => {
    lifecycle.isPending = true
    const { result } = renderHook(() => useCrashRetry('o', 'env-1', false))
    expect(result.current).toMatchObject({ canRetry: false, busy: true })
    act(() => result.current.onRetry())
    expect(lifecycle.run).not.toHaveBeenCalled()
  })
})
