import { describe, expect, it } from 'vitest'

import { bucketFloor, defaultExpectedSamplesPerBucket, layoutHostGrid } from './metrics-host-grid'

const T0 = Date.UTC(2026, 8, 27, 20, 0, 0)
const iso = (ms: number) => new Date(ms).toISOString()
const point = (ms: number, sampleCount = 1) => ({ at: iso(ms), sampleCount })

describe('layoutHostGrid', () => {
  it('keeps the legacy reading when the control plane sends no gapBuckets', () => {
    // 60 s buckets, every other one empty (the AE-sampled testing data).
    const points = [0, 2, 4].map((i) => point(T0 + i * 60_000, 2))
    const layout = layoutHostGrid({
      fromMs: T0,
      toMs: T0 + 6 * 60_000,
      resolutionSeconds: 60,
      points,
      sampleCount: 6,
      gapCount: 3,
    })
    expect(layout.slots.map((slot) => slot.kind)).toEqual([
      'point',
      'gap',
      'point',
      'gap',
      'point',
      'gap',
    ])
    expect(layout.expectedSamples).toBe(6)
  })

  it('bands only the server-marked gaps and draws through covered empty buckets', () => {
    // 10 s grid over a 60 s cadence: one point per minute, one real miss at +2 min.
    const points = [0, 1, 3].map((m) => point(T0 + m * 60_000))
    const layout = layoutHostGrid({
      fromMs: T0,
      toMs: T0 + 4 * 60_000,
      resolutionSeconds: 10,
      points,
      sampleCount: 3,
      gapCount: 1,
      gapBuckets: [iso(T0 + 120_000)],
    })
    expect(layout.slots).toEqual([
      { kind: 'point', bucketMs: T0, point: points[0] },
      { kind: 'point', bucketMs: T0 + 60_000, point: points[1] },
      { kind: 'gap', bucketMs: T0 + 120_000 },
      { kind: 'point', bucketMs: T0 + 180_000, point: points[2] },
    ])
    expect(layout.expectedSamples).toBe(4)
  })

  it('treats a zero-sample point as a gap and ignores gaps outside the window', () => {
    const layout = layoutHostGrid({
      fromMs: T0,
      toMs: T0 + 120_000,
      resolutionSeconds: 60,
      points: [point(T0, 0), point(T0 + 60_000)],
      sampleCount: 1,
      gapCount: 1,
      gapBuckets: [iso(T0), iso(T0 + 600_000)],
    })
    expect(layout.slots.map((slot) => [slot.kind, slot.bucketMs])).toEqual([
      ['gap', T0],
      ['point', T0 + 60_000],
    ])
  })

  it('never reports negative expected samples', () => {
    const layout = layoutHostGrid({
      fromMs: T0,
      toMs: T0 + 60_000,
      resolutionSeconds: 60,
      points: [point(T0)],
      sampleCount: 1,
      gapCount: -5,
      gapBuckets: [],
    })
    expect(layout.expectedSamples).toBe(1)
  })
})

describe('grid helpers', () => {
  it('floors to the bucket and expects at least one sample per bucket', () => {
    expect(bucketFloor(T0 + 59_999, 60)).toBe(T0)
    expect(defaultExpectedSamplesPerBucket(10)).toBe(1)
    expect(defaultExpectedSamplesPerBucket(300)).toBe(5)
  })
})
