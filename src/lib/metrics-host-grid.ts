/**
 * Host-series bucket layout for the server metrics charts.
 *
 * The control plane marks which empty buckets are real gaps
 * (`HostSeriesChartResponse.gapBuckets`): a sample was due inside them and
 * never arrived. Other empty buckets are not missing data — the grid is finer
 * than the collection cadence (10 s buckets over 60 s samples), or the store
 * sampled rows down (Analytics Engine keeps one row standing for two samples)
 * — so the chart leaves them out and draws straight through instead of
 * banding them amber. A control plane that predates `gapBuckets` gets the old
 * reading: every empty bucket is a gap.
 */

export function bucketFloor(ms: number, resolutionSeconds: number): number {
  const bucketMs = resolutionSeconds * 1000
  return Math.floor(ms / bucketMs) * bucketMs
}

export function defaultExpectedSamplesPerBucket(resolutionSeconds: number): number {
  return Math.max(1, Math.round(resolutionSeconds / 60))
}

export type HostGridSlot<P> =
  { kind: 'point'; bucketMs: number; point: P } | { kind: 'gap'; bucketMs: number }

export type HostGridLayout<P> = {
  /** Every bucket the chart plots, ascending — points and gaps; covered empties are left out. */
  slots: HostGridSlot<P>[]
  /** Samples the window should hold (present + missing), for the coverage strip. */
  expectedSamples: number
  startMs: number
  endMs: number
}

type LayoutPoint = { at: string; sampleCount: number; expectedSampleCount?: number }

export function layoutHostGrid<P extends LayoutPoint>(input: {
  fromMs: number
  toMs: number
  resolutionSeconds: number
  points: readonly P[]
  sampleCount: number
  gapCount: number
  gapBuckets?: readonly string[]
}): HostGridLayout<P> {
  const bucketMs = input.resolutionSeconds * 1000
  const startMs = bucketFloor(input.fromMs, input.resolutionSeconds)
  const endMs = bucketFloor(input.toMs, input.resolutionSeconds)
  const defaultExpected = defaultExpectedSamplesPerBucket(input.resolutionSeconds)
  const pointByBucket = new Map(
    input.points.map((point) => [bucketFloor(Date.parse(point.at), input.resolutionSeconds), point])
  )
  const serverGaps =
    input.gapBuckets === undefined
      ? null
      : new Set(input.gapBuckets.map((at) => bucketFloor(Date.parse(at), input.resolutionSeconds)))

  const slots: HostGridSlot<P>[] = []
  let legacyExpected = 0
  for (let bucket = startMs; bucket < endMs; bucket += bucketMs) {
    const point = pointByBucket.get(bucket)
    if (point && point.sampleCount > 0) {
      slots.push({ kind: 'point', bucketMs: bucket, point })
      legacyExpected += point.expectedSampleCount ?? defaultExpected
      continue
    }
    if (serverGaps === null || serverGaps.has(bucket)) {
      slots.push({ kind: 'gap', bucketMs: bucket })
      legacyExpected += point?.expectedSampleCount ?? defaultExpected
    }
  }

  // With gapBuckets the control plane counted missing samples itself;
  // without, fall back to one expected bucket fill per grid slot.
  const expectedSamples =
    serverGaps === null ? legacyExpected : input.sampleCount + Math.max(0, input.gapCount)
  return { slots, expectedSamples, startMs, endMs }
}
