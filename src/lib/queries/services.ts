import { useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo } from 'react'
import {
  createHosting,
  createService,
  fetchVisibleHostings,
  fetchVisibleServices,
  updateHosting,
  updateService,
  type HostingRecord,
} from '@/lib/instance-api'
import { useApiMutation, queryKeys } from '@/lib/query-client'

export function useServices(
  orgId: string,
  environmentId?: string,
  options?: Readonly<{ enabled?: boolean }>,
) {
  return useQuery({
    queryKey: queryKeys.org(orgId).services.list(environmentId),
    queryFn: () => fetchVisibleServices(environmentId),
    enabled: (options?.enabled ?? true) && orgId.length > 0,
  })
}

export function useHostings(
  orgId: string,
  serviceId: string,
  options?: Readonly<{ enabled?: boolean }>,
) {
  return useQuery({
    queryKey: queryKeys.org(orgId).hostings.list(serviceId),
    queryFn: () => fetchVisibleHostings(serviceId),
    enabled:
      (options?.enabled ?? true) &&
      orgId.length > 0 &&
      serviceId.length > 0,
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
    mutationFn: (body: Parameters<typeof updateService>[1]) =>
      updateService(serviceId, body),
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

export function useCreateHosting(orgId: string, serviceId: string) {
  const queryClient = useQueryClient()
  return useApiMutation({
    mutationFn: (body: Parameters<typeof createHosting>[1]) =>
      createHosting(serviceId, body),
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
    onSuccess: async () => {
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
  }
}>

/** Create or update the first hosting row for a service. */
export function useUpsertHosting(orgId: string) {
  const queryClient = useQueryClient()
  return useApiMutation({
    mutationFn: ({ serviceId, hostingId, body }: UpsertHostingInput) =>
      hostingId
        ? updateHosting(hostingId, body)
        : createHosting(serviceId, body),
    onSuccess: async (_data, variables) => {
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

/** Per-service hosting lists keyed by service id. */
export function useHostingsByServices(
  orgId: string,
  serviceIds: readonly string[],
  options?: Readonly<{ enabled?: boolean }>,
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
  const hostingsDataKey = queries
    .map((query) => query.dataUpdatedAt)
    .join(':')

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

  const isLoading =
    enabled && serviceIds.length > 0 && queries.some((query) => query.isLoading)

  const refetchAll = async () => {
    await Promise.all(queries.map((query) => query.refetch()))
  }

  return { hostingsByService, isLoading, refetchAll }
}

/** Per-environment service lists keyed by environment id. */
export function useServicesByEnvironments(
  orgId: string,
  environmentIds: readonly string[],
  options?: Readonly<{ enabled?: boolean }>,
) {
  const enabled = (options?.enabled ?? true) && orgId.length > 0
  const queries = useQueries({
    queries: environmentIds.map((environmentId) => ({
      queryKey: queryKeys.org(orgId).services.list(environmentId),
      queryFn: () => fetchVisibleServices(environmentId),
      enabled: enabled && environmentId.length > 0,
    })),
  })

  const servicesDataKey = queries
    .map((query) => query.dataUpdatedAt)
    .join(':')

  const servicesByEnv = useMemo(() => {
    const map: Record<string, Awaited<ReturnType<typeof fetchVisibleServices>>['services']> =
      {}
    for (let index = 0; index < environmentIds.length; index++) {
      const environmentId = environmentIds[index]
      if (!environmentId) continue
      map[environmentId] = queries[index]?.data?.services ?? []
    }
    return map
    // eslint-disable-next-line react-hooks/exhaustive-deps -- servicesDataKey tracks query data identity
  }, [environmentIds, servicesDataKey])

  const isLoading =
    enabled &&
    environmentIds.length > 0 &&
    queries.some((query) => query.isLoading)

  return { servicesByEnv, isLoading }
}
