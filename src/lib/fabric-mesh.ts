import type {
  FabricPairPath,
  FabricRelayPathKind,
  OrgFabricPairRecord,
  OrgFabricSettings,
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
  serverById: ReadonlyMap<string, SiteLinkServerRef>
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
  siteNameById: ReadonlyMap<string, string>
): string {
  const names = sites.datacenterIds.map((id) => siteNameById.get(id) ?? id)
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
  siteNameById: ReadonlyMap<string, string>
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
  serverById: ReadonlyMap<string, MeshServerRef>
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
    const sorted = [...candidates].sort((a, b) => a.serverId.localeCompare(b.serverId))
    const online = sorted.find((c) => c.online)
    const chosen = online ?? sorted[0]
    if (chosen) primary.set(datacenterId, chosen.serverId)
  }
  return primary
}

/** Whether a relay shares its datacenter's LAN ranges with the mesh. */
export function relayRoleLabel(role: RelayRole): string {
  if (role === 'gateway') return 'Shared'
  return 'Not Shared'
}

/**
 * Display string for a gateway's effective advertised CIDRs (operator
 * override when stored, otherwise derived IPv4 datacenter subnets).
 */
export function formatResolvedAdvertisedCidrs(cidrs: readonly string[]): string {
  if (cidrs.length === 0) return 'none'
  return cidrs.join(', ')
}

export type FabricPathKindLabel = 'Direct' | 'NAT direct' | 'Gateway' | 'Relayed' | 'Unreachable'

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

export function fabricPathKindLabel(kind: FabricRelayPathKind): FabricPathKindLabel {
  if (kind === 'direct_nat') return 'NAT direct'
  if (kind === 'gateway') return 'Gateway'
  if (kind === 'relay') return 'Relayed'
  if (kind === 'unreachable') return 'Unreachable'
  return 'Direct'
}

export function fabricPathIsDegraded(
  row: Readonly<{ kind: FabricRelayPathKind; degraded?: boolean }>
): boolean {
  if (row.kind === 'relay') return true
  return row.degraded === true
}

export function fabricPathViaLabel(
  viaServerId: string | undefined,
  serverNameById: ReadonlyMap<string, string>
): string | undefined {
  if (!viaServerId) return undefined
  return serverNameById.get(viaServerId) ?? viaServerId
}

function serverLabel(serverId: string, serverNameById: ReadonlyMap<string, string>): string {
  return serverNameById.get(serverId) ?? serverId
}

function optionalPathFields(
  path: FabricRelayPathState,
  serverNameById: ReadonlyMap<string, string>
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
  serverNameById: ReadonlyMap<string, string>
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

function comparePathMatrixRows(a: FabricPathMatrixRow, b: FabricPathMatrixRow): number {
  const from = a.fromLabel.localeCompare(b.fromLabel)
  if (from !== 0) return from
  return a.toLabel.localeCompare(b.toLabel)
}

/**
 * Flatten each relay's `paths[]` into a deterministic peer-path matrix.
 */
export function buildFabricPathMatrix(
  relays: readonly RelayRecord[],
  serverNameById: ReadonlyMap<string, string>
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

export type FabricPairPathLabel = 'LAN' | 'TurboFabric' | 'TurboFabric over LAN' | 'No Path'

/** Short label for how a server pair talks. */
export function fabricPairPathLabel(path: FabricPairPath): FabricPairPathLabel {
  if (path === 'lan') return 'LAN'
  if (path === 'fabric') return 'TurboFabric'
  if (path === 'fabric_over_untrusted_lan') return 'TurboFabric over LAN'
  return 'No Path'
}

/** True when a TurboFabric tunnel carries the pair, so tunnel readings apply. */
export function fabricPairUsesTunnel(path: FabricPairPath): boolean {
  return path === 'fabric' || path === 'fabric_over_untrusted_lan'
}

/** One server pair ready to show: who, the path label, the panel's reason and tunnel readings. */
export type FabricPairRow = {
  key: string
  title: string
  path: FabricPairPath
  pathLabel: FabricPairPathLabel
  reason: string
  latencyMs?: number
  viaLabel?: string
  /** Tunnel warning ("Unreachable" / "Degraded"); only for a pair a tunnel carries. */
  warning?: string
}

/**
 * A tunnel is one wire with two ends. A server that cannot dial the other
 * (it sits behind NAT) reads "unreachable" from its own side while the other
 * end connects out to it fine, so that reading only counts when no other
 * reading for the pair says the tunnel is up.
 */
function tunnelReading(
  pair: OrgFabricPairRecord,
  matrix: readonly FabricPathMatrixRow[]
): FabricPathMatrixRow | undefined {
  const forward = matrix.find(
    (row) => row.fromServerId === pair.fromServerId && row.toServerId === pair.toServerId
  )
  const backward = matrix.find(
    (row) => row.fromServerId === pair.toServerId && row.toServerId === pair.fromServerId
  )
  if (forward && forward.kind !== 'unreachable') return forward
  if (backward && backward.kind !== 'unreachable') return backward
  return forward ?? backward
}

/**
 * A session with no new handshake for this long is dead: WireGuard renews one
 * after 120 s of traffic and drops it after 180 s (15 s margin for the poll).
 * Same limit as the control plane and the daemon.
 */
export const FABRIC_HANDSHAKE_HEALTHY_MS = 195_000

/**
 * A reading older than this says nothing about now: a steady mesh is read
 * every 5 minutes, plus 2 minutes of margin.
 */
export const FABRIC_OBSERVATION_MAX_AGE_MS = 7 * 60_000

/** What the latest reading says about a peer's handshake. */
export type FabricHandshakeReading = 'fresh' | 'stale' | 'unreported'

/**
 * Judge a peer's last handshake against the moment the server took its
 * reading, not against now: an idle tunnel only renews its handshake every
 * couple of minutes, and the reading itself may be a few minutes old.
 * `stale` is a handshake that was already too old when the reading was taken
 * (or has never happened). `unreported` is a reading too old to say anything:
 * the server has stopped reporting, which is its own warning, never a quiet
 * "fine".
 */
export function fabricHandshakeReading(
  lastHandshakeAt: string | null | undefined,
  observedAt: string | null | undefined,
  nowMs: number
): FabricHandshakeReading {
  if (!lastHandshakeAt) return 'stale'
  const handshake = Date.parse(lastHandshakeAt)
  if (Number.isNaN(handshake)) return 'stale'
  const reading = observedAt ? Date.parse(observedAt) : Number.NaN
  if (Number.isNaN(reading)) {
    // An older control plane sends no reading time: allow for its lag too.
    const limit = FABRIC_HANDSHAKE_HEALTHY_MS + FABRIC_OBSERVATION_MAX_AGE_MS
    return nowMs - handshake > limit ? 'stale' : 'fresh'
  }
  if (nowMs - reading > FABRIC_OBSERVATION_MAX_AGE_MS) return 'unreported'
  return reading - handshake > FABRIC_HANDSHAKE_HEALTHY_MS ? 'stale' : 'fresh'
}

function tunnelWarning(row: FabricPathMatrixRow): string | undefined {
  if (row.kind === 'unreachable') return 'Unreachable'
  if (fabricPathIsDegraded(row)) return 'Degraded'
  return undefined
}

function tunnelFields(
  pair: OrgFabricPairRecord,
  matrix: readonly FabricPathMatrixRow[]
): Partial<FabricPairRow> {
  if (!fabricPairUsesTunnel(pair.path)) return {}
  const row = tunnelReading(pair, matrix)
  if (!row) return {}
  const fields: Partial<FabricPairRow> = {}
  if (row.kind !== 'unreachable' && row.latencyMs !== undefined) fields.latencyMs = row.latencyMs
  if (row.viaLabel) fields.viaLabel = row.viaLabel
  const warning = tunnelWarning(row)
  if (warning) fields.warning = warning
  return fields
}

function pairRow(
  pair: OrgFabricPairRecord,
  key: string,
  title: string,
  matrix: readonly FabricPathMatrixRow[]
): FabricPairRow {
  return {
    key,
    title,
    path: pair.path,
    pathLabel: fabricPairPathLabel(pair.path),
    reason: pair.reason,
    ...tunnelFields(pair, matrix),
  }
}

function comparePairRows(a: FabricPairRow, b: FabricPairRow): number {
  return a.title.localeCompare(b.title)
}

/**
 * One row per server pair from `GET …/fabric` `pairs[]`, with the tunnel's
 * latency and warning taken from the relay path matrix (either direction)
 * when a tunnel carries the pair. A LAN pair has no tunnel readings.
 */
export function buildFabricPairRows(
  pairs: readonly OrgFabricPairRecord[],
  matrix: readonly FabricPathMatrixRow[],
  serverNameById: ReadonlyMap<string, string>
): FabricPairRow[] {
  const rows = pairs.map((pair) =>
    pairRow(
      pair,
      `${pair.fromServerId}:${pair.toServerId}`,
      `${serverLabel(pair.fromServerId, serverNameById)} ↔ ${serverLabel(pair.toServerId, serverNameById)}`,
      matrix
    )
  )
  return rows.sort(comparePairRows)
}

/**
 * The pairs that include one server, seen from that server: each row is titled
 * with the other server's name. Tunnel readings come from the matrix as above.
 */
export function buildServerPairRows(
  serverId: string,
  pairs: readonly OrgFabricPairRecord[],
  matrix: readonly FabricPathMatrixRow[],
  serverNameById: ReadonlyMap<string, string>
): FabricPairRow[] {
  const rows: FabricPairRow[] = []
  for (const pair of pairs) {
    let otherId: string | null = null
    if (pair.fromServerId === serverId) otherId = pair.toServerId
    else if (pair.toServerId === serverId) otherId = pair.fromServerId
    if (!otherId) continue
    rows.push(pairRow(pair, otherId, serverLabel(otherId, serverNameById), matrix))
  }
  return rows.sort(comparePairRows)
}

/**
 * How one server reaches every other org server, straight from `GET …/fabric`:
 * names from `servers[]`, tunnel readings from the relay matrix. Empty when
 * `pairs[]` is absent (older control plane, or fewer than two servers).
 */
export function fabricServerPairRows(
  serverId: string,
  fabric: Pick<OrgFabricSettings, 'pairs' | 'servers' | 'relays'> | undefined
): FabricPairRow[] {
  if (!fabric?.pairs) return []
  const nameById = new Map(fabric.servers.map((row) => [row.serverId, row.name]))
  const matrix = buildFabricPathMatrix(fabric.relays, nameById)
  return buildServerPairRows(serverId, fabric.pairs, matrix, nameById)
}

/**
 * Unique gateway-kind via labels for a relay, sorted for display.
 */
export function fabricRoutedViaLabels(
  relay: Pick<RelayRecord, 'paths'>,
  serverNameById: ReadonlyMap<string, string>
): string[] {
  const labels: string[] = []
  const seen = new Set<string>()
  for (const path of relay.paths) {
    if (path.selected !== 'gateway' || !path.viaServerId) continue
    if (seen.has(path.viaServerId)) continue
    seen.add(path.viaServerId)
    labels.push(fabricPathViaLabel(path.viaServerId, serverNameById) ?? path.viaServerId)
  }
  return labels.sort((a, b) => a.localeCompare(b))
}
