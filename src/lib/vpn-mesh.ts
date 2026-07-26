import type { IpRecord, PeerRecord, PeerRole } from './instance-api.ts'

/** Minimal server facts needed for primary-gateway resolution. */
export type MeshServerRef = {
  connected: boolean
  datacenterId: string | null
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
