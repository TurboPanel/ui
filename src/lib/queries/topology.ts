import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  addDatacenterMembers,
  createDatacenter,
  createDatacenterSubnet,
  createIp,
  createNetwork,
  deleteDatacenter,
  deleteDatacenterSubnet,
  deleteIp,
  deleteNetwork,
  fetchDatacenter,
  fetchDatacenterNameSuggestions,
  fetchDatacenters,
  fetchIp,
  fetchIps,
  fetchNetworks,
  removeDatacenterMember,
  updateDatacenter,
  updateDatacenterSubnet,
  updateIp,
  updateNetwork,
} from '@/lib/instance-api'
import { useApiMutation, queryKeys } from '@/lib/query-client'
import { type IpListFilters, type NetworkListFilters } from '@/lib/query-keys'

type FetchIpFilters = NonNullable<Parameters<typeof fetchIps>[0]>
type FetchNetworkFilters = NonNullable<Parameters<typeof fetchNetworks>[0]>

function toFetchIpFilters(filters?: IpListFilters): FetchIpFilters | undefined {
  if (!filters) return undefined
  const { organizationId: _organizationId, ...rest } = filters
  return rest as FetchIpFilters
}

function toFetchNetworkFilters(
  filters?: NetworkListFilters,
): FetchNetworkFilters | undefined {
  if (!filters) return undefined
  const { organizationId: _organizationId, ...rest } = filters
  return rest as FetchNetworkFilters
}

export function useDatacenters(
  orgId: string,
  options?: Readonly<{ enabled?: boolean }>,
) {
  return useQuery({
    queryKey: queryKeys.org(orgId).topology.datacenters,
    queryFn: fetchDatacenters,
    enabled: (options?.enabled ?? true) && orgId.length > 0,
  })
}

export function useDatacenter(
  orgId: string,
  datacenterId: string,
  options?: Readonly<{ enabled?: boolean }>,
) {
  return useQuery({
    queryKey: queryKeys.org(orgId).topology.datacenter(datacenterId),
    queryFn: () => fetchDatacenter(datacenterId),
    enabled:
      (options?.enabled ?? true) &&
      orgId.length > 0 &&
      datacenterId.length > 0,
  })
}

export function useDatacenterNameSuggestions(
  orgId: string,
  options?: Readonly<{ enabled?: boolean; limit?: number }>,
) {
  const limit = options?.limit
  return useQuery({
    queryKey: queryKeys.org(orgId).topology.nameSuggestions,
    queryFn: () =>
      fetchDatacenterNameSuggestions(
        limit === undefined ? undefined : { limit },
      ),
    enabled: (options?.enabled ?? true) && orgId.length > 0,
  })
}

/**
 * Filtered IP lists use `keepPreviousData` so scope/filter changes do not flash
 * empty while the next page loads.
 */
export function useIps(
  orgId: string,
  filters?: IpListFilters,
  options?: Readonly<{ enabled?: boolean; keepPreviousData?: boolean }>,
) {
  const useKeepPrevious =
    options?.keepPreviousData ?? Boolean(filters && Object.keys(filters).length > 0)

  return useQuery({
    queryKey: queryKeys.org(orgId).topology.ips(filters),
    queryFn: () => fetchIps(toFetchIpFilters(filters)),
    enabled: (options?.enabled ?? true) && orgId.length > 0,
    ...(useKeepPrevious ? { placeholderData: keepPreviousData } : {}),
  })
}

export function useIp(
  orgId: string,
  ipId: string,
  options?: Readonly<{ enabled?: boolean }>,
) {
  return useQuery({
    queryKey: queryKeys.org(orgId).topology.ip(ipId),
    queryFn: () => fetchIp(ipId),
    enabled:
      (options?.enabled ?? true) && orgId.length > 0 && ipId.length > 0,
  })
}

/**
 * Filtered network lists use `keepPreviousData` so kind/filter changes do not
 * flash empty while the next page loads.
 */
export function useNetworks(
  orgId: string,
  filters?: NetworkListFilters,
  options?: Readonly<{ enabled?: boolean; keepPreviousData?: boolean }>,
) {
  const useKeepPrevious =
    options?.keepPreviousData ?? Boolean(filters && Object.keys(filters).length > 0)

  return useQuery({
    queryKey: queryKeys.org(orgId).topology.networks(filters),
    queryFn: () => fetchNetworks(toFetchNetworkFilters(filters)),
    enabled: (options?.enabled ?? true) && orgId.length > 0,
    ...(useKeepPrevious ? { placeholderData: keepPreviousData } : {}),
  })
}

export function useCreateDatacenter(orgId: string) {
  const queryClient = useQueryClient()
  return useApiMutation({
    mutationFn: createDatacenter,
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({
          queryKey: queryKeys.org(orgId).topology.datacenters,
        }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.org(orgId).topology.nameSuggestions,
        }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.org(orgId).servers.list,
        }),
      ]),
  })
}

export function useUpdateDatacenter(orgId: string, datacenterId: string) {
  const queryClient = useQueryClient()
  return useApiMutation({
    mutationFn: (body: Parameters<typeof updateDatacenter>[1]) =>
      updateDatacenter(datacenterId, body),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({
          queryKey: queryKeys.org(orgId).topology.datacenter(datacenterId),
        }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.org(orgId).topology.datacenters,
        }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.org(orgId).servers.list,
        }),
        queryClient.invalidateQueries({
          queryKey: ['org', orgId, 'server'],
        }),
      ]),
  })
}

export function useDeleteDatacenter(orgId: string) {
  const queryClient = useQueryClient()
  return useApiMutation({
    mutationFn: deleteDatacenter,
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: queryKeys.org(orgId).topology.all,
      }),
  })
}

export function useAddDatacenterMembers(orgId: string, datacenterId: string) {
  const queryClient = useQueryClient()
  return useApiMutation({
    mutationFn: (members: Array<{ serverId: string; address: string }>) =>
      addDatacenterMembers(datacenterId, members),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({
          queryKey: queryKeys.org(orgId).topology.datacenter(datacenterId),
        }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.org(orgId).topology.datacenters,
        }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.org(orgId).servers.list,
        }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.org(orgId).topology.all,
        }),
      ]),
  })
}

export function useRemoveDatacenterMember(orgId: string, datacenterId: string) {
  const queryClient = useQueryClient()
  return useApiMutation({
    mutationFn: (serverId: string) =>
      removeDatacenterMember(datacenterId, serverId),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({
          queryKey: queryKeys.org(orgId).topology.datacenter(datacenterId),
        }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.org(orgId).topology.datacenters,
        }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.org(orgId).servers.list,
        }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.org(orgId).topology.all,
        }),
      ]),
  })
}

function invalidateDatacenterSubnetQueries(
  queryClient: ReturnType<typeof useQueryClient>,
  orgId: string,
  datacenterId: string,
) {
  return Promise.all([
    queryClient.invalidateQueries({
      queryKey: queryKeys.org(orgId).topology.datacenter(datacenterId),
    }),
    queryClient.invalidateQueries({
      queryKey: queryKeys.org(orgId).topology.datacenters,
    }),
    queryClient.invalidateQueries({
      queryKey: queryKeys.org(orgId).topology.networksAll,
    }),
  ])
}

export function useCreateDatacenterSubnet(orgId: string, datacenterId: string) {
  const queryClient = useQueryClient()
  return useApiMutation({
    mutationFn: (body: Parameters<typeof createDatacenterSubnet>[1]) =>
      createDatacenterSubnet(datacenterId, body),
    onSuccess: () =>
      invalidateDatacenterSubnetQueries(queryClient, orgId, datacenterId),
  })
}

export function useUpdateDatacenterSubnet(orgId: string, datacenterId: string) {
  const queryClient = useQueryClient()
  return useApiMutation({
    mutationFn: ({
      networkId,
      body,
    }: {
      networkId: string
      body: Parameters<typeof updateDatacenterSubnet>[2]
    }) => updateDatacenterSubnet(datacenterId, networkId, body),
    onSuccess: () =>
      invalidateDatacenterSubnetQueries(queryClient, orgId, datacenterId),
  })
}

export function useDeleteDatacenterSubnet(orgId: string, datacenterId: string) {
  const queryClient = useQueryClient()
  return useApiMutation({
    mutationFn: (networkId: string) =>
      deleteDatacenterSubnet(datacenterId, networkId),
    onSuccess: () =>
      invalidateDatacenterSubnetQueries(queryClient, orgId, datacenterId),
  })
}

export function useCreateIp(orgId: string) {
  const queryClient = useQueryClient()
  return useApiMutation({
    mutationFn: createIp,
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: queryKeys.org(orgId).topology.all,
      }),
  })
}

export function useUpdateIp(orgId: string) {
  const queryClient = useQueryClient()
  return useApiMutation({
    mutationFn: ({
      ipId,
      body,
    }: {
      ipId: string
      body: Parameters<typeof updateIp>[1]
    }) => updateIp(ipId, body),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: queryKeys.org(orgId).topology.all,
      }),
  })
}

export function useDeleteIp(orgId: string) {
  const queryClient = useQueryClient()
  return useApiMutation({
    mutationFn: deleteIp,
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: queryKeys.org(orgId).topology.all,
      }),
  })
}

export function useCreateNetwork(orgId: string) {
  const queryClient = useQueryClient()
  return useApiMutation({
    mutationFn: createNetwork,
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: queryKeys.org(orgId).topology.all,
      }),
  })
}

export function useUpdateNetwork(orgId: string) {
  const queryClient = useQueryClient()
  return useApiMutation({
    mutationFn: ({
      networkId,
      body,
    }: {
      networkId: string
      body: Parameters<typeof updateNetwork>[1]
    }) => updateNetwork(networkId, body),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: queryKeys.org(orgId).topology.all,
      }),
  })
}

export function useDeleteNetwork(orgId: string) {
  const queryClient = useQueryClient()
  return useApiMutation({
    mutationFn: deleteNetwork,
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: queryKeys.org(orgId).topology.all,
      }),
  })
}

export type { IpListFilters, NetworkListFilters }
