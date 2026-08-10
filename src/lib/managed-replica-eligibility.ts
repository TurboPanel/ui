/**
 * Display-hint eligibility for adding a managed replica.
 *
 * Mirrors placement checks on the instance
 * (`resolveReplicaPlacement` + `assertServerDatacenterReady` +
 * `resolvePrivateEndpoint`) but is **not** authoritative — server 422/409
 * remains the source of truth. The picker must render every ineligible reason
 * inline (with Network deep links where applicable), never silently disable
 * rows.
 */

import {
  MANAGED_MAX_REPLICAS,
  type ManagedMemberRecord,
} from '@/lib/managed-services'

export type ReplicaIneligibleReason =
  | 'already-member'
  | 'no-datacenter'
  | 'no-private-cidr'
  | 'no-private-path'
  | 'offline'

export type ReplicaServerEligibility = {
  serverId: string
  eligible: boolean
  reason?: ReplicaIneligibleReason
}

export type ReplicaEligibilityInput = {
  servers: ReadonlyArray<{
    id: string
    displayName?: string | null
    hostname?: string | null
    connected: boolean
    datacenterId: string | null
  }>
  datacenters: ReadonlyArray<{
    id: string
    privateCidrs: readonly string[]
  }>
  members: ReadonlyArray<Pick<ManagedMemberRecord, 'serverId' | 'role'>>
  /**
   * Current primary server id (from cluster members). Used for private-path
   * checks against candidates. Null when the cluster has no primary yet.
   */
  primaryServerId: string | null
  /**
   * WireGuard mesh peers across all org links. Two servers share a private
   * VPN path when they appear together on the same `vpnId` (mirrors instance
   * `resolvePrivateEndpoint` transport order: local → same site → shared VPN).
   */
  vpnPeers?: ReadonlyArray<{ vpnId: string; serverId: string }>
}

export type ReplicaEligibilityResult = {
  atReplicaLimit: boolean
  servers: ReplicaServerEligibility[]
}

function replicaCount(
  members: ReadonlyArray<Pick<ManagedMemberRecord, 'role'>>,
): number {
  return members.filter((m) => m.role === 'replica').length
}

/**
 * True when `from` can reach `to` over local / same-site / shared VPN path.
 * Does not require datacenter IPs (those fail as datacenter_ip_required on
 * the server) — site readiness is already gated by `no-private-cidr`.
 */
export function hasPrivatePathToPrimary(params: Readonly<{
  candidateServerId: string
  candidateDatacenterId: string | null
  primaryServerId: string
  primaryDatacenterId: string | null
  vpnPeers: ReadonlyArray<{ vpnId: string; serverId: string }>
}>): boolean {
  if (params.candidateServerId === params.primaryServerId) {
    return true
  }
  if (
    params.candidateDatacenterId != null &&
    params.primaryDatacenterId != null &&
    params.candidateDatacenterId === params.primaryDatacenterId
  ) {
    return true
  }

  const primaryVpnIds = new Set(
    params.vpnPeers
      .filter((row) => row.serverId === params.primaryServerId)
      .map((row) => row.vpnId),
  )
  if (primaryVpnIds.size === 0) return false
  return params.vpnPeers.some(
    (row) =>
      row.serverId === params.candidateServerId &&
      primaryVpnIds.has(row.vpnId),
  )
}

/**
 * Per-server eligibility for the add-replica picker, plus a cluster-level
 * `atReplicaLimit` flag (max {@link MANAGED_MAX_REPLICAS} replicas).
 *
 * Precedence when multiple reasons apply: already-member → offline →
 * no-datacenter → no-private-cidr → no-private-path.
 */
export function resolveReplicaEligibility(
  input: ReplicaEligibilityInput,
): ReplicaEligibilityResult {
  const memberServerIds = new Set(input.members.map((m) => m.serverId))
  const cidrsByDatacenter = new Map(
    input.datacenters.map((dc) => [dc.id, dc.privateCidrs] as const),
  )
  const serverById = new Map(input.servers.map((s) => [s.id, s] as const))
  const primary = input.primaryServerId
    ? serverById.get(input.primaryServerId)
    : undefined
  const vpnPeers = input.vpnPeers ?? []

  const servers: ReplicaServerEligibility[] = input.servers.map((server) => {
    if (memberServerIds.has(server.id)) {
      return {
        serverId: server.id,
        eligible: false,
        reason: 'already-member',
      }
    }
    if (!server.connected) {
      return { serverId: server.id, eligible: false, reason: 'offline' }
    }
    if (!server.datacenterId) {
      return {
        serverId: server.id,
        eligible: false,
        reason: 'no-datacenter',
      }
    }
    const cidrs = cidrsByDatacenter.get(server.datacenterId) ?? []
    if (cidrs.length === 0) {
      return {
        serverId: server.id,
        eligible: false,
        reason: 'no-private-cidr',
      }
    }
    if (
      input.primaryServerId &&
      !hasPrivatePathToPrimary({
        candidateServerId: server.id,
        candidateDatacenterId: server.datacenterId,
        primaryServerId: input.primaryServerId,
        primaryDatacenterId: primary?.datacenterId ?? null,
        vpnPeers,
      })
    ) {
      return {
        serverId: server.id,
        eligible: false,
        reason: 'no-private-path',
      }
    }
    return { serverId: server.id, eligible: true }
  })

  return {
    atReplicaLimit: replicaCount(input.members) >= MANAGED_MAX_REPLICAS,
    servers,
  }
}

/** Operator-facing reason next to an ineligible server row. */
export function replicaIneligibleReasonLabel(
  reason: ReplicaIneligibleReason,
): string {
  switch (reason) {
    case 'already-member':
      return 'Already a member'
    case 'offline':
      return 'Offline'
    case 'no-datacenter':
      return 'Not assigned to a site'
    case 'no-private-cidr':
      return 'Site has no private network'
    case 'no-private-path':
      return 'No private path to primary'
  }
}
