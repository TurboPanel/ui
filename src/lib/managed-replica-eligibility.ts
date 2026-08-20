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

import type {
  ManagedMemberRecord,
  ManagedMemberTransport,
  ManagedReplicaClass,
} from '@/lib/managed-services'
import type { ServerDatacenterRef } from '@/lib/instance-api'

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
  /** Preferred site for deep links when ineligible for CIDR reasons. */
  candidateDatacenterId?: string | null
  /** Predicted path to primary when the row is eligible. */
  predictedTransport?: ManagedMemberTransport
}

export type ReplicaEligibilityInput = {
  servers: readonly {
    id: string
    name?: string | null
    hostname?: string | null
    connected: boolean
    datacenters: readonly ServerDatacenterRef[]
  }[]
  datacenters: readonly {
    id: string
    privateCidrs: readonly string[]
  }[]
  members: readonly Pick<ManagedMemberRecord, 'serverId' | 'role'>[]
  /**
   * Current primary server id (from cluster members). Used for private-path
   * checks against candidates. Null when the cluster has no primary yet.
   */
  primaryServerId: string | null
  /**
   * TurboFabric relays. Two servers share a private fabric path when both
   * appear in this list (one org mesh). Mirrors instance
   * `resolvePrivateEndpoint` transport order: local → same site → fabric.
   */
  fabricRelays?: readonly { serverId: string }[]
  /** Failover vs read-only placement rules. Defaults to failover. */
  replicaClass: ManagedReplicaClass
}

export type ReplicaEligibilityResult = {
  servers: ReplicaServerEligibility[]
}

function datacenterIds(
  server: Readonly<{ datacenters: readonly ServerDatacenterRef[] }> | undefined,
): string[] {
  return (server?.datacenters ?? []).map((row) => row.id)
}

function shareDatacenter(
  left: readonly string[],
  right: readonly string[],
): boolean {
  if (left.length === 0 || right.length === 0) return false
  const rightSet = new Set(right)
  return left.some((id) => rightSet.has(id))
}

function sharedDatacenterIds(
  left: readonly string[],
  right: readonly string[],
): string[] {
  if (left.length === 0 || right.length === 0) return []
  const rightSet = new Set(right)
  return left.filter((id) => rightSet.has(id))
}

/**
 * True when `from` can reach `to` over local / same-site / shared fabric path.
 * Does not require datacenter IPs (those fail as datacenter_ip_required on
 * the server) — site readiness is already gated by `no-private-cidr`.
 */
export function hasPrivatePathToPrimary(params: Readonly<{
  candidateServerId: string
  candidateDatacenterIds: readonly string[]
  primaryServerId: string
  primaryDatacenterIds: readonly string[]
  fabricRelays: readonly { serverId: string }[]
}>): boolean {
  if (params.candidateServerId === params.primaryServerId) {
    return true
  }
  if (
    shareDatacenter(
      params.candidateDatacenterIds,
      params.primaryDatacenterIds,
    )
  ) {
    return true
  }

  const relayServerIds = new Set(
    params.fabricRelays.map((row) => row.serverId),
  )
  return (
    relayServerIds.has(params.primaryServerId) &&
    relayServerIds.has(params.candidateServerId)
  )
}

function firstDatacenterWithCidr(
  membershipIds: readonly string[],
  cidrsByDatacenter: ReadonlyMap<string, readonly string[]>,
): string | null {
  for (const id of membershipIds) {
    const cidrs = cidrsByDatacenter.get(id) ?? []
    if (cidrs.length > 0) return id
  }
  return null
}

/**
 * Display-only prediction of the instance transport that would be selected
 * for a replica on this server (local → datacenter → fabric → public).
 */
export function predictReplicaTransport(params: Readonly<{
  candidateServerId: string
  candidateDatacenterIds: readonly string[]
  primaryServerId: string | null
  primaryDatacenterIds: readonly string[]
  fabricRelays: readonly { serverId: string }[]
}>): ManagedMemberTransport {
  if (
    params.primaryServerId &&
    params.candidateServerId === params.primaryServerId
  ) {
    return 'local'
  }
  if (
    params.primaryServerId &&
    shareDatacenter(
      params.candidateDatacenterIds,
      params.primaryDatacenterIds,
    )
  ) {
    return 'datacenter'
  }
  if (
    params.primaryServerId &&
    hasPrivatePathToPrimary({
      candidateServerId: params.candidateServerId,
      candidateDatacenterIds: params.candidateDatacenterIds,
      primaryServerId: params.primaryServerId,
      primaryDatacenterIds: params.primaryDatacenterIds,
      fabricRelays: params.fabricRelays,
    })
  ) {
    return 'fabric'
  }
  return 'public'
}

function failoverEligibility(params: Readonly<{
  serverId: string
  membershipIds: readonly string[]
  primaryDatacenterIds: readonly string[]
  cidrsByDatacenter: ReadonlyMap<string, readonly string[]>
  primaryServerId: string | null
}>): ReplicaServerEligibility {
  const sharedIds = sharedDatacenterIds(
    params.membershipIds,
    params.primaryDatacenterIds,
  )
  if (sharedIds.length === 0) {
    if (params.membershipIds.length === 0 || !params.primaryServerId) {
      return {
        serverId: params.serverId,
        eligible: false,
        reason: 'no-datacenter',
      }
    }
    return {
      serverId: params.serverId,
      eligible: false,
      reason: 'no-private-path',
      candidateDatacenterId: params.membershipIds[0] ?? null,
    }
  }
  const readyDatacenterId = firstDatacenterWithCidr(
    sharedIds,
    params.cidrsByDatacenter,
  )
  if (!readyDatacenterId) {
    return {
      serverId: params.serverId,
      eligible: false,
      reason: 'no-private-cidr',
      candidateDatacenterId: sharedIds[0] ?? null,
    }
  }
  return {
    serverId: params.serverId,
    eligible: true,
    candidateDatacenterId: readyDatacenterId,
    predictedTransport:
      params.primaryServerId && params.serverId === params.primaryServerId
        ? 'local'
        : 'datacenter',
  }
}

function readEligibility(params: Readonly<{
  serverId: string
  membershipIds: readonly string[]
  primaryServerId: string | null
  primaryDatacenterIds: readonly string[]
  fabricRelays: readonly { serverId: string }[]
  cidrsByDatacenter: ReadonlyMap<string, readonly string[]>
}>): ReplicaServerEligibility {
  const readyDatacenterId = firstDatacenterWithCidr(
    params.membershipIds,
    params.cidrsByDatacenter,
  )
  return {
    serverId: params.serverId,
    eligible: true,
    candidateDatacenterId: readyDatacenterId,
    predictedTransport: predictReplicaTransport({
      candidateServerId: params.serverId,
      candidateDatacenterIds: params.membershipIds,
      primaryServerId: params.primaryServerId,
      primaryDatacenterIds: params.primaryDatacenterIds,
      fabricRelays: params.fabricRelays,
    }),
  }
}

/**
 * Per-server eligibility for the add-replica picker.
 *
 * Failover: only servers that share the primary's datacenter with a usable
 * subnet. Read-only: any org server that is not already a member and is
 * online; predicted transport is shown for the picker.
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
  const primaryDatacenterIds = datacenterIds(primary)
  const fabricRelays = input.fabricRelays ?? []
  const replicaClass = input.replicaClass

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
    const membershipIds = datacenterIds(server)
    if (replicaClass === 'read') {
      return readEligibility({
        serverId: server.id,
        membershipIds,
        primaryServerId: input.primaryServerId,
        primaryDatacenterIds,
        fabricRelays,
        cidrsByDatacenter,
      })
    }
    return failoverEligibility({
      serverId: server.id,
      membershipIds,
      primaryDatacenterIds,
      cidrsByDatacenter,
      primaryServerId: input.primaryServerId,
    })
  })

  return { servers }
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
      return 'Not assigned to a datacenter'
    case 'no-private-cidr':
      return 'Datacenter has no subnets yet'
    case 'no-private-path':
      return "Must share the primary's datacenter"
  }
}
