import type { RelayRecord, RelayRole } from './instance-api.ts'

/** Minimal server facts needed for primary-gateway resolution. */
export type MeshServerRef = {
  connected: boolean
  datacenterId: string | null
}

/** Site facts needed for site mesh labels. */
export type SiteLinkServerRef = {
  datacenterId: string | null
}

/**
 * Datacenters touched by fabric relays, plus whether any relay has no
 * datacenter. Used to summarize the org mesh on site cards.
 */
export type SiteLinkSites = {
  datacenterIds: string[]
  hasUnassignedPeers: boolean
}

/**
 * Collect the datacenters touched by TurboFabric relays. Relays without a
 * server (or with `datacenterId === null`) set `hasUnassignedPeers` rather
 * than inventing a site id.
 */
export function resolveSiteLinks(
  relays: readonly Pick<RelayRecord, 'serverId'>[],
  serverById: ReadonlyMap<string, SiteLinkServerRef>,
): SiteLinkSites {
  const ids = new Set<string>()
  let hasUnassignedPeers = false
  for (const relay of relays) {
    const server = serverById.get(relay.serverId)
    const datacenterId = server?.datacenterId ?? null
    if (!datacenterId) {
      hasUnassignedPeers = true
      continue
    }
    ids.add(datacenterId)
  }
  return {
    datacenterIds: [...ids].sort((a, b) => a.localeCompare(b)),
    hasUnassignedPeers,
  }
}

/**
 * Human label for a mesh's site endpoints, e.g. `AMS ↔ FRA`, `AMS ↔ 2 sites`,
 * or `Unassigned hosts` when no relay has a datacenter.
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

/** Label for a site card when this site participates in the org mesh. */
export function meshLabelForSite(
  siteId: string,
  mesh: SiteLinkSites,
  siteNameById: ReadonlyMap<string, string>,
): string | null {
  if (!mesh.datacenterIds.includes(siteId)) return null
  return formatSiteLinkLabel(mesh, siteNameById)
}

/**
 * One deterministic primary gateway per datacenter: first online gateway
 * (`server.connected`) by `serverId`, else first gateway overall.
 */
export function resolvePrimaryGatewayByDatacenter(
  relays: readonly Pick<RelayRecord, 'serverId' | 'role'>[],
  serverById: ReadonlyMap<string, MeshServerRef>,
): Map<string, string> {
  type Candidate = { serverId: string; online: boolean }
  const byDc = new Map<string, Candidate[]>()

  for (const relay of relays) {
    if (relay.role !== 'gateway') continue
    const server = serverById.get(relay.serverId)
    if (!server?.datacenterId) continue
    const list = byDc.get(server.datacenterId) ?? []
    list.push({
      serverId: relay.serverId,
      online: server.connected === true,
    })
    byDc.set(server.datacenterId, list)
  }

  const primary = new Map<string, string>()
  for (const [datacenterId, candidates] of byDc) {
    const sorted = [...candidates].sort((a, b) =>
      a.serverId.localeCompare(b.serverId),
    )
    const online = sorted.find((c) => c.online)
    const chosen = online ?? sorted[0]
    if (chosen) primary.set(datacenterId, chosen.serverId)
  }
  return primary
}

export function relayRoleLabel(role: RelayRole): string {
  if (role === 'gateway') return 'Gateway'
  return 'Member'
}
