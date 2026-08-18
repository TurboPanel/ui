import type {
  FabricRelayPathKind,
  FabricRelayPathState,
  RelayRecord,
  RelayRole,
  ServerDatacenterRef,
} from './instance-api.ts'

/** Minimal server facts needed for primary-gateway resolution. */
export type MeshServerRef = {
  connected: boolean
  datacenters: readonly ServerDatacenterRef[]
}

/** Site facts needed for site mesh labels. */
export type SiteLinkServerRef = {
  datacenters: readonly ServerDatacenterRef[]
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
 * server (or with an empty `datacenters[]`) set `hasUnassignedPeers` rather
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
    const memberships = server?.datacenters ?? []
    if (memberships.length === 0) {
      hasUnassignedPeers = true
      continue
    }
    for (const membership of memberships) {
      ids.add(membership.id)
    }
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
 * (`server.connected`) by `serverId`, else first gateway overall. A gateway
 * belonging to N datacenters is a candidate in each.
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
    const memberships = server?.datacenters ?? []
    if (!server || memberships.length === 0) continue
    for (const membership of memberships) {
      const list = byDc.get(membership.id) ?? []
      list.push({
        serverId: relay.serverId,
        online: server.connected === true,
      })
      byDc.set(membership.id, list)
    }
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

/**
 * Display string for a gateway's effective advertised CIDRs (operator
 * override when stored, otherwise derived IPv4 datacenter subnets).
 */
export function formatResolvedAdvertisedCidrs(
  cidrs: readonly string[],
): string {
  if (cidrs.length === 0) return 'none'
  return cidrs.join(', ')
}

export type FabricPathKindLabel =
  | 'Direct'
  | 'NAT direct'
  | 'Gateway'
  | 'Relayed'
  | 'Unreachable'

export type FabricPathMatrixRow = {
  fromServerId: string
  toServerId: string
  fromLabel: string
  toLabel: string
  kind: FabricRelayPathKind
  endpoint?: string
  viaServerId?: string
  viaLabel?: string
  latencyMs?: number
  lastHandshakeAt?: string
  degraded: boolean
}

export function fabricPathKindLabel(
  kind: FabricRelayPathKind,
): FabricPathKindLabel {
  if (kind === 'direct_nat') return 'NAT direct'
  if (kind === 'gateway') return 'Gateway'
  if (kind === 'relay') return 'Relayed'
  if (kind === 'unreachable') return 'Unreachable'
  return 'Direct'
}

export function fabricPathIsDegraded(
  row: Readonly<{ kind: FabricRelayPathKind; degraded?: boolean }>,
): boolean {
  if (row.kind === 'relay') return true
  return row.degraded === true
}

export function fabricPathViaLabel(
  viaServerId: string | undefined,
  serverNameById: ReadonlyMap<string, string>,
): string | undefined {
  if (!viaServerId) return undefined
  return serverNameById.get(viaServerId) ?? viaServerId
}

function serverLabel(
  serverId: string,
  serverNameById: ReadonlyMap<string, string>,
): string {
  return serverNameById.get(serverId) ?? serverId
}

function optionalPathFields(
  path: FabricRelayPathState,
  serverNameById: ReadonlyMap<string, string>,
): Partial<FabricPathMatrixRow> {
  const fields: Partial<FabricPathMatrixRow> = {}
  if (path.endpoint) fields.endpoint = path.endpoint
  if (path.viaServerId) {
    fields.viaServerId = path.viaServerId
    fields.viaLabel = fabricPathViaLabel(path.viaServerId, serverNameById)
  }
  if (path.latencyMs !== undefined) fields.latencyMs = path.latencyMs
  if (path.lastHandshakeAt) fields.lastHandshakeAt = path.lastHandshakeAt
  return fields
}

function fabricPathMatrixRow(
  fromServerId: string,
  path: FabricRelayPathState,
  serverNameById: ReadonlyMap<string, string>,
): FabricPathMatrixRow {
  return {
    fromServerId,
    toServerId: path.peerServerId,
    fromLabel: serverLabel(fromServerId, serverNameById),
    toLabel: serverLabel(path.peerServerId, serverNameById),
    kind: path.selected,
    degraded: fabricPathIsDegraded({
      kind: path.selected,
      degraded: path.degraded,
    }),
    ...optionalPathFields(path, serverNameById),
  }
}

function comparePathMatrixRows(
  a: FabricPathMatrixRow,
  b: FabricPathMatrixRow,
): number {
  const from = a.fromLabel.localeCompare(b.fromLabel)
  if (from !== 0) return from
  return a.toLabel.localeCompare(b.toLabel)
}

/**
 * Flatten each relay's `paths[]` into a deterministic peer-path matrix.
 */
export function buildFabricPathMatrix(
  relays: readonly RelayRecord[],
  serverNameById: ReadonlyMap<string, string>,
): FabricPathMatrixRow[] {
  const rows: FabricPathMatrixRow[] = []
  for (const relay of relays) {
    for (const path of relay.paths) {
      rows.push(fabricPathMatrixRow(relay.serverId, path, serverNameById))
    }
  }
  rows.sort(comparePathMatrixRows)
  return rows
}

/**
 * Unique gateway-kind via labels for a relay, sorted for display.
 */
export function fabricRoutedViaLabels(
  relay: Pick<RelayRecord, 'paths'>,
  serverNameById: ReadonlyMap<string, string>,
): string[] {
  const labels: string[] = []
  const seen = new Set<string>()
  for (const path of relay.paths) {
    if (path.selected !== 'gateway' || !path.viaServerId) continue
    if (seen.has(path.viaServerId)) continue
    seen.add(path.viaServerId)
    labels.push(
      fabricPathViaLabel(path.viaServerId, serverNameById) ?? path.viaServerId,
    )
  }
  return labels.sort((a, b) => a.localeCompare(b))
}
