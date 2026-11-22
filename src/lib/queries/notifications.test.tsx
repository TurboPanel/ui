// @vitest-environment happy-dom
import React from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import { cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createAppQueryClient } from '@/lib/query-client'
import {
  useCreateNotificationChannel,
  useMarkNotificationsRead,
  useNotificationChannelsQuery,
  useNotificationsQuery,
  UNREAD_POLL_MS,
  useUnreadNotificationsQuery,
} from '@/lib/queries/notifications'
import { useUnreadNotificationCount } from '@/lib/notifications'

const {
  fetchNotifications,
  fetchUnreadNotificationCount,
  markNotificationsRead,
  fetchNotificationChannels,
  createNotificationChannel,
  authState,
} = vi.hoisted(() => ({
  fetchNotifications: vi.fn(),
  fetchUnreadNotificationCount: vi.fn(),
  markNotificationsRead: vi.fn(),
  fetchNotificationChannels: vi.fn(),
  createNotificationChannel: vi.fn(),
  authState: { session: { userId: 'u-1' } as { userId: string } | null },
}))

vi.mock('@/lib/instance-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/instance-api')>()
  return {
    ...actual,
    fetchNotifications,
    fetchUnreadNotificationCount,
    markNotificationsRead,
    fetchNotificationChannels,
    createNotificationChannel,
  }
})

vi.mock('@/lib/auth-context', () => ({
  useAuth: () => ({ session: authState.session }),
}))

function createWrapper(client = createAppQueryClient()) {
  return function Wrapper({ children }: Readonly<{ children: React.ReactNode }>) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
}

afterEach(() => {
  vi.clearAllMocks()
  authState.session = { userId: 'u-1' }
})

describe('notification hooks', () => {
  it('useUnreadNotificationCount is the polled unread count, and 0 while signed out', async () => {
    fetchUnreadNotificationCount.mockResolvedValue(3)
    const { result } = renderHook(() => useUnreadNotificationCount(), { wrapper: createWrapper() })
    await waitFor(() => expect(result.current).toBe(3))
    expect(fetchUnreadNotificationCount).toHaveBeenCalledTimes(1)

    authState.session = null
    const signedOut = renderHook(() => useUnreadNotificationCount(), { wrapper: createWrapper() })
    expect(signedOut.result.current).toBe(0)
    expect(fetchUnreadNotificationCount).toHaveBeenCalledTimes(1)
  })

  it('useNotificationsQuery loads the inbox with the requested page size', async () => {
    fetchNotifications.mockResolvedValueOnce({
      notifications: [{ id: 'n-1', title: 'Server db-1 went offline', readAt: null }],
      unread: 1,
    })
    const { result } = renderHook(() => useNotificationsQuery({ limit: 10 }), {
      wrapper: createWrapper(),
    })
    await waitFor(() => expect(result.current.data?.unread).toBe(1))
    expect(fetchNotifications).toHaveBeenCalledWith({ limit: 10 })
  })

  it('marking read refreshes both the inbox and the badge', async () => {
    fetchNotifications.mockResolvedValue({ notifications: [], unread: 0 })
    fetchUnreadNotificationCount.mockResolvedValue(0)
    markNotificationsRead.mockResolvedValue({ updated: 2, unread: 0 })
    const client = createAppQueryClient()
    const wrapper = createWrapper(client)
    renderHook(() => useUnreadNotificationsQuery(), { wrapper })
    renderHook(() => useNotificationsQuery(), { wrapper })
    await waitFor(() => expect(fetchUnreadNotificationCount).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(fetchNotifications).toHaveBeenCalledTimes(1))
    const { result } = renderHook(() => useMarkNotificationsRead(), { wrapper })
    await result.current.run([])
    expect(markNotificationsRead).toHaveBeenCalledWith([])
    await waitFor(() => expect(fetchUnreadNotificationCount).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(fetchNotifications).toHaveBeenCalledTimes(2))
  })

  it('creating a channel carries the scope and refreshes that scope', async () => {
    fetchNotificationChannels.mockResolvedValue([])
    createNotificationChannel.mockResolvedValue({ id: 'c-1' })
    const client = createAppQueryClient()
    const wrapper = createWrapper(client)
    renderHook(() => useNotificationChannelsQuery('user'), { wrapper })
    await waitFor(() => expect(fetchNotificationChannels).toHaveBeenCalledWith('user', undefined))
    const { result } = renderHook(() => useCreateNotificationChannel('user'), { wrapper })
    await result.current.run({
      kind: 'slack',
      label: 'Ops',
      address: 'https://hooks.slack.com/x',
      rules: [{ event: '*', minSeverity: 'warning' }],
    })
    expect(createNotificationChannel).toHaveBeenCalledWith(
      {
        scope: 'user',
        kind: 'slack',
        label: 'Ops',
        address: 'https://hooks.slack.com/x',
        rules: [{ event: '*', minSeverity: 'warning' }],
      },
      undefined
    )
    await waitFor(() => expect(fetchNotificationChannels).toHaveBeenCalledTimes(2))
  })
})

describe('unread count polling', () => {
  function setVisibility(state: 'visible' | 'hidden') {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state })
    window.dispatchEvent(new Event('visibilitychange'))
  }

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
    setVisibility('visible')
  })

  it('polls every 180 s, not every 60 s', async () => {
    vi.useFakeTimers()
    fetchUnreadNotificationCount.mockResolvedValue(1)
    renderHook(() => useUnreadNotificationsQuery(), { wrapper: createWrapper() })
    await vi.advanceTimersByTimeAsync(0)
    expect(fetchUnreadNotificationCount).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(UNREAD_POLL_MS - 1000)
    expect(fetchUnreadNotificationCount).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1000)
    expect(fetchUnreadNotificationCount).toHaveBeenCalledTimes(2)
    expect(UNREAD_POLL_MS).toBe(180_000)
  })

  it('does not poll while the tab is hidden, and refreshes once when it is visible again', async () => {
    vi.useFakeTimers()
    fetchUnreadNotificationCount.mockResolvedValue(1)
    renderHook(() => useUnreadNotificationsQuery(), { wrapper: createWrapper() })
    await vi.advanceTimersByTimeAsync(0)
    expect(fetchUnreadNotificationCount).toHaveBeenCalledTimes(1)

    setVisibility('hidden')
    await vi.advanceTimersByTimeAsync(UNREAD_POLL_MS * 5)
    expect(fetchUnreadNotificationCount).toHaveBeenCalledTimes(1)

    setVisibility('visible')
    await vi.advanceTimersByTimeAsync(0)
    expect(fetchUnreadNotificationCount).toHaveBeenCalledTimes(2)
  })

  it('does not refetch on becoming visible when the last poll is younger than the interval', async () => {
    vi.useFakeTimers()
    fetchUnreadNotificationCount.mockResolvedValue(1)
    renderHook(() => useUnreadNotificationsQuery(), { wrapper: createWrapper() })
    await vi.advanceTimersByTimeAsync(0)
    setVisibility('hidden')
    await vi.advanceTimersByTimeAsync(30_000)
    setVisibility('visible')
    await vi.advanceTimersByTimeAsync(0)
    expect(fetchUnreadNotificationCount).toHaveBeenCalledTimes(1)
  })

  it('loading the inbox updates the badge count without another unread request', async () => {
    fetchUnreadNotificationCount.mockResolvedValue(0)
    fetchNotifications.mockResolvedValue({ notifications: [], unread: 4 })
    const wrapper = createWrapper()
    const badge = renderHook(() => useUnreadNotificationCount(), { wrapper })
    await waitFor(() => expect(fetchUnreadNotificationCount).toHaveBeenCalledTimes(1))
    renderHook(() => useNotificationsQuery(), { wrapper })
    await waitFor(() => expect(badge.result.current).toBe(4))
    expect(fetchUnreadNotificationCount).toHaveBeenCalledTimes(1)
  })
})
