import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  applyVpn,
  createDatacenter,
  createIp,
  createNetwork,
  createPeer,
  createVpn,
  deleteDatacenter,
  deleteIp,
  deleteNetwork,
  deletePeer,
  deleteVpn,
  fetchDatacenter,
  fetchDatacenterNameSuggestions,
  fetchDatacenters,
  fetchIp,
  fetchIps,
  fetchNetworks,
  fetchPeers,
  fetchVpn,
  fetchVpns,
  updateDatacenter,
  updateIp,
  updateNetwork,
  updatePeer,
  updateVpn,
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

export function useVpns(
  orgId: string,
  options?: Readonly<{ enabled?: boolean }>,
) {
  return useQuery({
    queryKey: queryKeys.org(orgId).topology.vpns,
    queryFn: fetchVpns,
    enabled: (options?.enabled ?? true) && orgId.length > 0,
  })
}

export function useVpn(
  orgId: string,
  vpnId: string,
  options?: Readonly<{ enabled?: boolean }>,
) {
  return useQuery({
    queryKey: queryKeys.org(orgId).topology.vpn(vpnId),
    queryFn: () => fetchVpn(vpnId),
    enabled:
      (options?.enabled ?? true) && orgId.length > 0 && vpnId.length > 0,
  })
}

export function usePeers(
  orgId: string,
  vpnId: string,
  options?: Readonly<{ enabled?: boolean }>,
) {
  return useQuery({
    queryKey: queryKeys.org(orgId).topology.peers(vpnId),
    queryFn: () => fetchPeers(vpnId),
    enabled:
      (options?.enabled ?? true) && orgId.length > 0 && vpnId.length > 0,
  })
}

export function peersQueryOptions(orgId: string, vpnId: string) {
  return {
    queryKey: queryKeys.org(orgId).topology.peers(vpnId),
    queryFn: () => fetchPeers(vpnId),
  } as const
}

export function useRenameVpn(orgId: string) {
  const queryClient = useQueryClient()
  return useApiMutation({
    mutationFn: ({ vpnId, name }: { vpnId: string; name: string }) =>
      updateVpn(vpnId, { displayName: name || null }),
    onSuccess: (_data, { vpnId }) =>
      Promise.all([
        queryClient.invalidateQueries({
          queryKey: queryKeys.org(orgId).topology.vpn(vpnId),
        }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.org(orgId).topology.vpns,
        }),
      ]),
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

export function useCreateVpn(orgId: string) {
  const queryClient = useQueryClient()
  return useApiMutation({
    mutationFn: createVpn,
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: queryKeys.org(orgId).topology.vpns,
      }),
  })
}

export function useUpdateVpn(orgId: string, vpnId: string) {
  const queryClient = useQueryClient()
  return useApiMutation({
    mutationFn: (body: Parameters<typeof updateVpn>[1]) =>
      updateVpn(vpnId, body),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({
          queryKey: queryKeys.org(orgId).topology.vpn(vpnId),
        }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.org(orgId).topology.vpns,
        }),
      ]),
  })
}

export function useDeleteVpn(orgId: string) {
  const queryClient = useQueryClient()
  return useApiMutation({
    mutationFn: deleteVpn,
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: queryKeys.org(orgId).topology.all,
      }),
  })
}

export function useCreatePeer(orgId: string, vpnId: string) {
  const queryClient = useQueryClient()
  return useApiMutation({
    mutationFn: (body: Parameters<typeof createPeer>[1]) =>
      createPeer(vpnId, body),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: queryKeys.org(orgId).topology.peers(vpnId),
      }),
  })
}

export function useUpdatePeer(orgId: string, vpnId: string) {
  const queryClient = useQueryClient()
  return useApiMutation({
    mutationFn: ({
      peerId,
      body,
    }: {
      peerId: string
      body: Parameters<typeof updatePeer>[2]
    }) => updatePeer(vpnId, peerId, body),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: queryKeys.org(orgId).topology.peers(vpnId),
      }),
  })
}

export function useDeletePeer(orgId: string, vpnId: string) {
  const queryClient = useQueryClient()
  return useApiMutation({
    mutationFn: (peerId: string) => deletePeer(vpnId, peerId),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: queryKeys.org(orgId).topology.peers(vpnId),
      }),
  })
}

export function useApplyVpn(orgId: string, vpnId: string) {
  const queryClient = useQueryClient()
  return useApiMutation({
    mutationFn: () => applyVpn(vpnId),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({
          queryKey: queryKeys.org(orgId).topology.vpn(vpnId),
        }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.org(orgId).topology.peers(vpnId),
        }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.org(orgId).commands.all,
        }),
      ]),
  })
}

export function useOverridePeerTunnelIp(orgId: string, vpnId: string) {
  const queryClient = useQueryClient()
  return useApiMutation({
    mutationFn: async ({
      peerId,
      address,
      serverId,
    }: {
      peerId: string
      address: string
      serverId: string
    }) => {
      const created = await createIp({
        address,
        scope: 'vpn',
        vpnId,
        allocation: 'dedicated',
        serverId,
      })
      try {
        await updatePeer(vpnId, peerId, { tunnelIpId: created.id })
      } catch (updateErr) {
        let released = true
        try {
          await deleteIp(created.id)
        } catch {
          released = false
        }
        if (!released) {
          const message =
            updateErr instanceof Error
              ? updateErr.message
              : 'Failed to override overlay address'
          throw new OverridePeerTunnelIpCleanupError(message, {
            cause: updateErr,
          })
        }
        throw updateErr
      }
    },
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: queryKeys.org(orgId).topology.all,
      }),
  })
}

/** Override createIp succeeded but peer attach + deleteIp cleanup both failed. */
export class OverridePeerTunnelIpCleanupError extends Error {
  readonly cleanupFailed = true as const

  constructor(originalMessage: string, options?: ErrorOptions) {
    super(
      `${originalMessage} The reserved overlay IP could not be released.`,
      options,
    )
    this.name = 'OverridePeerTunnelIpCleanupError'
  }
}

export type { IpListFilters, NetworkListFilters }
