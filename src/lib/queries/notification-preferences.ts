import { useQueries, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import {
  applyNotificationPreset,
  deleteNotificationPreference,
  fetchEffectiveNotificationLevels,
  fetchNotificationPreferences,
  postNotificationUnsubscribe,
  putNotificationPreference,
  updateNotificationSettings,
  type NotificationPreferenceScope,
  type NotificationPreferenceWrite,
  type NotificationPresetId,
} from '@/lib/instance-api'
import { scopeKey } from '@/lib/notification-preferences'
import { queryKeys } from '@/lib/query-keys'
import { useApiMutation } from '@/lib/query-client'

/**
 * The person's rows and effective levels for one organization (plus the
 * global rows), or the global rows alone when `organizationId` is null.
 */
export function useNotificationPreferencesQuery(
  organizationId: string | null,
  options?: Readonly<{ enabled?: boolean }>
) {
  return useQuery({
    queryKey: queryKeys.notifications.preferences(organizationId),
    queryFn: () => fetchNotificationPreferences({ organizationId }),
    enabled: options?.enabled ?? true,
    retry: false,
  })
}

/** One read per organization the person belongs to: the account page's override list. */
export function useNotificationPreferencesForOrganizations(organizationIds: readonly string[]) {
  return useQueries({
    queries: organizationIds.map((organizationId) => ({
      queryKey: queryKeys.notifications.preferences(organizationId),
      queryFn: () => fetchNotificationPreferences({ organizationId }),
      retry: false,
    })),
  })
}

/** Effective levels at one scope inside an organization; read only while its card is open. */
export function useEffectiveNotificationLevels(
  scope: NotificationPreferenceScope & { organizationId: string },
  options?: Readonly<{ enabled?: boolean }>
) {
  return useQuery({
    queryKey: queryKeys.notifications.effective(scope.organizationId, scopeKey(scope)),
    queryFn: () => fetchEffectiveNotificationLevels(scope),
    enabled: options?.enabled ?? true,
    retry: false,
  })
}

async function invalidatePreferences(queryClient: QueryClient): Promise<void> {
  await queryClient.invalidateQueries({ queryKey: queryKeys.notifications.preferencesAll })
}

export function usePutNotificationPreference() {
  const queryClient = useQueryClient()
  return useApiMutation({
    mutationFn: (body: NotificationPreferenceWrite) => putNotificationPreference(body),
    onSuccess: async () => {
      await invalidatePreferences(queryClient)
    },
  })
}

export function useDeleteNotificationPreference() {
  const queryClient = useQueryClient()
  return useApiMutation({
    mutationFn: (id: string) => deleteNotificationPreference(id),
    onSuccess: async () => {
      await invalidatePreferences(queryClient)
    },
  })
}

export function useApplyNotificationPreset() {
  const queryClient = useQueryClient()
  return useApiMutation({
    mutationFn: ({
      organizationId,
      preset,
    }: {
      organizationId: string | null
      preset: NotificationPresetId
    }) => applyNotificationPreset(organizationId, preset),
    onSuccess: async () => {
      await invalidatePreferences(queryClient)
    },
  })
}

/** Administrators: "Hear Every Organization". */
export function useUpdateNotificationSettings() {
  const queryClient = useQueryClient()
  return useApiMutation({
    mutationFn: (allOrganizations: boolean) => updateNotificationSettings(allOrganizations),
    onSuccess: async () => {
      await invalidatePreferences(queryClient)
    },
  })
}

/** The one-click unsubscribe; run once, on a button press. */
export function useNotificationUnsubscribe() {
  return useApiMutation({
    mutationFn: (token: string) => postNotificationUnsubscribe(token),
  })
}
