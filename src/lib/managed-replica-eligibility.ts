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
}

export type ReplicaEligibilityInput = {
  servers: ReadonlyArray<{
    id: string
    displayName?: string | null
    hostname?: string | null
    connected: boolean
    datacenters: readonly ServerDatacenterRef[]
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
   * TurboFabric relays. Two servers share a private fabric path when both
   * appear in this list (one org mesh). Mirrors instance
   * `resolvePrivateEndpoint` transport order: local → same site → fabric.
   */
  fabricRelays?: ReadonlyArray<{ serverId: string }>
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
  fabricRelays: ReadonlyArray<{ serverId: string }>
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
  const primaryDatacenterIds = datacenterIds(primary)
  const fabricRelays = input.fabricRelays ?? []

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
    if (membershipIds.length === 0) {
      return {
        serverId: server.id,
        eligible: false,
        reason: 'no-datacenter',
      }
    }
    const readyDatacenterId = firstDatacenterWithCidr(
      membershipIds,
      cidrsByDatacenter,
    )
    if (!readyDatacenterId) {
      return {
        serverId: server.id,
        eligible: false,
        reason: 'no-private-cidr',
        candidateDatacenterId: membershipIds[0] ?? null,
      }
    }
    if (
      input.primaryServerId &&
      !hasPrivatePathToPrimary({
        candidateServerId: server.id,
        candidateDatacenterIds: membershipIds,
        primaryServerId: input.primaryServerId,
        primaryDatacenterIds,
        fabricRelays,
      })
    ) {
      return {
        serverId: server.id,
        eligible: false,
        reason: 'no-private-path',
        candidateDatacenterId: readyDatacenterId,
      }
    }
    return {
      serverId: server.id,
      eligible: true,
      candidateDatacenterId: readyDatacenterId,
    }
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
      return 'Not assigned to a datacenter'
    case 'no-private-cidr':
      return 'Datacenter has no private network'
    case 'no-private-path':
      return 'No private path to primary'
  }
}
