import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import {
  createNotificationChannel,
  deleteNotificationChannel,
  dismissNotification,
  fetchNotificationChannels,
  fetchNotificationEvents,
  fetchNotifications,
  fetchUnreadNotificationCount,
  markNotificationsRead,
  updateNotificationChannel,
  type CreateNotificationChannelBody,
  type NotificationRule,
} from '@/lib/instance-api'
import { queryKeys } from '@/lib/query-keys'
import { useApiMutation } from '@/lib/query-client'

/** The bell polls: a notification is worth a minute's latency, not a socket. */
export const UNREAD_POLL_MS = 60_000

export function useUnreadNotificationsQuery(options?: Readonly<{ enabled?: boolean }>) {
  return useQuery({
    queryKey: queryKeys.notifications.unread,
    queryFn: fetchUnreadNotificationCount,
    enabled: options?.enabled ?? true,
    refetchInterval: UNREAD_POLL_MS,
    retry: false,
  })
}

export function useNotificationsQuery(options?: Readonly<{ enabled?: boolean; limit?: number }>) {
  return useQuery({
    queryKey: [...queryKeys.notifications.inbox, options?.limit ?? 30] as const,
    queryFn: () => fetchNotifications({ limit: options?.limit ?? 30 }),
    enabled: options?.enabled ?? true,
    retry: false,
  })
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
 * about. The account screens sit outside the org shell, so the active
 * organization is not set there; they pass the person's preferred one.
 */
export function useNotificationChannelsQuery(
  scope: 'user' | 'organization',
  options?: Readonly<{ enabled?: boolean; organizationId?: string | null }>,
) {
  return useQuery({
    queryKey: [...queryKeys.notifications.channels(scope), options?.organizationId ?? null] as const,
    queryFn: () => fetchNotificationChannels(scope, options?.organizationId),
    enabled: options?.enabled ?? true,
    retry: false,
  })
}

async function invalidateChannels(queryClient: QueryClient, scope: 'user' | 'organization'): Promise<void> {
  await queryClient.invalidateQueries({ queryKey: queryKeys.notifications.channels(scope) })
}

export function useCreateNotificationChannel(scope: 'user' | 'organization', organizationId?: string | null) {
  const queryClient = useQueryClient()
  return useApiMutation({
    mutationFn: (body: Omit<CreateNotificationChannelBody, 'scope'>) =>
      createNotificationChannel({ ...body, scope }, organizationId),
    onSuccess: async () => {
      await invalidateChannels(queryClient, scope)
    },
  })
}

export function useUpdateNotificationChannel(scope: 'user' | 'organization', organizationId?: string | null) {
  const queryClient = useQueryClient()
  return useApiMutation({
    mutationFn: ({ id, ...patch }: { id: string; label?: string; disabled?: boolean; rules?: NotificationRule[] }) =>
      updateNotificationChannel(id, patch, organizationId),
    onSuccess: async () => {
      await invalidateChannels(queryClient, scope)
    },
  })
}

export function useDeleteNotificationChannel(scope: 'user' | 'organization', organizationId?: string | null) {
  const queryClient = useQueryClient()
  return useApiMutation({
    mutationFn: (id: string) => deleteNotificationChannel(id, organizationId),
    onSuccess: async () => {
      await invalidateChannels(queryClient, scope)
    },
  })
}
