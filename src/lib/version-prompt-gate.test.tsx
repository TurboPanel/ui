// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { dismissFlashNotice, postFlashNotice, resetFlashNoticesForTests } from './flash-notice'
import { registerOpenDialog, useAnyDialogOpen, useVersionPromptReady } from './version-prompt-gate'

const { stepUpOpen } = vi.hoisted(() => ({ stepUpOpen: { value: false } }))
vi.mock('@/lib/use-step-up-open', () => ({ useStepUpOpen: () => stepUpOpen.value }))

let client: QueryClient
function wrapper({ children }: Readonly<{ children: ReactNode }>) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

beforeEach(() => {
  vi.useFakeTimers()
  client = new QueryClient()
  stepUpOpen.value = false
})
afterEach(() => {
  cleanup()
  resetFlashNoticesForTests()
  vi.useRealTimers()
})

describe('version prompt gate', () => {
  it('is ready on a quiet page', () => {
    const { result } = renderHook(() => useVersionPromptReady(1000), { wrapper })
    expect(result.current).toBe(true)
  })

  it('waits while a dialog is open and releases when it closes', () => {
    const { result } = renderHook(() => useVersionPromptReady(1000), { wrapper })
    let release = () => {}
    act(() => {
      release = registerOpenDialog()
    })
    expect(result.current).toBe(false)
    act(() => release())
    act(() => release()) // a second release is a no-op
    expect(result.current).toBe(true)
  })

  it('counts every open dialog', () => {
    const { result } = renderHook(() => useAnyDialogOpen())
    let a = () => {}
    let b = () => {}
    act(() => {
      a = registerOpenDialog()
      b = registerOpenDialog()
    })
    act(() => a())
    expect(result.current).toBe(true)
    act(() => b())
    expect(result.current).toBe(false)
  })

  it('waits until the result notice of an action has been shown and dismissed', () => {
    const { result } = renderHook(() => useVersionPromptReady(1000), { wrapper })
    let id = 0
    act(() => {
      id = postFlashNotice('Deleted organization Acme.')
    })
    expect(result.current).toBe(false)
    act(() => dismissFlashNotice(id))
    expect(result.current).toBe(true)
  })

  it('waits while the step-up prompt is open', () => {
    stepUpOpen.value = true
    const { result } = renderHook(() => useVersionPromptReady(1000), { wrapper })
    expect(result.current).toBe(false)
  })

  it('waits while a change runs and for the quiet period after it finishes', async () => {
    const { result } = renderHook(() => useVersionPromptReady(1000), { wrapper })
    let resolve = () => {}
    let run: Promise<unknown> = Promise.resolve()
    act(() => {
      run = client
        .getMutationCache()
        .build(client, {
          mutationFn: () => new Promise<void>((r) => (resolve = r)),
        })
        .execute(undefined)
    })
    await act(async () => {})
    act(() => vi.advanceTimersByTime(1)) // react-query batches its notifications on a timer
    expect(result.current).toBe(false)
    await act(async () => {
      resolve()
      await run
    })
    act(() => vi.advanceTimersByTime(1))
    expect(result.current).toBe(false)
    act(() => vi.advanceTimersByTime(500))
    expect(result.current).toBe(false)
    act(() => vi.advanceTimersByTime(600))
    expect(result.current).toBe(true)
  })

  it('also waits after a change that failed', async () => {
    const { result } = renderHook(() => useVersionPromptReady(1000), { wrapper })
    await act(async () => {
      await client
        .getMutationCache()
        .build(client, { mutationFn: () => Promise.reject(new Error('no')) })
        .execute(undefined)
        .catch(() => undefined)
    })
    act(() => vi.advanceTimersByTime(1))
    expect(result.current).toBe(false)
    act(() => vi.advanceTimersByTime(1001))
    expect(result.current).toBe(true)
  })
})
