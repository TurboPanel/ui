import { describe, expect, it } from 'vitest'
import { fillSlowFamilyGrid, holdBucketsFor } from './metrics-cadence'

const EMPTY: Record<string, number> = {}

function grid(count: number, resolutionSeconds: number): number[] {
  return Array.from({ length: count }, (_, i) => i * resolutionSeconds * 1000)
}

describe('holdBucketsFor', () => {
  it('holds a 300 s family for four buckets at 60 s resolution', () => {
    expect(holdBucketsFor('filesystem', 60)).toBe(4)
    expect(holdBucketsFor('hardware.physical', 60)).toBe(4)
  })

  it('holds nothing once the bucket is as coarse as the write interval', () => {
    expect(holdBucketsFor('filesystem', 300)).toBe(0)
    expect(holdBucketsFor('filesystem', 900)).toBe(0)
  })

  it('holds a 300 s family for 29 buckets at the 10 s live resolution', () => {
    expect(holdBucketsFor('filesystem', 10)).toBe(29)
  })

  it('never holds a fast-tier family — its gaps are real', () => {
    expect(holdBucketsFor('block', 60)).toBe(0)
    expect(holdBucketsFor('gpu', 60)).toBe(0)
    expect(holdBucketsFor('network', 60)).toBe(0)
  })

  it('never holds on a nonsensical resolution', () => {
    expect(holdBucketsFor('filesystem', 0)).toBe(0)
    expect(holdBucketsFor('filesystem', -60)).toBe(0)
  })
})

describe('fillSlowFamilyGrid', () => {
  it('carries a reading across the buckets it covers instead of leaving nulls', () => {
    // A filesystem row every 5th bucket, which is what 300 s writes look like
    // on a 60 s grid. Without the hold this line would be 80% holes.
    const points = new Map([
      [0, { availableBytes: 100 }],
      [300_000, { availableBytes: 90 }],
    ])
    const filled = fillSlowFamilyGrid(
      grid(10, 60),
      (tMs) => points.get(tMs),
      holdBucketsFor('filesystem', 60),
      EMPTY
    )
    expect(filled.map((p) => p.values.availableBytes)).toEqual([
      100, 100, 100, 100, 100, 90, 90, 90, 90, 90,
    ])
  })

  it('breaks the line once the source stops reporting for longer than one window', () => {
    const points = new Map([[0, { availableBytes: 100 }]])
    const filled = fillSlowFamilyGrid(
      grid(8, 60),
      (tMs) => points.get(tMs),
      holdBucketsFor('filesystem', 60),
      EMPTY
    )
    // Held for the 4 buckets it covers, then a genuine gap.
    expect(filled.map((p) => p.values.availableBytes)).toEqual([
      100, 100, 100, 100, 100, undefined, undefined, undefined,
    ])
  })

  it('resumes cleanly after a real gap rather than back-filling it', () => {
    const points = new Map([
      [0, { availableBytes: 100 }],
      [420_000, { availableBytes: 50 }],
    ])
    const filled = fillSlowFamilyGrid(
      grid(9, 60),
      (tMs) => points.get(tMs),
      holdBucketsFor('filesystem', 60),
      EMPTY
    )
    expect(filled.map((p) => p.values.availableBytes)).toEqual([
      100, 100, 100, 100, 100, undefined, undefined, 50, 50,
    ])
  })

  it('leaves a fast-tier family untouched, so a dropped sample still shows as a gap', () => {
    const points = new Map([
      [0, { readBytesPerSecond: 10 }],
      [120_000, { readBytesPerSecond: 20 }],
    ])
    const filled = fillSlowFamilyGrid(
      grid(3, 60),
      (tMs) => points.get(tMs),
      holdBucketsFor('block', 60),
      EMPTY
    )
    expect(filled.map((p) => p.values.readBytesPerSecond)).toEqual([10, undefined, 20])
  })

  it('reports every bucket as a gap when the family never reported', () => {
    const filled = fillSlowFamilyGrid(
      grid(4, 60),
      () => undefined,
      holdBucketsFor('filesystem', 60),
      EMPTY
    )
    expect(filled.every((p) => p.values === EMPTY)).toBe(true)
  })

  it('keeps one entry per grid bucket, in order', () => {
    const bucketGrid = grid(6, 60)
    const filled = fillSlowFamilyGrid(
      bucketGrid,
      (tMs) => (tMs === 0 ? { v: 1 } : undefined),
      4,
      { v: 0 }
    )
    expect(filled.map((p) => p.tMs)).toEqual(bucketGrid)
  })
})
