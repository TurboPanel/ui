import { useQueries, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import {
  applyNotificationPreset,
  deleteNotificationPreference,
  fetchEffectiveNotificationLevels,
  fetchNotificationPreferences,
  fetchOrgServers,
  fetchVisibleEnvironments,
  fetchVisibleProjects,
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

export type NotificationScopeNames = {
  projects: Map<string, string>
  environments: Map<string, string>
  servers: Map<string, string>
}

function settled<T>(result: PromiseSettledResult<T>): T | null {
  return result.status === 'fulfilled' ? result.value : null
}

/**
 * Project, environment and server names of one organization, so the account
 * page's override list can say which one a row is about. The account page
 * sits outside the organization pages, so each read names the organization
 * itself. A list the person may not read (or that fails) just leaves its
 * names out: the row then shows the plain word, and a 403 here never reaches
 * the session handler. Read only for organizations whose rows name one.
 */
export function useNotificationScopeNames(
  organizationId: string,
  options?: Readonly<{ enabled?: boolean }>
) {
  return useQuery({
    queryKey: queryKeys.notifications.scopeNames(organizationId),
    queryFn: async (): Promise<NotificationScopeNames> => {
      const [projects, environments, servers] = await Promise.allSettled([
        fetchVisibleProjects(undefined, organizationId),
        fetchVisibleEnvironments(undefined, organizationId),
        fetchOrgServers(organizationId),
      ])
      const named = (items: readonly { id: string; name?: string | null }[] | undefined) =>
        new Map(
          (items ?? []).flatMap((item): [string, string][] =>
            item.name ? [[item.id, item.name]] : []
          )
        )
      return {
        projects: named(settled(projects)?.projects),
        environments: named(settled(environments)?.environments),
        servers: named(settled(servers)?.servers),
      }
    },
    enabled: (options?.enabled ?? true) && organizationId.length > 0,
    staleTime: 60_000,
    retry: false,
  })
}

/**
 * The narrowest correct refresh after a write. A row inside one organization
 * changes that organization's reads only (its rows and its effective levels).
 * A row for every organization (`null`) is repeated in every organization's
 * read and moves their effective levels, so everything is refreshed.
 */
async function invalidatePreferences(
  queryClient: QueryClient,
  organizationId: string | null
): Promise<void> {
  await queryClient.invalidateQueries({
    queryKey:
      organizationId === null
        ? queryKeys.notifications.preferencesAll
        : queryKeys.notifications.preferences(organizationId),
  })
}

export function usePutNotificationPreference() {
  const queryClient = useQueryClient()
  return useApiMutation({
    mutationFn: (body: NotificationPreferenceWrite) => putNotificationPreference(body),
    onSuccess: async (_data, body) => {
      await invalidatePreferences(queryClient, body.organizationId ?? null)
    },
  })
}

/** The row to remove, with the organization it sits in (`null` = every organization). */
export type NotificationPreferenceRemoval = { id: string; organizationId: string | null }

export function useDeleteNotificationPreference() {
  const queryClient = useQueryClient()
  return useApiMutation({
    mutationFn: ({ id }: NotificationPreferenceRemoval) => deleteNotificationPreference(id),
    onSuccess: async (_data, { organizationId }) => {
      await invalidatePreferences(queryClient, organizationId)
    },
  })
}

/**
 * Remove several rows of one organization as one action (Reset All on a
 * project, environment or server): one after another, stopping at the first
 * failure, then one refresh whether or not all of them went, so the screen
 * shows what is left.
 */
export function useDeleteNotificationPreferences() {
  const queryClient = useQueryClient()
  return useApiMutation({
    mutationFn: ({ ids }: { ids: readonly string[]; organizationId: string | null }) =>
      ids.reduce<Promise<unknown>>(
        (done, id) => done.then(() => deleteNotificationPreference(id)),
        Promise.resolve()
      ),
    onSettled: async (_data, _error, { organizationId }) => {
      await invalidatePreferences(queryClient, organizationId)
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
    onSuccess: async (_data, { organizationId }) => {
      await invalidatePreferences(queryClient, organizationId)
    },
  })
}

/**
 * Administrators: "Hear Every Organization". The answer is part of every
 * preference read, so all of them are refreshed.
 */
export function useUpdateNotificationSettings() {
  const queryClient = useQueryClient()
  return useApiMutation({
    mutationFn: (allOrganizations: boolean) => updateNotificationSettings(allOrganizations),
    onSuccess: async () => {
      await invalidatePreferences(queryClient, null)
    },
  })
}

/** The one-click unsubscribe; run once, on a button press. */
export function useNotificationUnsubscribe() {
  return useApiMutation({
    mutationFn: (token: string) => postNotificationUnsubscribe(token),
  })
}
