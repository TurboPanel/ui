/**
 * Datacenter routing policy helpers — priority bounds, the "which datacenter
 * wins" sentence for the Routing panel, and the policy map the managed
 * panels feed into `partitionSharedDatacenters`.
 *
 * Display hints only: the instance applies the same rule (`priority asc`,
 * then `datacenterId asc`, untrusted skipped) and its 422s stay authoritative.
 */

import {
  DEFAULT_DATACENTER_PRIORITY,
  DEFAULT_DATACENTER_TRUSTED,
  type DatacenterListWarning,
  type ServerDatacenterRef,
} from '@/lib/instance-api'
import {
  partitionSharedDatacenters,
  type DatacenterPolicyMap,
} from '@/lib/managed-replica-eligibility'

/** Inclusive bounds the instance accepts for `options.priority` (it drops anything else). */
export const DATACENTER_PRIORITY_MIN = 0
export const DATACENTER_PRIORITY_MAX = 1000

export type DatacenterPolicySource = Readonly<{
  id: string
  name?: string | null
  priority?: number
  trusted?: boolean
}>

/** `DatacenterPolicyMap` from list rows; absent fields take the documented defaults. */
export function buildDatacenterPolicyMap(
  datacenters: readonly DatacenterPolicySource[]
): DatacenterPolicyMap {
  return new Map(
    datacenters.map((dc) => [
      dc.id,
      {
        priority: dc.priority ?? DEFAULT_DATACENTER_PRIORITY,
        trusted: dc.trusted ?? DEFAULT_DATACENTER_TRUSTED,
      },
    ])
  )
}

/**
 * Parse the Routing panel's priority draft. Empty means "use the default";
 * anything that is not an integer inside the bounds is rejected here because
 * the instance silently **drops** an out-of-range value rather than clamping,
 * which would make an unvalidated save look like a no-op.
 */
export function parseDatacenterPriorityDraft(
  text: string
): { ok: true; priority: number } | { ok: false; reason: string } {
  const trimmed = text.trim()
  if (trimmed.length === 0) {
    return { ok: true, priority: DEFAULT_DATACENTER_PRIORITY }
  }
  if (!/^\d+$/.test(trimmed)) {
    return { ok: false, reason: 'Priority must be a whole number.' }
  }
  const value = Number.parseInt(trimmed, 10)
  if (value < DATACENTER_PRIORITY_MIN || value > DATACENTER_PRIORITY_MAX) {
    return {
      ok: false,
      reason: `Priority must be between ${DATACENTER_PRIORITY_MIN} and ${DATACENTER_PRIORITY_MAX} (lower wins).`,
    }
  }
  return { ok: true, priority: value }
}

/**
 * The trusted shared datacenter the instance ladder picks for a server pair
 * (lowest `priority`, then id), or `null` when they share no trusted one.
 */
export function winningDatacenterId(
  left: readonly string[],
  right: readonly string[],
  policies: DatacenterPolicyMap
): string | null {
  return partitionSharedDatacenters(left, right, policies).trusted[0] ?? null
}

export type DatacenterWinnerHint = {
  winnerId: string
  loserId: string
  serverA: string
  serverB: string
}

type ServerWithMemberships = Readonly<{
  id: string
  name?: string | null
  hostname?: string | null
  datacenters?: readonly ServerDatacenterRef[] | null
}>

function serverTitle(server: ServerWithMemberships): string {
  return server.name?.trim() || server.hostname?.trim() || server.id
}

/**
 * The ladder's pick for one server pair, or `null` when the pair does not
 * share `datacenterId` plus at least one other trusted datacenter.
 */
function pairWinnerHint(
  a: ServerWithMemberships,
  b: ServerWithMemberships,
  datacenterId: string,
  policies: DatacenterPolicyMap
): DatacenterWinnerHint | null {
  const aIds = (a.datacenters ?? []).map((row) => row.id)
  const bIds = (b.datacenters ?? []).map((row) => row.id)
  const { trusted } = partitionSharedDatacenters(aIds, bIds, policies)
  if (trusted.length < 2 || !trusted.includes(datacenterId)) return null
  const winnerId = trusted[0]
  const loserId = winnerId === datacenterId ? trusted[1] : datacenterId
  if (!winnerId || !loserId) return null
  return { winnerId, loserId, serverA: serverTitle(a), serverB: serverTitle(b) }
}

/**
 * Find one server pair whose shared **trusted** datacenters include
 * `datacenterId` and at least one other, and report which one the ladder
 * picks. Pairs are scanned in server order, so the hint is stable across
 * re-renders. `null` when no pair shares more than one trusted datacenter
 * through this one — priority then changes nothing for this org.
 */
export function findDatacenterWinnerHint(
  datacenterId: string,
  servers: readonly ServerWithMemberships[],
  policies: DatacenterPolicyMap
): DatacenterWinnerHint | null {
  const members = servers.filter((server) =>
    (server.datacenters ?? []).some((row) => row.id === datacenterId)
  )
  for (const [i, a] of members.entries()) {
    for (const b of members.slice(i + 1)) {
      const hint = pairWinnerHint(a, b, datacenterId, policies)
      if (hint) return hint
    }
  }
  return null
}

/**
 * "Backhaul (priority 10) currently wins over Primary LAN (100) for
 * db-1 ↔ db-2." — plain-language reading of {@link findDatacenterWinnerHint}.
 */
export function formatDatacenterWinnerHint(
  hint: DatacenterWinnerHint,
  nameById: ReadonlyMap<string, string>,
  policies: DatacenterPolicyMap
): string {
  const name = (id: string) => nameById.get(id) ?? id
  const priority = (id: string) => policies.get(id)?.priority ?? DEFAULT_DATACENTER_PRIORITY
  return `${name(hint.winnerId)} (priority ${priority(hint.winnerId)}) currently wins over ${name(hint.loserId)} (${priority(hint.loserId)}) for ${hint.serverA} ↔ ${hint.serverB}.`
}

/**
 * `Datacenter · Backhaul (priority 10)` — the transport label for a managed
 * member whose stored transport is `datacenter`, naming the shared trusted
 * datacenter the ladder picked. Falls back to `baseLabel` when the pair shares
 * no trusted datacenter in the current membership data (the stored transport
 * is authoritative; the name is a hint).
 */
export function describeDatacenterTransport(
  params: Readonly<{
    baseLabel: string
    memberDatacenterIds: readonly string[]
    primaryDatacenterIds: readonly string[]
    policies: DatacenterPolicyMap
    nameById: ReadonlyMap<string, string>
  }>
): string {
  const winner = winningDatacenterId(
    params.memberDatacenterIds,
    params.primaryDatacenterIds,
    params.policies
  )
  if (!winner) return params.baseLabel
  const name = params.nameById.get(winner) ?? winner
  const priority = params.policies.get(winner)?.priority ?? DEFAULT_DATACENTER_PRIORITY
  return `${params.baseLabel} · ${name} (priority ${priority})`
}

type MembershipServer = Readonly<{ datacenters?: readonly ServerDatacenterRef[] | null }>

/** Map key for an unordered pair of network ids. */
function pairKey(a: string, b: string): string {
  return a < b ? `${a}\n${b}` : `${b}\n${a}`
}

/**
 * For each network, the other networks it shares at least two servers with:
 * the only case where both servers of a pair can pick between the two, so the
 * only case where priority decides anything. Trust is not applied here.
 */
export function sharedServerNetworks(
  servers: readonly MembershipServer[]
): Map<string, Set<string>> {
  const counts = new Map<string, number>()
  for (const server of servers) {
    const ids = [...new Set((server.datacenters ?? []).map((row) => row.id))]
    for (const [i, a] of ids.entries()) {
      for (const b of ids.slice(i + 1)) {
        const key = pairKey(a, b)
        counts.set(key, (counts.get(key) ?? 0) + 1)
      }
    }
  }
  const out = new Map<string, Set<string>>()
  for (const [key, count] of counts) {
    if (count < 2) continue
    const [a, b] = key.split('\n') as [string, string]
    out.set(a, (out.get(a) ?? new Set()).add(b))
    out.set(b, (out.get(b) ?? new Set()).add(a))
  }
  return out
}

function policyPriority(policies: DatacenterPolicyMap, id: string): number {
  return policies.get(id)?.priority ?? DEFAULT_DATACENTER_PRIORITY
}

function policyTrusted(policies: DatacenterPolicyMap, id: string): boolean {
  return policies.get(id)?.trusted ?? DEFAULT_DATACENTER_TRUSTED
}

/**
 * The trusted networks whose priority competes with `datacenterId`: they share
 * at least two servers with it. Ladder order (lower priority, then id). This
 * network's own trust is left to the caller, so a draft toggle can be honoured.
 */
export function priorityRivals(
  datacenterId: string,
  shared: ReadonlyMap<string, ReadonlySet<string>>,
  policies: DatacenterPolicyMap
): string[] {
  return [...(shared.get(datacenterId) ?? [])]
    .filter((id) => policyTrusted(policies, id))
    .sort((a, b) => policyPriority(policies, a) - policyPriority(policies, b) || a.localeCompare(b))
}

/**
 * Whether the priority of a network can change anything: it is trusted and
 * shares servers with another trusted network. Untrusted networks and networks
 * with no overlap keep their stored number but never show it.
 */
export function priorityMatters(
  datacenterId: string,
  trusted: boolean,
  shared: ReadonlyMap<string, ReadonlySet<string>>,
  policies: DatacenterPolicyMap
): boolean {
  return trusted && priorityRivals(datacenterId, shared, policies).length > 0
}

/** Rivals with the same priority number: the ladder then falls back to the id. */
export function priorityTies(
  datacenterId: string,
  priority: number,
  shared: ReadonlyMap<string, ReadonlySet<string>>,
  policies: DatacenterPolicyMap
): string[] {
  return priorityRivals(datacenterId, shared, policies).filter(
    (id) => policyPriority(policies, id) === priority
  )
}

/** "A", "A and B", "A, B and C". */
export function joinWithAnd(parts: readonly string[]): string {
  if (parts.length <= 1) return parts.join('')
  return `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}`
}

/** Why a priority tie between networks that share servers needs fixing. */
export const PRIORITY_TIE_ADVICE =
  'Which one carries traffic between their shared servers is then decided by an internal id. Give one of them a lower number.'

/** "Backhaul (priority 10) and Office LAN (priority 200)". */
export function formatPriorityRivals(
  ids: readonly string[],
  nameById: ReadonlyMap<string, string>,
  policies: DatacenterPolicyMap
): string {
  const parts = ids.map(
    (id) => `${nameById.get(id) ?? id} (priority ${policyPriority(policies, id)})`
  )
  return joinWithAnd(parts)
}

export type EqualPriorityWarning = Readonly<{
  code: 'equal_priority'
  priority: number
  datacenterIds: readonly string[]
}>

function equalPriorityWarnings(warnings: readonly DatacenterListWarning[]): EqualPriorityWarning[] {
  return warnings.flatMap((warning) =>
    warning.code === 'equal_priority' &&
    typeof warning.priority === 'number' &&
    Array.isArray(warning.datacenterIds)
      ? [
          {
            code: 'equal_priority',
            priority: warning.priority,
            datacenterIds: warning.datacenterIds,
          },
        ]
      : []
  )
}

/**
 * The list GET's `equal_priority` warnings narrowed to networks that share
 * servers with another network in the same group. The control plane reports
 * every trusted tie in the organization; a tie between networks that never
 * share a server pair decides nothing, so it is not shown.
 */
export function overlappingPriorityTies(
  warnings: readonly DatacenterListWarning[],
  shared: ReadonlyMap<string, ReadonlySet<string>>
): EqualPriorityWarning[] {
  const out: EqualPriorityWarning[] = []
  for (const warning of equalPriorityWarnings(warnings)) {
    const ids = warning.datacenterIds.filter((id) =>
      warning.datacenterIds.some((other) => other !== id && shared.get(id)?.has(other))
    )
    if (ids.length > 1) out.push({ ...warning, datacenterIds: ids })
  }
  return out
}

/**
 * The priority a Routing save sends. A hidden field (priority changes nothing
 * for this network) keeps the stored number, so a stale draft cannot block or
 * change the save; a shown field is validated like any typed value.
 */
export function priorityToSave(
  shown: boolean,
  draftText: string,
  stored: number
): ReturnType<typeof parseDatacenterPriorityDraft> {
  return shown ? parseDatacenterPriorityDraft(draftText) : { ok: true, priority: stored }
}

/** Ids of the networks whose priority can change anything (see {@link priorityMatters}). */
export function networksWherePriorityMatters(
  datacenters: readonly (DatacenterPolicySource & Readonly<{ trusted: boolean }>)[],
  shared: ReadonlyMap<string, ReadonlySet<string>>
): Set<string> {
  const policies = buildDatacenterPolicyMap(datacenters)
  return new Set(
    datacenters
      .filter((dc) => priorityMatters(dc.id, dc.trusted, shared, policies))
      .map((dc) => dc.id)
  )
}
