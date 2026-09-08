import {
  DELINQUENT_SUBSCRIPTION_STATUSES,
  type BillingPendingChange,
  type BillingSubscriptionState,
  type BillingTier,
  type BillingTierSeats,
  type OrgServerRecord,
} from '@/lib/instance-api'
import type { BadgeTone } from '@/components/ui/badge'
import { isTierShortfall, tierPlacementState, type TierRankResolver } from '@/lib/tier-placement'

/**
 * Presentation helpers for the billing screen. Amounts arrive from the
 * provider as integer minor units and are formatted here — never summed,
 * prorated or otherwise computed on the client.
 */

/** `1999` + `usd` → `$19.99`; a missing currency renders the raw minor units. */
export function formatMinorUnits(
  amount: number | null | undefined,
  currency: string | null | undefined
): string {
  if (amount == null || !Number.isFinite(amount)) return '—'
  if (!currency) return `${(amount / 100).toFixed(2)}`
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: currency.toUpperCase(),
    }).format(amount / 100)
  } catch {
    return `${(amount / 100).toFixed(2)} ${currency.toUpperCase()}`
  }
}

/** Catalogue price per seat per month; custom tiers have no list price. */
export function formatTierPrice(tier: Pick<BillingTier, 'priceCents' | 'isCustom'>): string {
  if (tier.isCustom || tier.priceCents == null) return 'Contact us'
  return `${formatMinorUnits(tier.priceCents, 'usd')} / seat / month`
}

const GIB = 1024 ** 3

/** `17179869184` → `16 GiB` (whole GiB, one decimal when it is not whole). */
export function formatMemoryLimit(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '—'
  const gib = bytes / GIB
  return `${Number.isInteger(gib) ? gib : gib.toFixed(1)} GiB`
}

export type SubscriptionStatusView = {
  label: string
  tone: BadgeTone
}

/**
 * Provider status → operator-facing chip. Unknown statuses pass through
 * verbatim in a muted tone rather than being hidden.
 */
export function subscriptionStatusView(status: string | null | undefined): SubscriptionStatusView {
  switch (status) {
    case 'active':
      return { label: 'Active', tone: 'ok' }
    case 'trialing':
      return { label: 'Trial', tone: 'info' }
    case 'past_due':
      return { label: 'Past due', tone: 'danger' }
    case 'incomplete':
      return { label: 'Awaiting payment', tone: 'pending' }
    case 'canceled':
      return { label: 'Canceled', tone: 'muted' }
    case 'unpaid':
      return { label: 'Unpaid', tone: 'danger' }
    case 'incomplete_expired':
      return { label: 'Expired', tone: 'muted' }
    case null:
    case undefined:
    case '':
      return { label: 'No subscription', tone: 'muted' }
    default:
      return { label: status, tone: 'muted' }
  }
}

/**
 * Delinquent = the server refuses entitlement-raising changes
 * (`subscription_past_due`): `past_due` while Smart Retries run, `unpaid`
 * once they are exhausted. Both are still live subscriptions.
 */
export function isDelinquentSubscription(
  subscription: BillingSubscriptionState | null | undefined
): boolean {
  const status = subscription?.status
  return typeof status === 'string' && DELINQUENT_SUBSCRIPTION_STATUSES.has(status)
}

export type TierChangeDirection = 'upgrade' | 'downgrade' | 'same'

/** Compares two catalogue ranks; `same` also covers a missing side. */
export function tierChangeDirection(
  fromRank: number | null | undefined,
  toRank: number | null | undefined
): TierChangeDirection {
  if (fromRank == null || toRank == null || fromRank === toRank) return 'same'
  return toRank > fromRank ? 'upgrade' : 'downgrade'
}

/**
 * Sentence for a pending-change row. Tier ids are resolved to labels via
 * the catalogue; an unknown id falls back to the id so nothing is hidden.
 */
export function describePendingChange(
  change: BillingPendingChange,
  tiers: readonly Pick<BillingTier, 'id' | 'label'>[],
  serverNameForLicense: (licenseId: string) => string | null = () => null
): string {
  const label = (tierId: string | null): string =>
    tierId == null ? '—' : (tiers.find((tier) => tier.id === tierId)?.label ?? tierId)
  const subject =
    change.licenseId != null
      ? (serverNameForLicense(change.licenseId) ?? `license ${change.licenseId.slice(0, 8)}`)
      : `a ${label(change.fromTierId)} seat`
  switch (change.kind) {
    case 'upgrade':
      return `Upgrading ${subject} from ${label(change.fromTierId)} to ${label(change.toTierId)} — applies once the payment is confirmed.`
    case 'downgrade':
      return `Moving ${subject} from ${label(change.fromTierId)} to ${label(change.toTierId)} at the end of the current period.`
    case 'release-seat':
      return `Releasing ${subject} at the end of the current period.`
  }
}

/** The pending change (if any) that already targets this license — a second change is refused server-side. */
export function pendingChangeForLicense(
  changes: readonly BillingPendingChange[] | null | undefined,
  licenseId: string | null | undefined
): BillingPendingChange | null {
  if (!licenseId) return null
  return changes?.find((change) => change.licenseId === licenseId) ?? null
}

/** Seats summed across tiers — for the page-level tiles. */
export function totalSeats(tiers: readonly BillingTierSeats[]): {
  seats: number
  used: number
  free: number
} {
  let seats = 0
  let used = 0
  let free = 0
  for (const tier of tiers) {
    seats += tier.seats
    used += tier.licensesUsed
    free += tier.licensesFree
  }
  return { seats, used, free }
}

// ---------------------------------------------------------------------------
// Recognisable machine examples and the fleet's tier needs.
// ---------------------------------------------------------------------------

/** A familiar machine shape an operator can picture without running `nproc`. */
export type MachineExample = Readonly<{
  name: string
  cores: number
  memoryBytes: number
  gpus: number
}>

/**
 * Fixed shapes, smallest first. Each is *placed* against the live catalogue
 * ceilings rather than pinned to a tier, so an entitlement edit in
 * Admin → Tiers moves the examples with it.
 */
export const MACHINE_EXAMPLES: readonly MachineExample[] = [
  { name: 'Raspberry Pi 5', cores: 4, memoryBytes: 8 * GIB, gpus: 0 },
  { name: 'small VPS (2 vCPU · 4 GiB)', cores: 2, memoryBytes: 4 * GIB, gpus: 0 },
  { name: 'mid VPS (4 vCPU · 16 GiB)', cores: 4, memoryBytes: 16 * GIB, gpus: 0 },
  { name: 'large VPS (8 vCPU · 32 GiB)', cores: 8, memoryBytes: 32 * GIB, gpus: 0 },
  { name: 'dedicated box (16 cores · 64 GiB)', cores: 16, memoryBytes: 64 * GIB, gpus: 0 },
  {
    name: 'GPU workstation (24 cores · 128 GiB · 1 GPU)',
    cores: 24,
    memoryBytes: 128 * GIB,
    gpus: 1,
  },
  {
    name: 'dual-socket server (64 cores · 512 GiB · 4 GPUs)',
    cores: 64,
    memoryBytes: 512 * GIB,
    gpus: 4,
  },
]

type TierForPlacement = Pick<BillingTier, 'id' | 'label' | 'rank' | 'isCustom' | 'entitlements'>

/**
 * The lowest purchasable tier whose ceilings cover the shape, or `null`
 * when only a custom tier would — the same "smallest tier that fits" rule
 * the sizing hint tells the operator to apply by hand.
 */
export function lowestTierFor<T extends TierForPlacement>(
  shape: Pick<MachineExample, 'cores' | 'memoryBytes' | 'gpus'>,
  tiers: readonly T[]
): T | null {
  const ladder = tiers.filter((tier) => !tier.isCustom).sort((a, b) => a.rank - b.rank)
  return (
    ladder.find(
      (tier) =>
        tier.entitlements.maxCores >= shape.cores &&
        tier.entitlements.maxMemoryBytes >= shape.memoryBytes &&
        tier.entitlements.gpuSlots >= shape.gpus
    ) ?? null
  )
}

/** The examples that land on exactly this tier, in ladder order. */
export function machineExamplesForTier(
  tier: Pick<BillingTier, 'id'>,
  tiers: readonly TierForPlacement[],
  examples: readonly MachineExample[] = MACHINE_EXAMPLES
): MachineExample[] {
  return examples.filter((example) => lowestTierFor(example, tiers)?.id === tier.id)
}

/** `e.g. Raspberry Pi 5, small VPS (2 vCPU · 4 GiB)`; empty when nothing familiar lands here. */
export function formatMachineExamples(examples: readonly MachineExample[]): string {
  if (examples.length === 0) return ''
  return `e.g. ${examples.map((example) => example.name).join(', ')}`
}

export type FleetTierNeeds = Readonly<{
  total: number
  /** Servers with no licence, by the tier the control plane recommends, ladder order. */
  unlicensed: readonly { tier: string; count: number }[]
  /** Licensed servers whose licence sits below what their hardware needs. */
  short: readonly { serverId: string; name: string; licenseTier: string; needsTier: string }[]
  /** Servers the control plane has not sized yet (no placement reported). */
  unsized: number
}>

/**
 * What the rest of the fleet needs, read from each server's `tierPlacement`
 * — the control plane's own sizing, never a client-side re-derivation.
 */
export function summarizeFleetTierNeeds(
  servers: readonly OrgServerRecord[],
  rankOf: TierRankResolver
): FleetTierNeeds {
  const unlicensedByTier = new Map<string, number>()
  const short: { serverId: string; name: string; licenseTier: string; needsTier: string }[] = []
  let unsized = 0
  for (const server of servers) {
    const placement = server.tierPlacement
    if (!placement) {
      unsized += 1
      continue
    }
    const state = tierPlacementState(placement, rankOf)
    if (state === 'unlicensed') {
      unlicensedByTier.set(
        placement.recommendedTier,
        (unlicensedByTier.get(placement.recommendedTier) ?? 0) + 1
      )
    } else if (isTierShortfall(state) && placement.licenseTier) {
      short.push({
        serverId: server.id,
        name: server.name?.trim() || server.hostname?.trim() || server.id,
        licenseTier: placement.licenseTier,
        needsTier: placement.recommendedTier,
      })
    }
  }
  const unlicensed = [...unlicensedByTier.entries()]
    .map(([tier, count]) => ({ tier, count }))
    .sort(
      (a, b) =>
        (rankOf(a.tier) ?? Number.MAX_SAFE_INTEGER) - (rankOf(b.tier) ?? Number.MAX_SAFE_INTEGER)
    )
  return { total: servers.length, unlicensed, short, unsized }
}

/** Seats to buy per tier to cover every unlicensed server, as `2 × S3, 1 × S5`. */
export function formatUnlicensedNeeds(needs: FleetTierNeeds): string {
  return needs.unlicensed.map((entry) => `${entry.count} × ${entry.tier}`).join(', ')
}
