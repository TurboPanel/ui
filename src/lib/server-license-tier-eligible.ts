import type { BillingTier, TierFreeCount } from '@/lib/instance-api'
import { ENTRY_TIER_RANK, tierRankFromLabel, type TierRankResolver } from '@/lib/tier-placement'

export type EligibleTierPick = Readonly<{
  choices: BillingTier[]
  /** Required tier label could not be ranked — picks still start at the smallest catalogue tier. */
  requiredRankUnknown: boolean
}>

function minCatalogRank(tiers: readonly BillingTier[]): number | null {
  if (tiers.length === 0) return null
  return tiers.reduce((min, row) => Math.min(min, row.rank), tiers[0].rank)
}

/** Lowest rank an owner may pick: hardware floor, or the smallest tier when the floor is unknown. */
export function licenseTierPickFloorRank(
  requiredLabel: string,
  rankOf: TierRankResolver,
  catalogTiers: readonly BillingTier[]
): Readonly<{ floor: number; requiredRankUnknown: boolean }> {
  const need = rankOf(requiredLabel)
  if (need != null) return { floor: need, requiredRankUnknown: false }
  const minRank = minCatalogRank(catalogTiers)
  return {
    floor: minRank ?? ENTRY_TIER_RANK,
    requiredRankUnknown: catalogTiers.length > 0,
  }
}

/** Tiers at or above the hardware floor, in rank order. Never lists ranks below the floor. */
export function eligibleTiersForPick(
  tiers: readonly BillingTier[],
  requiredLabel: string,
  rankOf: TierRankResolver
): EligibleTierPick {
  const { floor, requiredRankUnknown } = licenseTierPickFloorRank(requiredLabel, rankOf, tiers)
  const choices = tiers.filter((tier) => tier.rank >= floor).sort((a, b) => a.rank - b.rank)
  return { choices, requiredRankUnknown }
}

/** Catalogue rows when loaded; otherwise synthesise from detail `tiersFree` so picks render before billing loads. */
export function pickerCatalogTiers(
  catalog: readonly BillingTier[],
  tiersFree: readonly TierFreeCount[] | undefined,
  rankOf: TierRankResolver = tierRankFromLabel
): BillingTier[] {
  if (catalog.length > 0) return [...catalog]
  return (tiersFree ?? []).map((row) => ({
    id: row.tierId,
    label: row.label,
    rank: rankOf(row.label) ?? ENTRY_TIER_RANK,
    priceCents: null,
    currency: 'usd',
    isCustom: row.label.trim().toUpperCase() === 'SX',
    entitlements: null,
  }))
}

export function hasLicenseTierPickerData(
  tiersFree: readonly TierFreeCount[] | undefined
): boolean {
  return tiersFree != null
}
