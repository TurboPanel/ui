import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  addTunnelHostname,
  createTunnel,
  deleteTunnel,
  fetchExistingOriginCertificates,
  fetchOriginCertificates,
  fetchTunnelHostnames,
  fetchTunnels,
  isForbiddenError,
  removeTunnelHostname,
  setServerTunnelCarrying,
  setTunnelVerifyOrigin,
  updateTunnelPlacement,
  type CreateTunnelBody,
  type TunnelPlacementBody,
  type TunnelVerifyOriginBody,
} from '@/lib/instance-api'
import { queryKeys, useApiMutation } from '@/lib/query-client'

/**
 * Tunnels of the organization. Owners and managers only: a refusal reads as an
 * empty list so the global 403 handler is not invoked for a role check the
 * screen already shows. Connector status moves on its own, so it refreshes
 * every half minute while the screen is open.
 */
export function useTunnels(orgId: string, options?: Readonly<{ enabled?: boolean }>) {
  return useQuery({
    queryKey: queryKeys.org(orgId).tunnels,
    queryFn: async () => {
      try {
        return await fetchTunnels(orgId)
      } catch (err) {
        if (isForbiddenError(err)) return { tunnels: [] }
        throw err
      }
    },
    enabled: (options?.enabled ?? true) && orgId.length > 0,
    refetchInterval: 30_000,
  })
}

export function useTunnelHostnames(
  orgId: string,
  tunnelId: string,
  options?: Readonly<{ enabled?: boolean }>
) {
  return useQuery({
    queryKey: queryKeys.org(orgId).tunnelHostnames(tunnelId),
    queryFn: () => fetchTunnelHostnames(orgId, tunnelId),
    enabled: (options?.enabled ?? true) && orgId.length > 0 && tunnelId.length > 0,
    refetchInterval: 30_000,
  })
}

/** Everything under `['org', orgId, 'tunnels']`: the list and each tunnel's hostnames. */
function useInvalidateTunnels(orgId: string) {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: queryKeys.org(orgId).tunnels })
}

export function useCreateTunnel(orgId: string) {
  const invalidate = useInvalidateTunnels(orgId)
  return useApiMutation({
    mutationFn: (body: CreateTunnelBody) => createTunnel(orgId, body),
    retry: false,
    onSuccess: invalidate,
    fallbackError: 'Failed to create the tunnel',
  })
}

export function useUpdateTunnelPlacement(orgId: string, tunnelId: string) {
  const invalidate = useInvalidateTunnels(orgId)
  return useApiMutation({
    mutationFn: (body: TunnelPlacementBody) => updateTunnelPlacement(orgId, tunnelId, body),
    retry: false,
    onSuccess: invalidate,
    fallbackError: 'Failed to change where the tunnel runs',
  })
}

export function useDeleteTunnel(orgId: string) {
  const invalidate = useInvalidateTunnels(orgId)
  return useApiMutation({
    mutationFn: (tunnelId: string) => deleteTunnel(orgId, tunnelId),
    retry: false,
    onSuccess: invalidate,
    fallbackError: 'Failed to remove the tunnel',
  })
}

export function useAddTunnelHostname(orgId: string, tunnelId: string) {
  const invalidate = useInvalidateTunnels(orgId)
  return useApiMutation({
    mutationFn: (body: { hostname: string; isLocalOnly?: boolean }) =>
      addTunnelHostname(orgId, tunnelId, body),
    retry: false,
    onSuccess: invalidate,
    fallbackError: 'Failed to add the hostname',
  })
}

export function useRemoveTunnelHostname(orgId: string, tunnelId: string) {
  const invalidate = useInvalidateTunnels(orgId)
  return useApiMutation({
    mutationFn: (hostnameId: string) => removeTunnelHostname(orgId, tunnelId, hostnameId),
    retry: false,
    onSuccess: invalidate,
    fallbackError: 'Failed to remove the hostname',
  })
}

/** Also refreshes the server list, whose options carry the setting. */
export function useSetServerTunnelCarrying(orgId: string) {
  const invalidate = useInvalidateTunnels(orgId)
  const queryClient = useQueryClient()
  return useApiMutation({
    mutationFn: (input: { serverId: string; carry: boolean }) =>
      setServerTunnelCarrying(orgId, input.serverId, input.carry),
    retry: false,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.org(orgId).servers.list })
      await invalidate()
    },
    fallbackError: 'Failed to change this server',
  })
}

export function useSetTunnelVerifyOrigin(orgId: string, tunnelId: string) {
  const invalidate = useInvalidateTunnels(orgId)
  return useApiMutation({
    mutationFn: (body: TunnelVerifyOriginBody) => setTunnelVerifyOrigin(orgId, tunnelId, body),
    retry: false,
    onSuccess: invalidate,
    fallbackError: 'Failed to change the verified connection',
  })
}

/** Origin certificates TurboPanel issued for one Cloudflare account. Owners and managers only. */
export function useOriginCertificates(orgId: string, carrierId: string) {
  return useQuery({
    queryKey: [...queryKeys.org(orgId).tunnels, 'origin-certificates', carrierId],
    queryFn: async () => {
      try {
        return await fetchOriginCertificates(orgId, carrierId)
      } catch (err) {
        if (isForbiddenError(err)) return { originCertificates: [] }
        throw err
      }
    },
    enabled: orgId.length > 0 && carrierId.length > 0,
  })
}

/** What the provider holds for a zone; only asked for after the person looks a zone up. */
export function useExistingOriginCertificates(orgId: string, carrierId: string, zone: string) {
  return useQuery({
    queryKey: [...queryKeys.org(orgId).tunnels, 'origin-certificates-existing', carrierId, zone],
    queryFn: () => fetchExistingOriginCertificates(orgId, carrierId, zone),
    enabled: orgId.length > 0 && carrierId.length > 0 && zone.length > 0,
    retry: false,
  })
}
