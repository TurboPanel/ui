import { useEffect } from 'react'
import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import {
  createNotificationChannel,
  deleteNotificationChannel,
  dismissNotification,
  fetchNotificationChannels,
  resendNotificationChannelVerification,
  fetchNotificationEvents,
  fetchNotifications,
  fetchUnreadNotificationCount,
  markNotificationsRead,
  updateNotificationChannel,
  type CreateNotificationChannelBody,
  type NotificationChannel,
  type NotificationChannelTiming,
  type NotificationRule,
} from '@/lib/instance-api'
import { isForbiddenError } from '@/lib/fetch-error-detail'
import { queryKeys } from '@/lib/query-keys'
import { useApiMutation } from '@/lib/query-client'

/**
 * The bell polls: a notification is worth a few minutes' latency, not a
 * socket. Every open tab asks, and each ask costs the control plane database
 * statements, so the poll is slow and sleeps while the tab is hidden.
 */
export const UNREAD_POLL_MS = 180_000

export function useUnreadNotificationsQuery(options?: Readonly<{ enabled?: boolean }>) {
  return useQuery({
    queryKey: queryKeys.notifications.unread,
    queryFn: fetchUnreadNotificationCount,
    enabled: options?.enabled ?? true,
    refetchInterval: UNREAD_POLL_MS,
    // A hidden tab does not poll (the focus manager tracks document
    // visibility on the web).
    refetchIntervalInBackground: false,
    // The count is fresh for one interval; becoming visible again refetches
    // only when the last answer is older than that.
    staleTime: UNREAD_POLL_MS,
    refetchOnWindowFocus: true,
    retry: false,
  })
}

export function useNotificationsQuery(options?: Readonly<{ enabled?: boolean; limit?: number }>) {
  const queryClient = useQueryClient()
  const query = useQuery({
    queryKey: [...queryKeys.notifications.inbox, options?.limit ?? 30] as const,
    queryFn: () => fetchNotifications({ limit: options?.limit ?? 30 }),
    enabled: options?.enabled ?? true,
    // Opening the bell really asks; a cached inbox is never shown as current.
    refetchOnMount: 'always',
    retry: false,
  })
  // The inbox response already carries the unread total: opening the panel
  // updates the badge at once instead of waiting for the next poll. Only a
  // total newer than the badge's own answer is copied, so an old cached inbox
  // never overwrites a fresher poll.
  const unread = query.data?.unread
  const inboxUpdatedAt = query.dataUpdatedAt
  useEffect(() => {
    if (unread === undefined) return
    const badge = queryClient.getQueryState(queryKeys.notifications.unread)
    if (badge?.data !== undefined && badge.dataUpdatedAt >= inboxUpdatedAt) return
    queryClient.setQueryData(queryKeys.notifications.unread, unread, {
      updatedAt: inboxUpdatedAt,
    })
  }, [queryClient, unread, inboxUpdatedAt])
  return query
}

async function invalidateInbox(queryClient: QueryClient): Promise<void> {
  await queryClient.invalidateQueries({ queryKey: queryKeys.notifications.inbox })
  await queryClient.invalidateQueries({ queryKey: queryKeys.notifications.unread })
}

export function useMarkNotificationsRead() {
  const queryClient = useQueryClient()
  return useApiMutation({
    mutationFn: (ids: readonly string[]) => markNotificationsRead(ids),
    onSuccess: async () => {
      await invalidateInbox(queryClient)
    },
  })
}

export function useDismissNotification() {
  const queryClient = useQueryClient()
  return useApiMutation({
    mutationFn: (id: string) => dismissNotification(id),
    onSuccess: async () => {
      await invalidateInbox(queryClient)
    },
  })
}

export function useNotificationEventsQuery(options?: Readonly<{ enabled?: boolean }>) {
  return useQuery({
    queryKey: queryKeys.notifications.events,
    queryFn: fetchNotificationEvents,
    enabled: options?.enabled ?? true,
    staleTime: Infinity,
    retry: false,
  })
}

/**
 * `organizationId` names the organization an `organization`-scoped call is
 * about. Data is `null` when the person may not manage that organization's
 * channels (the API answers 403).
 */
export function useNotificationChannelsQuery(
  scope: 'user' | 'organization',
  options?: Readonly<{ enabled?: boolean; organizationId?: string | null }>
) {
  return useQuery({
    queryKey: [
      ...queryKeys.notifications.channels(scope),
      options?.organizationId ?? null,
    ] as const,
    // Organization channels are manager-only: a 403 is an answer ("not yours
    // to manage", data `null`), never a lost session for the global handler.
    queryFn: async (): Promise<NotificationChannel[] | null> => {
      try {
        return await fetchNotificationChannels(scope, options?.organizationId)
      } catch (err) {
        if (scope === 'organization' && isForbiddenError(err)) return null
        throw err
      }
    },
    enabled: options?.enabled ?? true,
    retry: false,
  })
}

async function invalidateChannels(
  queryClient: QueryClient,
  scope: 'user' | 'organization'
): Promise<void> {
  await queryClient.invalidateQueries({ queryKey: queryKeys.notifications.channels(scope) })
}

export function useCreateNotificationChannel(
  scope: 'user' | 'organization',
  organizationId?: string | null
) {
  const queryClient = useQueryClient()
  return useApiMutation({
    mutationFn: (body: Omit<CreateNotificationChannelBody, 'scope'>) =>
      createNotificationChannel({ ...body, scope }, organizationId),
    onSuccess: async () => {
      await invalidateChannels(queryClient, scope)
    },
  })
}

export function useUpdateNotificationChannel(
  scope: 'user' | 'organization',
  organizationId?: string | null
) {
  const queryClient = useQueryClient()
  return useApiMutation({
    mutationFn: ({
      id,
      ...patch
    }: {
      id: string
      label?: string
      disabled?: boolean
      rules?: NotificationRule[]
    } & NotificationChannelTiming) => updateNotificationChannel(id, patch, organizationId),
    onSuccess: async () => {
      await invalidateChannels(queryClient, scope)
    },
  })
}

export function useDeleteNotificationChannel(
  scope: 'user' | 'organization',
  organizationId?: string | null
) {
  const queryClient = useQueryClient()
  return useApiMutation({
    mutationFn: (id: string) => deleteNotificationChannel(id, organizationId),
    onSuccess: async () => {
      await invalidateChannels(queryClient, scope)
    },
  })
}

export function useResendChannelVerification(organizationId?: string | null) {
  return useApiMutation({
    mutationFn: (id: string) => resendNotificationChannelVerification(id, organizationId),
  })
}
