import type {
  FabricPairPath,
  FabricRelayPathKind,
  OrgFabricPairReading,
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
  /** When the `from` server last reported; absent on an older control plane. */
  observedAt?: string
  /** The `from` server is switched off or the mesh is paused: its reading says nothing about the tunnel. */
  inactive?: boolean
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
  serverNameById: ReadonlyMap<string, string>,
  inactiveServerIds: ReadonlySet<string> = new Set()
): FabricPathMatrixRow[] {
  const rows: FabricPathMatrixRow[] = []
  for (const relay of relays) {
    for (const path of relay.paths) {
      const row = fabricPathMatrixRow(relay.serverId, path, serverNameById)
      if (relay.observedAt) row.observedAt = relay.observedAt
      if (inactiveServerIds.has(relay.serverId)) row.inactive = true
      rows.push(row)
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
  /** When the newest reading behind this row was taken; shown as "as of ..." so a reading's age is plain. */
  readingAt?: string
  /** The age of `readingAt` in plain words, judged at build time ("3 min ago"). */
  readingAge?: string
}

/** A reading counts only from a server that is in the mesh and reported lately. */
function readingIsCurrent(row: FabricPathMatrixRow, nowMs: number): boolean {
  if (row.inactive) return false
  const at = row.observedAt ? Date.parse(row.observedAt) : Number.NaN
  // An older control plane sends no reading time: nothing to check it against.
  if (Number.isNaN(at)) return true
  return nowMs - at <= FABRIC_OBSERVATION_MAX_AGE_MS
}

/**
 * A tunnel is one wire with two ends. A server that cannot dial the other
 * (it sits behind NAT) reads "unreachable" from its own side while the other
 * end connects out to it fine, so that reading only counts when no other
 * current reading for the pair says the tunnel is up. A silent, switched-off
 * or paused server's last reading proves nothing, so it never hides the warning.
 */
function tunnelReading(
  pair: OrgFabricPairRecord,
  matrix: readonly FabricPathMatrixRow[],
  nowMs: number
): FabricPathMatrixRow | undefined {
  const forward = matrix.find(
    (row) => row.fromServerId === pair.fromServerId && row.toServerId === pair.toServerId
  )
  const backward = matrix.find(
    (row) => row.fromServerId === pair.toServerId && row.toServerId === pair.fromServerId
  )
  for (const row of [forward, backward]) {
    if (row && row.kind !== 'unreachable' && readingIsCurrent(row, nowMs)) return row
  }
  if (forward?.kind === 'unreachable') return forward
  if (backward?.kind === 'unreachable') return backward
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

/** What the page shows for a pair's tunnel: the reading and nothing more while the mesh is paused or off. */
export type FabricReadingContext = Readonly<{ nowMs: number; quiet: boolean }>

function currentReadingContext(): FabricReadingContext {
  return { nowMs: Date.now(), quiet: false }
}

/** Plain age of a reading, for "as of ...": "just now", "3 min ago", "2 h ago". */
export function fabricReadingAgeLabel(observedAt: string, nowMs: number): string | undefined {
  const at = Date.parse(observedAt)
  if (Number.isNaN(at)) return undefined
  const minutes = Math.floor(Math.max(0, nowMs - at) / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${String(minutes)} min ago`
  return `${String(Math.floor(minutes / 60))} h ago`
}

type TunnelVerdict = { verdict: 'up' | 'down' | 'unreported' | 'none'; readingAt?: string }

/** The newest current reading that shows a fresh handshake and the newest that shows a stale one (ms). */
function newestFreshAndStale(
  readings: readonly OrgFabricPairReading[],
  nowMs: number
): { up?: number; down?: number } {
  const newest: { up?: number; down?: number } = {}
  for (const reading of readings) {
    // A reading with no readable time says nothing, whatever its handshake looks like.
    const at = Date.parse(reading.observedAt)
    if (Number.isNaN(at)) continue
    const judged = fabricHandshakeReading(reading.lastHandshakeAt, reading.observedAt, nowMs)
    if (judged === 'unreported') continue
    const key = judged === 'fresh' ? 'up' : 'down'
    if (newest[key] === undefined || at > newest[key]) newest[key] = at
  }
  return newest
}

/**
 * What the ends' own latest reports say about the tunnel, judged each against
 * its own reading time: the newest current reading decides (a tunnel is one
 * wire and handshakes are symmetric; the stored path summary only changes on a
 * reconcile and can still read unreachable): up when it shows a fresh
 * handshake, down when it shows a stale one, and down on a tie. Unreported when every reading is too old, none when
 * the panel sent no readings (older control plane) or a server is switched out.
 */
function judgeTunnelReadings(
  pair: OrgFabricPairRecord,
  matrix: readonly FabricPathMatrixRow[],
  nowMs: number
): TunnelVerdict {
  const readings = pair.tunnel?.readings ?? []
  const switchedOut = matrix.some(
    (row) =>
      row.inactive === true &&
      (row.fromServerId === pair.fromServerId || row.fromServerId === pair.toServerId)
  )
  if (readings.length === 0 || switchedOut) return { verdict: 'none' }
  const { up, down } = newestFreshAndStale(readings, nowMs)
  // Handshakes are symmetric: a live tunnel never shows fresh on one end and stale on a newer reading
  // from the other, so the newest current reading decides. A tie is not proof the tunnel is up.
  if (up !== undefined && (down === undefined || up > down)) {
    return { verdict: 'up', readingAt: new Date(up).toISOString() }
  }
  if (down !== undefined) return { verdict: 'down', readingAt: new Date(down).toISOString() }
  return { verdict: 'unreported' }
}

/** The warning once the ends' readings are judged; the stored path decides only when they say nothing. */
function tunnelWarningFor(
  live: TunnelVerdict,
  row: FabricPathMatrixRow | undefined,
  nowMs: number
): string | undefined {
  const stored = row && readingIsCurrent(row, nowMs) ? tunnelWarning(row) : 'Not Reporting'
  if (live.verdict === 'down') return 'Unreachable'
  if (live.verdict === 'unreported') return 'Not Reporting'
  if (live.verdict === 'none') return row ? stored : undefined
  // A live handshake overrides only a stored "unreachable"; a degraded direct path is still a real signal.
  return stored === 'Degraded' ? stored : undefined
}

function tunnelFields(
  pair: OrgFabricPairRecord,
  matrix: readonly FabricPathMatrixRow[],
  context: FabricReadingContext
): Partial<FabricPairRow> {
  if (!fabricPairUsesTunnel(pair.path)) return {}
  const row = tunnelReading(pair, matrix, context.nowMs)
  const fields: Partial<FabricPairRow> = {}
  if (row && row.kind !== 'unreachable' && row.latencyMs !== undefined) {
    fields.latencyMs = row.latencyMs
  }
  if (row?.viaLabel) fields.viaLabel = row.viaLabel
  // A paused or switched-off mesh has no tunnel to warn about; that is the user's choice.
  if (context.quiet) return fields
  const live = judgeTunnelReadings(pair, matrix, context.nowMs)
  if (live.readingAt) {
    fields.readingAt = live.readingAt
    const age = fabricReadingAgeLabel(live.readingAt, context.nowMs)
    if (age) fields.readingAge = age
  }
  const warning = tunnelWarningFor(live, row, context.nowMs)
  if (warning) fields.warning = warning
  return fields
}

function pairRow(
  pair: OrgFabricPairRecord,
  key: string,
  title: string,
  matrix: readonly FabricPathMatrixRow[],
  context: FabricReadingContext
): FabricPairRow {
  return {
    key,
    title,
    path: pair.path,
    pathLabel: fabricPairPathLabel(pair.path),
    reason: pair.reason,
    ...tunnelFields(pair, matrix, context),
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
  serverNameById: ReadonlyMap<string, string>,
  context?: FabricReadingContext
): FabricPairRow[] {
  const reading = context ?? currentReadingContext()
  const rows = pairs.map((pair) =>
    pairRow(
      pair,
      `${pair.fromServerId}:${pair.toServerId}`,
      `${serverLabel(pair.fromServerId, serverNameById)} ↔ ${serverLabel(pair.toServerId, serverNameById)}`,
      matrix,
      reading
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
  serverNameById: ReadonlyMap<string, string>,
  context?: FabricReadingContext
): FabricPairRow[] {
  const reading = context ?? currentReadingContext()
  const rows: FabricPairRow[] = []
  for (const pair of pairs) {
    let otherId: string | null = null
    if (pair.fromServerId === serverId) otherId = pair.toServerId
    else if (pair.toServerId === serverId) otherId = pair.fromServerId
    if (!otherId) continue
    rows.push(pairRow(pair, otherId, serverLabel(otherId, serverNameById), matrix, reading))
  }
  return rows.sort(comparePairRows)
}

/** True while the whole mesh is paused or off: no tunnel is expected, so none is warned about. */
export function fabricIsQuiet(
  fabric: Partial<Pick<OrgFabricSettings, 'enabled' | 'paused'>>
): boolean {
  return fabric.paused === true || fabric.enabled === false
}

/** Servers switched out of the mesh: their last reading says nothing about the tunnel now. */
export function fabricInactiveServerIds(
  fabric: Pick<OrgFabricSettings, 'servers' | 'relays'> &
    Partial<Pick<OrgFabricSettings, 'enabled' | 'paused'>>
): Set<string> {
  if (fabric.paused === true || fabric.enabled === false)
    return new Set(fabric.relays.map((row) => row.serverId))
  return new Set(fabric.servers.filter((row) => !row.enabled).map((row) => row.serverId))
}

/**
 * How one server reaches every other org server, straight from `GET …/fabric`:
 * names from `servers[]`, tunnel readings from the relay matrix. Empty when
 * `pairs[]` is absent (older control plane, or fewer than two servers).
 */
export function fabricServerPairRows(
  serverId: string,
  fabric:
    | (Pick<OrgFabricSettings, 'pairs' | 'servers' | 'relays'> &
        Partial<Pick<OrgFabricSettings, 'enabled' | 'paused'>>)
    | undefined
): FabricPairRow[] {
  if (!fabric?.pairs) return []
  const nameById = new Map(fabric.servers.map((row) => [row.serverId, row.name]))
  const matrix = buildFabricPathMatrix(fabric.relays, nameById, fabricInactiveServerIds(fabric))
  return buildServerPairRows(serverId, fabric.pairs, matrix, nameById, {
    nowMs: Date.now(),
    quiet: fabricIsQuiet(fabric),
  })
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
