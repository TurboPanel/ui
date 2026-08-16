import type {
  DatacenterOptions,
  DatacenterRecord,
  ServerDatacenterRef,
  ServerGeo,
  ServerReportedIp,
} from '@/lib/instance-api'
import {
  addressInCidr,
  formatCidr,
  inferSiteCidrFromAddress,
  isValidCidr,
  parseCidr,
} from '@/lib/cidr'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Coerce missing/null memberships (stale cache or older API) to []. */
export function serverDatacenterMemberships(
  server: Readonly<{
    datacenters?: readonly ServerDatacenterRef[] | null
  }>,
): readonly ServerDatacenterRef[] {
  return server.datacenters ?? []
}

export function datacenterDisplayName(
  datacenter: Readonly<Pick<DatacenterRecord, 'displayName'>>,
): string {
  const name = datacenter.displayName?.trim()
  return name && name.length > 0 ? name : 'Unnamed datacenter'
}

/** Join membership display names; first + count when many. */
export function formatServerDatacenterNames(
  datacenters: readonly ServerDatacenterRef[] | null | undefined,
): string | null {
  const rows = datacenters ?? []
  if (rows.length === 0) return null
  const names = rows
    .map((row) => row.displayName?.trim() || row.id)
    .filter((name) => name.length > 0)
  if (names.length === 0) return null
  if (names.length === 1) return names[0] ?? null
  return `${names[0]} +${names.length - 1}`
}

export function serverIsDatacenterMember(
  server: Readonly<{
    datacenters?: readonly ServerDatacenterRef[] | null
  }>,
  datacenterId: string,
): boolean {
  return serverDatacenterMemberships(server).some((row) => row.id === datacenterId)
}

export function datacenterTimezoneLabel(
  options: DatacenterOptions | null,
): string {
  const timezone = options?.defaultServerTimezone?.trim()
  return timezone && timezone.length > 0 ? timezone : '—'
}

export function formatDatacenterCidrs(cidrs: readonly string[]): string {
  const cleaned = cidrs
    .map((cidr) => cidr.trim())
    .filter((cidr) => cidr.length > 0)
  if (cleaned.length === 0) return '—'
  return cleaned.join(', ')
}

export function formatDatacenterServerCount(count: number): string {
  if (count === 1) return '1 server'
  return `${count} servers`
}

/** Geo snapshot from `datacenter.metadata.geo` when a site was seeded from a server. */
export function datacenterGeoFromMetadata(
  metadata: Record<string, unknown> | null,
): ServerGeo | null {
  if (!isRecord(metadata) || !isRecord(metadata.geo)) return null
  const source = metadata.geo
  const geo: ServerGeo = {}
  const country = typeof source.country === 'string' ? source.country.trim() : ''
  const city = typeof source.city === 'string' ? source.city.trim() : ''
  const region = typeof source.region === 'string' ? source.region.trim() : ''
  if (country) geo.country = country
  if (city) geo.city = city
  if (region) geo.region = region
  if (!geo.country && !geo.city && !geo.region) return null
  return geo
}

export type DatacenterMembershipCounts = {
  byDatacenter: ReadonlyMap<string, number>
  /** Servers with zero memberships. */
  unassigned: number
  /** Total membership pins across all servers. */
  membershipPins: number
  /** Unique servers with ≥1 membership. */
  uniqueMembers: number
}

/**
 * Count memberships from each server's `datacenters[]` (a server in N DCs
 * increments each of those N counts).
 */
export function countServersByDatacenterId(
  servers: readonly Readonly<{
    datacenters?: readonly ServerDatacenterRef[] | null
  }>[],
): DatacenterMembershipCounts {
  const byDatacenter = new Map<string, number>()
  let unassigned = 0
  let membershipPins = 0
  let uniqueMembers = 0
  for (const server of servers) {
    const memberships = serverDatacenterMemberships(server)
    if (memberships.length === 0) {
      unassigned += 1
      continue
    }
    uniqueMembers += 1
    for (const membership of memberships) {
      membershipPins += 1
      byDatacenter.set(
        membership.id,
        (byDatacenter.get(membership.id) ?? 0) + 1,
      )
    }
  }
  return { byDatacenter, unassigned, membershipPins, uniqueMembers }
}

export function sortDatacentersByName(
  datacenters: readonly DatacenterRecord[],
): DatacenterRecord[] {
  return [...datacenters].sort((a, b) =>
    datacenterDisplayName(a).localeCompare(datacenterDisplayName(b)),
  )
}

export type DatacenterAddEligibility = {
  canAdd: boolean
  reason: string | null
}

/**
 * A new datacenter can be created when at least one server reports a private
 * address. The site CIDR uses the daemon-reported prefix when present,
 * otherwise a typical LAN (`/24` / `/64`).
 */
export function resolveDatacenterAddEligibility(
  input: Readonly<{
    serversWithPrivateAddress: number
    serverCount: number
  }>,
): DatacenterAddEligibility {
  if (input.serversWithPrivateAddress > 0) {
    return { canAdd: true, reason: null }
  }
  if (input.serverCount === 0) {
    return {
      canAdd: false,
      reason: 'Add a server first.',
    }
  }
  return {
    canAdd: false,
    reason: 'No private IPs reported yet.',
  }
}

export type ReportedPrivateNetwork = {
  address: string
  cidr: string
  cidrSource: 'reported' | 'assumed'
}

type ServerWithIps = Readonly<{ ips: ServerReportedIp[] | null }>

function resolvedPrivateNetwork(
  address: string,
  cidr: string | undefined,
): ReportedPrivateNetwork | null {
  const parsed = cidr ? parseCidr(cidr) : null
  if (parsed) {
    return { address, cidr: formatCidr(parsed), cidrSource: 'reported' }
  }
  const inferred = inferSiteCidrFromAddress(address)
  if (!inferred) return null
  return { address, cidr: inferred, cidrSource: 'assumed' }
}

/** Daemon-reported private IPs, with interface CIDR or a typical LAN fallback. */
export function reportedPrivateNetworks(
  server: ServerWithIps,
): ReportedPrivateNetwork[] {
  const ips = server.ips
  if (!ips) return []
  const out: ReportedPrivateNetwork[] = []
  const seen = new Set<string>()
  for (const row of ips) {
    if (row.scope !== 'private') continue
    const address = row.address.trim()
    if (!address || seen.has(address)) continue
    const resolved = resolvedPrivateNetwork(address, row.cidr?.trim())
    if (!resolved) continue
    seen.add(address)
    out.push(resolved)
  }
  return out
}

export function reportedCidrForAddress(
  server: ServerWithIps,
  address: string,
): string | null {
  const normalized = address.trim()
  const match = reportedPrivateNetworks(server).find(
    (row) => row.address === normalized,
  )
  return match?.cidr ?? null
}

/** Daemon-reported private IPv4 + IPv6, trimmed and de-duplicated. */
export function reportedPrivateAddresses(server: ServerWithIps): string[] {
  const ips = server.ips
  if (!ips) return []
  const seen = new Set<string>()
  const out: string[] = []
  for (const row of ips) {
    if (row.scope !== 'private') continue
    const address = row.address.trim()
    if (!address || seen.has(address)) continue
    seen.add(address)
    out.push(address)
  }
  return out
}

export function addressesInCidr(
  addresses: readonly string[],
  cidr: string,
): string[] {
  if (!isValidCidr(cidr)) return []
  return addresses.filter((address) => addressInCidr(address, cidr))
}

export function listServersWithReportedPrivateAddresses<
  T extends ServerWithIps,
>(servers: readonly T[]): T[] {
  return servers.filter((server) => reportedPrivateAddresses(server).length > 0)
}

export function listServersWithReportedPrivateNetworks<
  T extends ServerWithIps,
>(servers: readonly T[]): T[] {
  return servers.filter((server) => reportedPrivateNetworks(server).length > 0)
}

/** Servers that report at least one private address inside any of `cidrs`. */
export function listServersWithAddressInCidrs<T extends ServerWithIps>(
  servers: readonly T[],
  cidrs: readonly string[],
): T[] {
  const validCidrs = cidrs.filter((cidr) => isValidCidr(cidr))
  if (validCidrs.length === 0) return []
  return servers.filter((server) =>
    validCidrs.some(
      (cidr) =>
        addressesInCidr(reportedPrivateAddresses(server), cidr).length > 0,
    ),
  )
}

/** Servers with zero datacenter memberships. */
export function listServersWithoutMembership<
  T extends Readonly<{
    datacenters?: readonly ServerDatacenterRef[] | null
  }>,
>(servers: readonly T[]): T[] {
  return servers.filter(
    (server) => serverDatacenterMemberships(server).length === 0,
  )
}

export function pruneSelectedIds(
  selected: ReadonlySet<string>,
  allowedIds: ReadonlySet<string>,
): Set<string> {
  const next = new Set<string>()
  for (const id of selected) {
    if (allowedIds.has(id)) next.add(id)
  }
  return next
}

export function toggleSelectedId(
  selected: ReadonlySet<string>,
  id: string,
): Set<string> {
  const next = new Set(selected)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  return next
}

export type DatacenterMemberPin = {
  serverId: string
  address: string
}

/**
 * Build membership pins from a serverId → selected address map. Drops blank
 * or duplicate server ids; keeps first address per server.
 */
export function buildMemberPins(
  selections: ReadonlyMap<string, string> | Readonly<Record<string, string>>,
): DatacenterMemberPin[] {
  const entries =
    selections instanceof Map
      ? [...selections.entries()]
      : Object.entries(selections)
  const pins: DatacenterMemberPin[] = []
  const seen = new Set<string>()
  for (const [serverId, rawAddress] of entries) {
    if (!serverId || seen.has(serverId)) continue
    const address = rawAddress.trim()
    if (!address) continue
    seen.add(serverId)
    pins.push({ serverId, address })
  }
  return pins
}

export type CreateDatacenterRequest = {
  displayName?: string
  description?: string
  members: DatacenterMemberPin[]
  sourceServerId?: string
}

export function buildCreateDatacenterRequest(
  input: Readonly<{
    displayName: string
    description: string
    members: readonly DatacenterMemberPin[]
    sourceServerId?: string
  }>,
): CreateDatacenterRequest | null {
  const members: DatacenterMemberPin[] = []
  const seen = new Set<string>()
  for (const pin of input.members) {
    if (!pin.serverId || seen.has(pin.serverId)) continue
    const address = pin.address.trim()
    if (!address) continue
    seen.add(pin.serverId)
    members.push({ serverId: pin.serverId, address })
  }
  if (members.length === 0) return null

  const displayName = input.displayName.trim()
  const description = input.description.trim()
  const body: CreateDatacenterRequest = { members }
  if (displayName) body.displayName = displayName
  if (description) body.description = description

  const sourceServerId = input.sourceServerId?.trim() || members[0]?.serverId
  if (sourceServerId) body.sourceServerId = sourceServerId
  return body
}

/**
 * Create payload from one seed host + reported address. CIDR is derived
 * server-side from the reported prefix, or a typical LAN when omitted.
 */
export function buildCreateDatacenterFromSeed(
  input: Readonly<{
    displayName: string
    description: string
    serverId: string
    address: string
  }>,
): CreateDatacenterRequest | null {
  const address = input.address.trim()
  if (!input.serverId || !address) return null
  return buildCreateDatacenterRequest({
    displayName: input.displayName,
    description: input.description,
    members: [{ serverId: input.serverId, address }],
    sourceServerId: input.serverId,
  })
}
