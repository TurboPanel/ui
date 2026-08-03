import { keepPreviousData, useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useMemo } from 'react'
import { fetchContainers, type ContainerRecord } from '@/lib/instance-api'
import { queryKeys, type ContainerListFilters } from '@/lib/query-keys'

/**
 * Filtered container lists use `keepPreviousData` so chip/filter changes do not
 * flash empty while the next page loads. Pass `keepPreviousData: true` (default
 * when filters are present) or set explicitly.
 */
export function useContainers(
  orgId: string,
  filters?: ContainerListFilters,
  options?: Readonly<{
    enabled?: boolean
    refetchInterval?: number | false
    keepPreviousData?: boolean
  }>,
) {
  const useKeepPrevious =
    options?.keepPreviousData ?? Boolean(filters && Object.keys(filters).length > 0)

  return useQuery({
    queryKey: queryKeys.org(orgId).containers.list(filters),
    queryFn: () => fetchContainers(filters),
    enabled: (options?.enabled ?? true) && orgId.length > 0,
    refetchInterval: options?.refetchInterval ?? false,
    ...(useKeepPrevious ? { placeholderData: keepPreviousData } : {}),
  })
}

/** Per-environment container maps for Overview (no auto-poll). */
export function useContainersByEnvironments(
  orgId: string,
  environmentIds: readonly string[],
  options?: Readonly<{ enabled?: boolean }>,
) {
  const queryClient = useQueryClient()
  const enabled = (options?.enabled ?? true) && orgId.length > 0
  const queries = useQueries({
    queries: environmentIds.map((environmentId) => ({
      queryKey: queryKeys.org(orgId).containers.list({ environmentId }),
      queryFn: () => fetchContainers({ environmentId }),
      enabled: enabled && environmentId.length > 0,
      refetchInterval: false as const,
    })),
  })

  const containersDataKey = queries
    .map((query) => query.dataUpdatedAt)
    .join(':')

  const containersByEnv = useMemo(() => {
    const map: Record<string, ContainerRecord[]> = {}
    for (let index = 0; index < environmentIds.length; index++) {
      const environmentId = environmentIds[index]
      if (!environmentId) continue
      map[environmentId] = queries[index]?.data?.containers ?? []
    }
    return map
    // eslint-disable-next-line react-hooks/exhaustive-deps -- containersDataKey tracks query data identity
  }, [environmentIds, containersDataKey])

  const isLoading =
    enabled && environmentIds.length > 0 && queries.some((query) => query.isLoading)

  const refetchAll = useCallback(async () => {
    await Promise.all(
      environmentIds.map((environmentId) =>
        queryClient.refetchQueries({
          queryKey: queryKeys.org(orgId).containers.list({ environmentId }),
        }),
      ),
    )
  }, [environmentIds, orgId, queryClient])

  const refetchOne = useCallback(
    async (environmentId: string) => {
      await queryClient.refetchQueries({
        queryKey: queryKeys.org(orgId).containers.list({ environmentId }),
      })
    },
    [orgId, queryClient],
  )

  return { containersByEnv, isLoading, refetchAll, refetchOne }
}

/** Per-service container maps (no auto-poll). */
export function useContainersByServices(
  orgId: string,
  serviceIds: readonly string[],
  options?: Readonly<{ enabled?: boolean }>,
) {
  const enabled = (options?.enabled ?? true) && orgId.length > 0
  const queries = useQueries({
    queries: serviceIds.map((serviceId) => ({
      queryKey: queryKeys.org(orgId).containers.list({ serviceId }),
      queryFn: () => fetchContainers({ serviceId }),
      enabled: enabled && serviceId.length > 0,
      refetchInterval: false as const,
    })),
  })

  const containersDataKey = queries
    .map((query) => query.dataUpdatedAt)
    .join(':')

  const containersByService = useMemo(() => {
    const map: Record<string, ContainerRecord[]> = {}
    for (let index = 0; index < serviceIds.length; index++) {
      const serviceId = serviceIds[index]
      if (!serviceId) continue
      map[serviceId] = queries[index]?.data?.containers ?? []
    }
    return map
    // eslint-disable-next-line react-hooks/exhaustive-deps -- containersDataKey tracks query data identity
  }, [serviceIds, containersDataKey])

  const isLoading =
    enabled && serviceIds.length > 0 && queries.some((query) => query.isLoading)

  const refetchAll = async () => {
    await Promise.all(queries.map((query) => query.refetch()))
  }

  return { containersByService, isLoading, refetchAll }
}

export type { ContainerListFilters }
