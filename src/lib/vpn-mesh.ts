import type { IpRecord, PeerRecord, PeerRole } from './instance-api.ts'

/** Minimal server facts needed for primary-gateway resolution. */
export type MeshServerRef = {
  connected: boolean
  datacenterId: string | null
}

/** Site facts needed for site-to-site link labels. */
export type SiteLinkServerRef = {
  datacenterId: string | null
}

/**
 * Per VPN: the set of datacenter ids its peers land in, plus whether any peer
 * has no datacenter. Used to render meshes as site-to-site connections.
 */
export type SiteLinkSites = {
  datacenterIds: string[]
  hasUnassignedPeers: boolean
}

/**
 * For each VPN in `vpns`, collect the datacenters touched by its peers.
 * Peers without a server (or with `datacenterId === null`) set
 * `hasUnassignedPeers` rather than inventing a site id.
 */
export function resolveSiteLinks(
  peers: readonly PeerRecord[],
  serverById: ReadonlyMap<string, SiteLinkServerRef>,
  vpns: readonly { id: string }[],
): Map<string, SiteLinkSites> {
  const peersByVpn = new Map<string, PeerRecord[]>()
  for (const peer of peers) {
    const list = peersByVpn.get(peer.vpnId) ?? []
    list.push(peer)
    peersByVpn.set(peer.vpnId, list)
  }

  const result = new Map<string, SiteLinkSites>()
  for (const vpn of vpns) {
    const vpnPeers = peersByVpn.get(vpn.id) ?? []
    const ids = new Set<string>()
    let hasUnassignedPeers = false
    for (const peer of vpnPeers) {
      const server = serverById.get(peer.serverId)
      const datacenterId = server?.datacenterId ?? null
      if (!datacenterId) {
        hasUnassignedPeers = true
        continue
      }
      ids.add(datacenterId)
    }
    result.set(vpn.id, {
      datacenterIds: [...ids].sort((a, b) => a.localeCompare(b)),
      hasUnassignedPeers,
    })
  }
  return result
}

/**
 * Human label for a mesh's site endpoints, e.g. `AMS ↔ FRA`, `AMS ↔ 2 sites`,
 * or `Unassigned hosts` when no peer has a datacenter.
 */
export function formatSiteLinkLabel(
  sites: SiteLinkSites,
  siteNameById: ReadonlyMap<string, string>,
): string {
  const names = sites.datacenterIds.map(
    (id) => siteNameById.get(id) ?? id,
  )
  if (names.length === 0) {
    return sites.hasUnassignedPeers ? 'Unassigned hosts' : 'No sites yet'
  }
  if (names.length === 1) {
    if (sites.hasUnassignedPeers) {
      return `${names[0]} ↔ Unassigned hosts`
    }
    return names[0]
  }
  if (names.length === 2) {
    return `${names[0]} ↔ ${names[1]}`
  }
  return `${names[0]} ↔ ${names.length - 1} sites`
}

/**
 * One deterministic primary gateway per datacenter: lowest `createdAt` among
 * online gateways (`server.connected`), else lowest `createdAt` overall.
 * Mirrors `resolvePrimaryGatewayByDatacenter` in the instance apply-prepare path.
 */
export function resolvePrimaryGatewayByDatacenter(
  peers: readonly PeerRecord[],
  serverById: ReadonlyMap<string, MeshServerRef>,
): Map<string, string> {
  type Candidate = { peerId: string; createdAt: string; online: boolean }
  const byDc = new Map<string, Candidate[]>()

  for (const peer of peers) {
    if (peer.role !== 'gateway') continue
    const server = serverById.get(peer.serverId)
    if (!server?.datacenterId) continue
    const list = byDc.get(server.datacenterId) ?? []
    list.push({
      peerId: peer.id,
      createdAt: peer.createdAt,
      online: server.connected === true,
    })
    byDc.set(server.datacenterId, list)
  }

  const primary = new Map<string, string>()
  for (const [datacenterId, candidates] of byDc) {
    const sorted = [...candidates].sort((a, b) =>
      a.createdAt.localeCompare(b.createdAt),
    )
    const online = sorted.find((c) => c.online)
    const chosen = online ?? sorted[0]
    if (chosen) primary.set(datacenterId, chosen.peerId)
  }
  return primary
}

export function peerRoleLabel(role: PeerRole): string {
  if (role === 'gateway') return 'Gateway'
  return 'Member'
}

export function overlayAddressForPeer(
  peer: PeerRecord,
  ipById: ReadonlyMap<string, IpRecord>,
): string | null {
  if (!peer.tunnelIpId) return null
  return ipById.get(peer.tunnelIpId)?.address ?? null
}
