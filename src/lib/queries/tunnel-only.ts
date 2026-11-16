import { useQueries } from '@tanstack/react-query'
import { tunnelOnlyOf, type TunnelOnly } from '@/lib/hosting-tunnel'
import { fetchTunnelHostnames } from '@/lib/instance-api'
import { useHostingCertificate } from '@/lib/queries/hosting-certificate'
import { useTunnels } from '@/lib/queries/tunnel-routes'
import { queryKeys, useCan } from '@/lib/query-client'

/**
 * Names the organization's tunnels carry as tunnel-only (lock on), lower case,
 * to the tunnel's name. Owners and managers only: for others no tunnel or
 * hostname request is sent and the map is empty, and a saved hosting still
 * reports its own tunnel paths.
 */
export function useTunnelOnlyNames(orgId: string): ReadonlyMap<string, string> {
  const canManage = useCan('organization', orgId, 'organization:manage')
  const tunnels = useTunnels(orgId, { enabled: canManage }).data?.tunnels ?? []
  const lists = useQueries({
    queries: tunnels.map((tunnel) => ({
      queryKey: queryKeys.org(orgId).tunnelHostnames(tunnel.id),
      queryFn: () => fetchTunnelHostnames(orgId, tunnel.id),
      enabled: canManage,
      refetchInterval: 30_000,
    })),
  })
  const names = new Map<string, string>()
  lists.forEach((list, index) => {
    for (const record of list.data?.hostnames ?? []) {
      if (record.isLocalOnly && record.status !== 'removing') {
        names.set(record.hostname.toLowerCase(), tunnels[index]?.name ?? '')
      }
    }
  })
  return names
}

/** Whether a hosting row's typed names are all tunnel-only, and through which tunnels. */
export function useHostingTunnelOnly(
  orgId: string,
  hostingId: string | null,
  names: readonly string[],
  /** Read the saved hosting's own tunnel paths: only a row that is open needs them. */
  readHosting: boolean
): TunnelOnly | null {
  const lookup = useTunnelOnlyNames(orgId)
  const hosting = useHostingCertificate(orgId, hostingId, { enabled: readHosting }).data?.hosting
  return tunnelOnlyOf(names, lookup, hosting)
}
