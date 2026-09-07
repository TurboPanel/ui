/**
 * Rendering rules for families the control plane writes on a slow cadence.
 *
 * The instance decimates per family (`cadence-tiers-v5.ts`): filesystem space
 * and hardware-sensor readings are written every 5 minutes rather than every
 * tick, because neither moves within 60 seconds and an Analytics Engine row
 * is billed whether or not the value changed.
 *
 * That has a rendering consequence which must ship with it. Entity charts are
 * drawn on the *host* bucket grid, and the chart is configured not to
 * interpolate across nulls, so a family written every 300 s viewed at 60 s
 * resolution would have four empty buckets out of every five and its line
 * would be mostly holes — exactly the "the line just disappears" symptom
 * these charts already suffered from for a different reason.
 *
 * The fix is to hold each reading across the buckets it actually covers.
 * This is not interpolation: every decimated family is a gauge, so the value
 * genuinely *was* that for the whole interval. Holding is bounded to one tier
 * window so that a source which really stops reporting still breaks the line
 * instead of flat-lining forever.
 */

/** Entity families the control plane writes on the slow tier, and how often, in seconds. */
export const FAMILY_WRITE_INTERVAL_SECONDS: Readonly<Record<string, number>> = {
  filesystem: 300,
  'hardware.physical': 300,
}

/**
 * How many consecutive empty buckets may inherit the previous reading.
 *
 * One tier window minus the bucket the reading itself occupies. A family
 * written every 300 s at 60 s resolution holds for 4 buckets; at 300 s
 * resolution or coarser it holds for none, because every bucket then has its
 * own reading. Fast-tier families always return 0 — their gaps are real.
 */
export function holdBucketsFor(family: string, resolutionSeconds: number): number {
  const writeInterval = FAMILY_WRITE_INTERVAL_SECONDS[family]
  if (!writeInterval || resolutionSeconds <= 0) return 0
  return Math.max(0, Math.ceil(writeInterval / resolutionSeconds) - 1)
}

/**
 * Project a family's own points onto the host bucket grid, holding each
 * reading forward for at most `holdBuckets` empty buckets.
 *
 * `readBucket` returns the values recorded at that bucket, or `undefined`
 * when the family wrote nothing there. An empty object (`{}`) is the "no
 * data" marker downstream, so a bucket past the hold window reads as a gap.
 */
export function fillSlowFamilyGrid<V>(
  bucketGrid: readonly number[],
  readBucket: (tMs: number) => V | undefined,
  holdBuckets: number,
  empty: V
): { tMs: number; values: V }[] {
  let carried: V | null = null
  let heldFor = 0
  return bucketGrid.map((tMs) => {
    const own = readBucket(tMs)
    if (own !== undefined) {
      carried = own
      heldFor = 0
      return { tMs, values: own }
    }
    if (carried !== null && heldFor < holdBuckets) {
      heldFor += 1
      return { tMs, values: carried }
    }
    carried = null
    return { tMs, values: empty }
  })
}
