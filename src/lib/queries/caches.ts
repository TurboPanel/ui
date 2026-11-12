import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createEnvironmentCache,
  deleteEnvironmentCache,
  fetchEnvironmentCaches,
  updateEnvironmentCache,
  type CacheRecord,
  type CreateCacheBody,
  type UpdateCacheBody,
} from '@/lib/instance-api'
import { useApiMutation, queryKeys } from '@/lib/query-client'

/** How often the list is read again while a host is still starting a cache. */
export const CACHE_APPLY_POLL_MS = 4000

/** True while any cache is being started or changed by its host. */
export function anyCacheApplying(caches: readonly Pick<CacheRecord, 'status'>[] | undefined) {
  return caches?.some((cache) => cache.status === 'applying') === true
}

/** The project caches of one environment. Follows the host while one is starting. */
export function useEnvironmentCaches(
  orgId: string,
  environmentId: string,
  options?: Readonly<{ enabled?: boolean }>
) {
  return useQuery({
    queryKey: queryKeys.org(orgId).environments.caches(environmentId),
    queryFn: () => fetchEnvironmentCaches(environmentId),
    enabled: (options?.enabled ?? true) && orgId.length > 0 && environmentId.length > 0,
    refetchInterval: (query) =>
      anyCacheApplying(query.state.data?.caches) ? CACHE_APPLY_POLL_MS : false,
  })
}

/** A change to a cache moves the caches list and what uses each Hosting Account. */
function useInvalidateCaches(orgId: string, environmentId: string) {
  const queryClient = useQueryClient()
  return async () => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: queryKeys.org(orgId).environments.caches(environmentId),
      }),
      queryClient.invalidateQueries({ queryKey: queryKeys.org(orgId).principals }),
    ])
  }
}

export function useCreateCache(orgId: string, environmentId: string) {
  const invalidate = useInvalidateCaches(orgId, environmentId)
  return useApiMutation({
    mutationFn: (body: CreateCacheBody) => createEnvironmentCache(environmentId, body),
    onSuccess: invalidate,
    fallbackError: 'Could not add the cache.',
  })
}

export function useUpdateCache(orgId: string, environmentId: string) {
  const invalidate = useInvalidateCaches(orgId, environmentId)
  return useApiMutation({
    mutationFn: (vars: Readonly<{ cacheId: string; body: UpdateCacheBody }>) =>
      updateEnvironmentCache(environmentId, vars.cacheId, vars.body),
    onSuccess: invalidate,
    fallbackError: 'Could not change the cache.',
  })
}

export function useDeleteCache(orgId: string, environmentId: string) {
  const invalidate = useInvalidateCaches(orgId, environmentId)
  return useApiMutation({
    mutationFn: (vars: Readonly<{ cacheId: string; deleteData: boolean }>) =>
      deleteEnvironmentCache(environmentId, vars.cacheId, { deleteData: vars.deleteData }),
    onSuccess: invalidate,
    fallbackError: 'Could not delete the cache.',
  })
}
