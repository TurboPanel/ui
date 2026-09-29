import { formatMemoryLimit, lowestTierFor } from '@/lib/billing-display'
import type { BillingTier } from '@/lib/instance-api'

const GIB = 1024 ** 3

/** What the size command printed on a server. */
export type ServerSize = Readonly<{ cores: number; memoryBytes: number }>

/** Everything after the core count; matched only at the end of a digit run, so it never rescans. */
const SIZE_TAIL = /\s*cores?\s*,\s*(\d+(?:\.\d+)?)\s*GiB\s*RAM/iy

/**
 * The first `<cores> cores, <n> GiB RAM` in `text` as `[cores, gib]` digit
 * strings. Each maximal digit run is tried as the core count in turn with an
 * anchored tail match, so the scan stays linear (one unanchored regex would
 * retry from every digit and backtrack over the whitespace).
 */
function findSizeMatch(text: string): [string, string] | null {
  for (const run of text.matchAll(/\d+/g)) {
    SIZE_TAIL.lastIndex = run.index + run[0].length
    const tail = SIZE_TAIL.exec(text)
    if (tail) return [run[0], tail[1]]
  }
  return null
}

/**
 * Reads the size command's output — `8 cores, 31.3 GiB RAM` (an older
 * control plane appended `-> S2`, which is ignored). Tolerates extra
 * whitespace and pasted surroundings; `null` when it is not that line.
 */
export function parseSizeOutput(text: string): ServerSize | null {
  const match = findSizeMatch(text)
  if (!match) return null
  const cores = Number(match[0])
  const gib = Number(match[1])
  if (!Number.isSafeInteger(cores) || cores < 1 || !Number.isFinite(gib) || gib <= 0) return null
  return { cores, memoryBytes: Math.round(gib * GIB) }
}

type TierForSize = Pick<BillingTier, 'id' | 'label' | 'rank' | 'isCustom' | 'entitlements'>

/**
 * The smallest purchasable tier whose core AND memory ceilings both cover
 * the server; `null` when only a negotiated (SX) tier would.
 */
export function tierForSize<T extends TierForSize>(size: ServerSize, tiers: readonly T[]): T | null {
  return lowestTierFor({ cores: size.cores, memoryBytes: size.memoryBytes, gpus: 0 }, tiers)
}

export type SizeBandRow = Readonly<{ tierId: string; label: string; cores: string; memory: string }>

/** `S1 · ≤ 4 cores · ≤ 16 GiB`, one row per purchasable tier in ladder order. */
export function sizeBandRows(tiers: readonly TierForSize[]): SizeBandRow[] {
  return tiers
    .filter((tier) => !tier.isCustom && tier.entitlements != null)
    .slice()
    .sort((a, b) => a.rank - b.rank)
    .map((tier) => ({
      tierId: tier.id,
      label: tier.label,
      cores: `≤ ${tier.entitlements?.maxCores ?? 0} cores`,
      memory: `≤ ${formatMemoryLimit(tier.entitlements?.maxMemoryBytes ?? 0)}`,
    }))
}

/** `8 cores, 31.3 GiB RAM → S2`, or a pointer to SX when nothing on the ladder covers it. */
export function describeSizeFit(size: ServerSize, tier: Pick<BillingTier, 'label'> | null): string {
  const shape = `${size.cores} ${size.cores === 1 ? 'core' : 'cores'}, ${formatMemoryLimit(size.memoryBytes)} RAM`
  return tier
    ? `${shape} → ${tier.label}`
    : `${shape} → larger than every listed tier; contact us for an SX license`
}
