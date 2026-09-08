import type { BillingTier, TierPlacementRecord, TierUnwatched } from '@/lib/instance-api'

/**
 * License-tier placement helpers — pure, shared by the servers table, the
 * server detail Overview, the metrics screen (Docker-usage gating) and the
 * billing screen's tier picker.
 *
 * The control plane sends tier **labels** on `tierPlacement` (`S1`…`S7`,
 * `SX`), never ranks, and it compares by `tier.rank` internally. When the
 * catalogue is loaded (hosted) the label → rank map comes from it; otherwise
 * (self-hosted, or before the catalogue query resolves) the `S<n>` shape is
 * parsed with `SX` — the negotiated top offering — ranked above every
 * numbered tier. A label neither side recognises ranks as unknown (`null`)
 * and every comparison against it answers "cannot tell" rather than
 * inventing a warning.
 */

/** The negotiated custom tier; ranked above every numbered tier by convention. */
export const CUSTOM_TIER_LABEL = 'SX'

/** The catalogue's entry tier — the one the Docker-usage family is not granted on. */
export const ENTRY_TIER_RANK = 1

const NUMBERED_TIER_LABEL = /^S(\d{1,2})$/i

export type TierRankResolver = (label: string | null | undefined) => number | null

/**
 * Builds a label → rank resolver from the catalogue, falling back to the
 * `S<n>` label shape when a label is missing from it (an older instance, or
 * a retired generation still bound to a license).
 */
export function tierRankResolver(tiers: readonly BillingTier[] | null | undefined): TierRankResolver {
  const byLabel = new Map<string, number>()
  for (const tier of tiers ?? []) {
    byLabel.set(tier.label.toUpperCase(), tier.rank)
  }
  return (label) => {
    if (!label) return null
    const upper = label.trim().toUpperCase()
    const known = byLabel.get(upper)
    if (known !== undefined) return known
    return tierRankFromLabel(upper)
  }
}

/** `S3` → 3, `SX` → above every numbered tier, anything else → `null`. */
export function tierRankFromLabel(label: string | null | undefined): number | null {
  if (!label) return null
  const upper = label.trim().toUpperCase()
  if (upper === CUSTOM_TIER_LABEL) return Number.MAX_SAFE_INTEGER
  const match = NUMBERED_TIER_LABEL.exec(upper)
  if (!match) return null
  const rank = Number(match[1])
  return rank >= 1 ? rank : null
}

export type TierPlacementState =
  /** No bound license tier (self-hosted, or unassigned). */
  | 'unlicensed'
  /** Cores or RAM exceed what the license covers — a hard floor violation. */
  | 'below-required'
  /** The floor holds but monitored NICs or discovered drives / GPUs exceed the plan's slots. */
  | 'below-recommended'
  /** License is well above what the hardware needs — informational only. */
  | 'above-hardware'
  | 'ok'
  /** One of the labels could not be ranked. */
  | 'unknown'

/**
 * Where the license sits relative to the hardware. `above-hardware` only
 * fires when the license is at least two ranks over the recommendation —
 * one step of headroom is a normal buying decision, not something to flag.
 */
export function tierPlacementState(
  placement: TierPlacementRecord | null | undefined,
  rankOf: TierRankResolver = tierRankFromLabel
): TierPlacementState {
  if (!placement?.licenseTier) return 'unlicensed'
  const license = rankOf(placement.licenseTier)
  const required = rankOf(placement.requiredTier)
  const recommended = rankOf(placement.recommendedTier)
  if (license == null || required == null || recommended == null) return 'unknown'
  if (license < required) return 'below-required'
  if (license < recommended) return 'below-recommended'
  if (license !== Number.MAX_SAFE_INTEGER && license >= recommended + 2) return 'above-hardware'
  return 'ok'
}

/** Whether `state` means some hardware is going unmonitored. */
export function isTierShortfall(state: TierPlacementState): boolean {
  return state === 'below-required' || state === 'below-recommended'
}

export type UnwatchedSummary = {
  drives: number
  nics: number
  gpus: number
  total: number
}

/** Counts either wire shape (`number` on the list, `string[]` on detail). */
export function summarizeUnwatched(
  unwatched: TierUnwatched<number | string[]> | null | undefined
): UnwatchedSummary {
  const count = (value: number | string[] | undefined): number => {
    if (Array.isArray(value)) return value.length
    return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : 0
  }
  const drives = count(unwatched?.drives)
  const nics = count(unwatched?.nics)
  const gpus = count(unwatched?.gpus)
  return { drives, nics, gpus, total: drives + nics + gpus }
}

function plural(count: number, singular: string, pluralForm: string): string {
  return `${count} ${count === 1 ? singular : pluralForm}`
}

/**
 * `2 drives, 1 NIC` — the parts that are non-zero, in drive / NIC / GPU
 * order. Empty string when nothing is unwatched.
 */
export function formatUnwatchedCounts(summary: UnwatchedSummary): string {
  const parts: string[] = []
  if (summary.drives > 0) parts.push(plural(summary.drives, 'drive', 'drives'))
  if (summary.nics > 0) parts.push(plural(summary.nics, 'NIC', 'NICs'))
  if (summary.gpus > 0) parts.push(plural(summary.gpus, 'GPU', 'GPUs'))
  return parts.join(', ')
}

/**
 * Names the unwatched devices from a detail placement (ids), joined with
 * the topology inventory when it can supply a friendlier name. Falls back
 * to the raw id so a device is never silently dropped from the list.
 */
export function describeUnwatchedDevices(
  unwatched: TierUnwatched<string[]> | null | undefined,
  names: Readonly<{
    drives?: ReadonlyMap<string, string>
    nics?: ReadonlyMap<string, string>
    gpus?: ReadonlyMap<string, string>
  }> = {}
): { drives: string[]; nics: string[]; gpus: string[] } {
  const resolve = (ids: string[] | undefined, map: ReadonlyMap<string, string> | undefined) =>
    (ids ?? []).map((id) => map?.get(id) ?? id)
  return {
    drives: resolve(unwatched?.drives, names.drives),
    nics: resolve(unwatched?.nics, names.nics),
    gpus: resolve(unwatched?.gpus, names.gpus),
  }
}

/**
 * True when the bound license is the entry tier — the one tier on which
 * the capability plan leaves `managedDockerEnabled` off. `null` /
 * unranked labels answer `false`: self-hosted has no license tier and the
 * platform default plan grants the family, so absence of a tier must not
 * hide it.
 */
export function isEntryTierLicense(
  licenseTier: string | null | undefined,
  rankOf: TierRankResolver = tierRankFromLabel
): boolean {
  return rankOf(licenseTier) === ENTRY_TIER_RANK
}
