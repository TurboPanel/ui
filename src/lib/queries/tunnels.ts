import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  addTunnelBadge,
  addTunnelBadgeZone,
  removeTunnelBadgeZone,
  type TunnelZoneBody,
  checkTunnelBadge,
  connectTunnelCarrier,
  deleteTunnelBadge,
  deleteTunnelCarrier,
  fetchTunnelCarriers,
  isForbiddenError,
  type ConnectTunnelCarrierBody,
} from '@/lib/instance-api'
import { queryKeys, useApiMutation } from '@/lib/query-client'

/**
 * Connected Cloudflare accounts with their API tokens. Owners and managers
 * only: a refusal reads as an empty list so the global 403 handler is not
 * invoked for a role check the screen already shows.
 */
export function useTunnelCarriers(orgId: string, options?: Readonly<{ enabled?: boolean }>) {
  return useQuery({
    queryKey: queryKeys.org(orgId).tunnelCarriers,
    queryFn: async () => {
      try {
        return await fetchTunnelCarriers(orgId)
      } catch (err) {
        if (isForbiddenError(err)) return { carriers: [] }
        throw err
      }
    },
    enabled: (options?.enabled ?? true) && orgId.length > 0,
  })
}

function useInvalidateCarriers(orgId: string) {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: queryKeys.org(orgId).tunnelCarriers })
}

export function useConnectTunnelCarrier(orgId: string) {
  const invalidate = useInvalidateCarriers(orgId)
  return useApiMutation({
    mutationFn: (body: ConnectTunnelCarrierBody) => connectTunnelCarrier(orgId, body),
    retry: false,
    onSuccess: invalidate,
    fallbackError: 'Failed to connect the Cloudflare account',
  })
}

export function useAddTunnelBadge(orgId: string, carrierId: string) {
  const invalidate = useInvalidateCarriers(orgId)
  return useApiMutation({
    mutationFn: (body: { label: string; token: string; zones?: TunnelZoneBody[] }) =>
      addTunnelBadge(orgId, carrierId, body),
    retry: false,
    onSuccess: invalidate,
    fallbackError: 'Failed to add the API Token',
  })
}

export function useCheckTunnelBadge(orgId: string, carrierId: string) {
  const invalidate = useInvalidateCarriers(orgId)
  return useApiMutation({
    mutationFn: (badgeId: string) => checkTunnelBadge(orgId, carrierId, badgeId),
    retry: false,
    onSuccess: invalidate,
    fallbackError: 'Failed to check the API Token',
  })
}

export function useAddTunnelBadgeZone(orgId: string, carrierId: string, badgeId: string) {
  const invalidate = useInvalidateCarriers(orgId)
  return useApiMutation({
    mutationFn: (body: TunnelZoneBody) => addTunnelBadgeZone(orgId, carrierId, badgeId, body),
    retry: false,
    onSuccess: invalidate,
    fallbackError: 'Failed to add the zone',
  })
}

export function useRemoveTunnelBadgeZone(orgId: string, carrierId: string, badgeId: string) {
  const invalidate = useInvalidateCarriers(orgId)
  return useApiMutation({
    mutationFn: (zoneId: string) => removeTunnelBadgeZone(orgId, carrierId, badgeId, zoneId),
    retry: false,
    onSuccess: invalidate,
    fallbackError: 'Failed to remove the zone',
  })
}

export function useDeleteTunnelBadge(orgId: string, carrierId: string) {
  const invalidate = useInvalidateCarriers(orgId)
  return useApiMutation({
    mutationFn: (badgeId: string) => deleteTunnelBadge(orgId, carrierId, badgeId),
    retry: false,
    onSuccess: invalidate,
    fallbackError: 'Failed to remove the API Token',
  })
}

export function useDeleteTunnelCarrier(orgId: string) {
  const invalidate = useInvalidateCarriers(orgId)
  return useApiMutation({
    mutationFn: (carrierId: string) => deleteTunnelCarrier(orgId, carrierId),
    retry: false,
    onSuccess: invalidate,
    fallbackError: 'Failed to remove the account',
  })
}
