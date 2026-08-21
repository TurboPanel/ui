// @vitest-environment happy-dom
import { render, renderHook, act } from '@testing-library/react'
import { useEffect } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  PullToRefreshProvider,
  useOptionalPullToRefresh,
  usePullToRefresh,
} from '@/lib/pull-to-refresh'

const { useIsFocused } = vi.hoisted(() => ({ useIsFocused: vi.fn(() => true) }))
vi.mock('expo-router', () => ({ useIsFocused }))

type Ctx = ReturnType<typeof useOptionalPullToRefresh>

afterEach(() => {
  vi.clearAllMocks()
  useIsFocused.mockReturnValue(true)
})

/** Mutable holder — `let` would narrow to `never`, since TS cannot see the callback write. */
function captureCtx() {
  const holder: { ctx: Ctx; set: (next: Ctx) => void } = {
    ctx: null,
    set: (next: Ctx) => {
      holder.ctx = next
    },
  }
  return holder
}

function Wrapper({ children }: Readonly<{ children: React.ReactNode }>) {
  return <PullToRefreshProvider>{children}</PullToRefreshProvider>
}

/**
 * Stands in for the org shell ScrollView reading the registry. Reports through
 * an effect rather than assigning during render, which the compiler forbids.
 */
function ShellProbe({ onCtx }: Readonly<{ onCtx: (ctx: Ctx) => void }>) {
  const ctx = useOptionalPullToRefresh()
  useEffect(() => {
    onCtx(ctx)
  }, [ctx, onCtx])
  return null
}

/** Stands in for a screen that opts into pull-to-refresh. */
function Screen({ onRefresh }: Readonly<{ onRefresh: () => void }>) {
  usePullToRefresh(onRefresh)
  return null
}

describe('pull-to-refresh registry', () => {
  it('stays disabled when no screen registers a handler', () => {
    const { result } = renderHook(() => useOptionalPullToRefresh(), {
      wrapper: Wrapper,
    })
    expect(result.current?.enabled).toBe(false)
  })

  it('enables while a focused screen has a handler', () => {
    const seen = captureCtx()
    render(
      <Wrapper>
        <ShellProbe onCtx={seen.set} />
        <Screen onRefresh={() => {}} />
      </Wrapper>,
    )
    expect(seen.ctx?.enabled).toBe(true)
  })

  it('disables when the registering screen unmounts', () => {
    const seen = captureCtx()
    const view = render(
      <Wrapper>
        <ShellProbe onCtx={seen.set} />
        <Screen onRefresh={() => {}} />
      </Wrapper>,
    )
    expect(seen.ctx?.enabled).toBe(true)
    view.rerender(
      <Wrapper>
        <ShellProbe onCtx={seen.set} />
      </Wrapper>,
    )
    expect(seen.ctx?.enabled).toBe(false)
  })

  /**
   * A native stack keeps the screen underneath mounted when a new one is
   * pushed. The blurred screen must release the gesture so a pushed screen
   * with nothing to refresh (the create wizard) shows no RefreshControl.
   */
  it('releases the gesture when the registering screen loses focus', () => {
    useIsFocused.mockReturnValue(false)
    const seen = captureCtx()
    render(
      <Wrapper>
        <ShellProbe onCtx={seen.set} />
        <Screen onRefresh={() => {}} />
      </Wrapper>,
    )
    expect(seen.ctx?.enabled).toBe(false)
  })

  it('runs the registered handler on refresh', async () => {
    const onRefresh = vi.fn()
    const seen = captureCtx()
    render(
      <Wrapper>
        <ShellProbe onCtx={seen.set} />
        <Screen onRefresh={onRefresh} />
      </Wrapper>,
    )
    await act(async () => {
      await seen.ctx?.onRefresh()
    })
    expect(onRefresh).toHaveBeenCalledTimes(1)
  })
})
