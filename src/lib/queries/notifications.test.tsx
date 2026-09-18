// @vitest-environment happy-dom
import React from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createAppQueryClient } from '@/lib/query-client'
import {
  useCreateNotificationChannel,
  useMarkNotificationsRead,
  useNotificationChannelsQuery,
  useNotificationsQuery,
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
    const { result } = renderHook(() => useNotificationsQuery({ limit: 10 }), { wrapper: createWrapper() })
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
    await waitFor(() => expect(fetchNotificationChannels).toHaveBeenCalledWith('user'))
    const { result } = renderHook(() => useCreateNotificationChannel('user'), { wrapper })
    await result.current.run({
      kind: 'slack',
      label: 'Ops',
      address: 'https://hooks.slack.com/x',
      rules: [{ event: '*', minSeverity: 'warning' }],
    })
    expect(createNotificationChannel).toHaveBeenCalledWith({
      scope: 'user',
      kind: 'slack',
      label: 'Ops',
      address: 'https://hooks.slack.com/x',
      rules: [{ event: '*', minSeverity: 'warning' }],
    })
    await waitFor(() => expect(fetchNotificationChannels).toHaveBeenCalledTimes(2))
  })
})
