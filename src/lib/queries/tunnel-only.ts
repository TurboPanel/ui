import { useQueries } from '@tanstack/react-query'
import { fetchTunnelHostnames } from '@/lib/instance-api'
import { queryKeys } from '@/lib/query-client'
import { useTunnels } from '@/lib/queries/tunnel-routes'
import { useHostingCertificate } from '@/lib/queries/hosting-certificate'
import { tunnelOnlyOf, type TunnelOnly } from '@/lib/hosting-tunnel'

/**
 * Names the organization's tunnels carry as tunnel-only (lock on), lower case,
 * to the tunnel's name. Owners and managers only: others get an empty map, and
 * a saved hosting still reports its own tunnel paths.
 */
export function useTunnelOnlyNames(orgId: string): ReadonlyMap<string, string> {
  const tunnels = useTunnels(orgId).data?.tunnels ?? []
  const lists = useQueries({
    queries: tunnels.map((tunnel) => ({
      queryKey: queryKeys.org(orgId).tunnelHostnames(tunnel.id),
      queryFn: () => fetchTunnelHostnames(orgId, tunnel.id),
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
  names: readonly string[]
): TunnelOnly | null {
  const lookup = useTunnelOnlyNames(orgId)
  const hosting = useHostingCertificate(orgId, hostingId).data?.hosting
  return tunnelOnlyOf(names, lookup, hosting)
}
