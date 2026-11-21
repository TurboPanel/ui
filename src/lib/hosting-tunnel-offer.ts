/**
 * What the Hosting tab can offer for a name no tunnel carries: put it on a
 * tunnel that runs on the environment's server, through the same call the
 * Network page uses.
 */
import type { TunnelRecord } from '@/lib/instance-api'

/** The tunnels the organization could put a name of this environment on. */
export function tunnelsForServer<T extends Pick<TunnelRecord, 'status' | 'carryingServerIds'>>(
  tunnels: readonly T[],
  serverId: string | null
): T[] {
  if (!serverId) return []
  return tunnels.filter(
    (tunnel) => tunnel.status !== 'removing' && tunnel.carryingServerIds.includes(serverId)
  )
}

export const SERVE_THROUGH_TUNNEL_LABEL = 'Serve Through Tunnel'

/** The short hint under a name no tunnel carries and none can. */
export function noTunnelHint(input: { serverKnown: boolean; tunnelCount: number }): string {
  if (!input.serverKnown) {
    return 'Pick a server for this environment to see which tunnels could carry this name.'
  }
  if (input.tunnelCount === 0) {
    return 'No tunnel exists yet. Add one under Network, then Tunnels, to serve this name through Cloudflare.'
  }
  return 'No tunnel runs on this environment’s server. Place a tunnel on it under Network, then Tunnels.'
}
