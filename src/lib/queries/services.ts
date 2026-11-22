import { useQueries, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { useMemo } from 'react'
import {
  createHosting,
  createService,
  fetchVisibleHostings,
  fetchVisibleServices,
  releaseHostingFromCompose,
  removeHostingNow,
  updateHosting,
  updateService,
  type HostingNameCertificate,
  type HostingNameChoice,
  type HostingRecord,
} from '@/lib/instance-api'
import { withSavedNames } from '@/lib/name-certificates'
import { useApiMutation, queryKeys } from '@/lib/query-client'

export function useServices(
  orgId: string,
  environmentId?: string,
  options?: Readonly<{ enabled?: boolean; refetchInterval?: number | false }>
) {
  return useQuery({
    queryKey: queryKeys.org(orgId).services.list(environmentId),
    queryFn: () => fetchVisibleServices(environmentId),
    enabled: (options?.enabled ?? true) && orgId.length > 0,
    refetchInterval: options?.refetchInterval ?? false,
  })
}

export function useHostings(
  orgId: string,
  serviceId: string,
  options?: Readonly<{ enabled?: boolean }>
) {
  return useQuery({
    queryKey: queryKeys.org(orgId).hostings.list(serviceId),
    queryFn: () => fetchVisibleHostings(serviceId),
    enabled: (options?.enabled ?? true) && orgId.length > 0 && serviceId.length > 0,
  })
}

export function useCreateService(orgId: string) {
  const queryClient = useQueryClient()
  return useApiMutation({
    mutationFn: ({
      environmentId,
      body,
    }: {
      environmentId: string
      body: Parameters<typeof createService>[1]
    }) => createService(environmentId, body),
    onSuccess: async (_data, variables) => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.org(orgId).services.list(variables.environmentId),
      })
    },
  })
}

export function useUpdateService(orgId: string, serviceId: string) {
  const queryClient = useQueryClient()
  return useApiMutation({
    mutationFn: (body: Parameters<typeof updateService>[1]) => updateService(serviceId, body),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: queryKeys.org(orgId).services.all,
        }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.org(orgId).hostings.all,
        }),
      ])
    },
  })
}

/**
 * Put the names a save answered into the cached hosting, so the result shows
 * at once; the refetch that follows only confirms it.
 */
export function showSavedNames(
  queryClient: QueryClient,
  orgId: string,
  serviceId: string,
  hostingId: string | undefined,
  names: HostingNameCertificate[] | undefined
): void {
  if (!names || !hostingId) return
  queryClient.setQueryData<{ hostings: HostingRecord[] }>(
    queryKeys.org(orgId).hostings.list(serviceId),
    (current) =>
      current && {
        ...current,
        hostings: current.hostings.map((item) =>
          item.id === hostingId ? withSavedNames(item, names) : item
        ),
      }
  )
  queryClient.setQueryData<{ hosting: HostingRecord }>(
    queryKeys.org(orgId).hostings.detail(hostingId),
    (current) => current && { ...current, hosting: withSavedNames(current.hosting, names) }
  )
}

export function useCreateHosting(orgId: string, serviceId: string) {
  const queryClient = useQueryClient()
  return useApiMutation({
    mutationFn: (body: Parameters<typeof createHosting>[1]) => createHosting(serviceId, body),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.org(orgId).hostings.list(serviceId),
      })
    },
  })
}

export function useUpdateHosting(orgId: string, serviceId: string) {
  const queryClient = useQueryClient()
  return useApiMutation({
    mutationFn: ({
      hostingId,
      body,
    }: {
      hostingId: string
      body: Parameters<typeof updateHosting>[1]
    }) => updateHosting(hostingId, body),
    onSuccess: async (data, variables) => {
      showSavedNames(queryClient, orgId, serviceId, variables.hostingId, data.names)
      await queryClient.invalidateQueries({
        queryKey: queryKeys.org(orgId).hostings.list(serviceId),
      })
    },
  })
}

export type UpsertHostingInput = Readonly<{
  serviceId: string
  hostingId?: string
  body: {
    name?: string
    description?: string
    metadata?: Record<string, unknown>
    options?: Record<string, unknown>
    tlsId?: string | null
    ipId?: string | null
    names?: HostingNameChoice[]
  }
}>

/** Create or update the first hosting row for a service. */
export function useUpsertHosting(orgId: string) {
  const queryClient = useQueryClient()
  return useApiMutation({
    mutationFn: ({ serviceId, hostingId, body }: UpsertHostingInput) =>
      hostingId ? updateHosting(hostingId, body) : createHosting(serviceId, body),
    onSuccess: async (data, variables) => {
      showSavedNames(queryClient, orgId, variables.serviceId, variables.hostingId, data.names)
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: queryKeys.org(orgId).hostings.list(variables.serviceId),
        }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.org(orgId).services.all,
        }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.org(orgId).containers.all,
        }),
      ])
    },
    fallbackError: 'Failed to save hosting',
  })
}

/** Release a compose-made hosting to the panel; refreshes that service's hostings (or all). */
export function useReleaseHostingFromCompose(orgId: string) {
  const queryClient = useQueryClient()
  return useApiMutation({
    mutationFn: ({ hostingId }: { hostingId: string; serviceId?: string }) =>
      releaseHostingFromCompose(hostingId),
    // Every hosting list when the service is not known, so the moved row still shows.
    onSuccess: async (_data, variables) => {
      await queryClient.invalidateQueries({
        queryKey: variables.serviceId
          ? queryKeys.org(orgId).hostings.list(variables.serviceId)
          : queryKeys.org(orgId).hostings.all,
      })
    },
    fallbackError: 'Failed to move the hostname to this screen',
  })
}

/** Release a removed hostname at once; refreshes that service's hostings (or all). */
export function useRemoveHostingNow(orgId: string) {
  const queryClient = useQueryClient()
  return useApiMutation({
    mutationFn: ({ hostingId }: { hostingId: string; serviceId?: string }) =>
      removeHostingNow(hostingId),
    onSuccess: async (_data, variables) => {
      await queryClient.invalidateQueries({
        queryKey: variables.serviceId
          ? queryKeys.org(orgId).hostings.list(variables.serviceId)
          : queryKeys.org(orgId).hostings.all,
      })
    },
    fallbackError: 'Failed to release the hostname',
  })
}

/** Per-service hosting lists keyed by service id. */
export function useHostingsByServices(
  orgId: string,
  serviceIds: readonly string[],
  options?: Readonly<{ enabled?: boolean }>
) {
  const enabled = (options?.enabled ?? true) && orgId.length > 0
  const queries = useQueries({
    queries: serviceIds.map((serviceId) => ({
      queryKey: queryKeys.org(orgId).hostings.list(serviceId),
      queryFn: () => fetchVisibleHostings(serviceId),
      enabled: enabled && serviceId.length > 0,
    })),
  })

  // Depend on each query's data (stable) — not the `queries` array, which is a
  // new reference every render from useQueries and would thrash consumers.
  const hostingsDataKey = queries.map((query) => query.dataUpdatedAt).join(':')

  const hostingsByService = useMemo(() => {
    const map: Record<string, HostingRecord[]> = {}
    for (let index = 0; index < serviceIds.length; index++) {
      const serviceId = serviceIds[index]
      if (!serviceId) continue
      map[serviceId] = queries[index]?.data?.hostings ?? []
    }
    return map
    // eslint-disable-next-line react-hooks/exhaustive-deps -- hostingsDataKey tracks query data identity
  }, [serviceIds, hostingsDataKey])

  const isLoading = enabled && serviceIds.length > 0 && queries.some((query) => query.isLoading)

  const hasError = enabled && queries.some((query) => query.isError)

  const refetchAll = async () => {
    await Promise.all(queries.map((query) => query.refetch()))
  }

  return { hostingsByService, isLoading, hasError, refetchAll }
}

/** Per-environment service lists keyed by environment id. */
export function useServicesByEnvironments(
  orgId: string,
  environmentIds: readonly string[],
  options?: Readonly<{ enabled?: boolean }>
) {
  const enabled = (options?.enabled ?? true) && orgId.length > 0
  const queries = useQueries({
    queries: environmentIds.map((environmentId) => ({
      queryKey: queryKeys.org(orgId).services.list(environmentId),
      queryFn: () => fetchVisibleServices(environmentId),
      enabled: enabled && environmentId.length > 0,
    })),
  })

  const servicesDataKey = queries.map((query) => query.dataUpdatedAt).join(':')

  const servicesByEnv = useMemo(() => {
    const map: Record<string, Awaited<ReturnType<typeof fetchVisibleServices>>['services']> = {}
    for (let index = 0; index < environmentIds.length; index++) {
      const environmentId = environmentIds[index]
      if (!environmentId) continue
      map[environmentId] = queries[index]?.data?.services ?? []
    }
    return map
    // eslint-disable-next-line react-hooks/exhaustive-deps -- servicesDataKey tracks query data identity
  }, [environmentIds, servicesDataKey])

  const isLoading = enabled && environmentIds.length > 0 && queries.some((query) => query.isLoading)

  return { servicesByEnv, isLoading }
}
