import type { TierPlacementRecord } from '@/lib/instance-api'
import type { TierPlacementState } from '@/lib/tier-placement'

export type TierLabels = Pick<
  TierPlacementRecord,
  'licenseTier' | 'requiredTier' | 'recommendedTier'
>

export type PlacementCopy = Readonly<{ title: string; body: string; cta: string }>

/**
 * What to say when the server is short: not covered at all, over the
 * hard floor, or missing slots. Every variant names the tier the billing
 * page should open on.
 */
export function shortfallCopy(state: TierPlacementState, placement: TierLabels): PlacementCopy {
  if (state === 'unlicensed') {
    return {
      title: `Not covered — needs ${placement.requiredTier}`,
      body: `Nothing bought covers this server yet. Buy a license at ${placement.requiredTier} or move one up, and it is covered as soon as the change lands.`,
      cta: `Get a license at ${placement.requiredTier}`,
    }
  }
  if (state === 'below-required') {
    return {
      title: `This host exceeds what ${placement.licenseTier} covers`,
      body: `Cores or RAM are above the ${placement.licenseTier} ceiling; ${placement.requiredTier} is the floor for this hardware.`,
      cta: `Upgrade to ${placement.recommendedTier}`,
    }
  }
  return {
    title: `Some devices are not monitored on ${placement.licenseTier}`,
    body: `Moving to ${placement.recommendedTier} adds slots for every monitored NIC and every discovered drive and GPU.`,
    cta: `Upgrade to ${placement.recommendedTier}`,
  }
}

/** `License: S3` or `Not covered — needs S5`. */
export function licenseLine(placement: TierLabels): string {
  return placement.licenseTier ?? `Not covered — needs ${placement.requiredTier}`
}
