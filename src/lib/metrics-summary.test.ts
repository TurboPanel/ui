import { describe, expect, it } from 'vitest'
import { lastFiniteValue, summaryBars, summaryTone } from './metrics-summary'

describe('summaryBars', () => {
  it('scales a bounded metric against its ceiling, not its own peak', () => {
    // Percentages pass max=100 so two servers' bars are comparable.
    expect(summaryBars([0, 25, 50, 100], 4, 100)).toEqual([0, 0.25, 0.5, 1])
  })

  it('self-scales an unbounded metric to its own peak', () => {
    expect(summaryBars([0, 100, 200, 400], 4)).toEqual([0, 0.25, 0.5, 1])
  })

  it('averages within a bucket rather than sampling one point', () => {
    // 8 samples into 2 buckets: means are 10 and 30, peak 30.
    expect(summaryBars([10, 10, 10, 10, 30, 30, 30, 30], 2)).toEqual([1 / 3, 1])
  })

  it('keeps a gap as null rather than collapsing it to zero', () => {
    const bars = summaryBars([50, null, 100], 3, 100)
    expect(bars).toEqual([0.5, null, 1])
  })

  it('renders an all-zero series as a flat floor, not as gaps', () => {
    // Zero is a real reading — an idle host is not a missing host.
    expect(summaryBars([0, 0, 0, 0], 4)).toEqual([0, 0, 0, 0])
  })

  it('returns all-null for a series that never reported', () => {
    expect(summaryBars([], 4)).toEqual([null, null, null, null])
    expect(summaryBars([null, null], 2)).toEqual([null, null])
  })

  it('clamps a reading above the declared ceiling to a full bar', () => {
    expect(summaryBars([150], 1, 100)).toEqual([1])
  })

  it('produces exactly the requested bucket count, even from a shorter series', () => {
    expect(summaryBars([1, 2], 8)).toHaveLength(8)
  })

  it('returns nothing for a non-positive bucket count', () => {
    expect(summaryBars([1, 2, 3], 0)).toEqual([])
  })
})

describe('lastFiniteValue', () => {
  it('skips trailing gaps to find the most recent real reading', () => {
    expect(lastFiniteValue([10, 20, null, undefined])).toBe(20)
  })

  it('returns null when nothing ever reported', () => {
    expect(lastFiniteValue([null, undefined])).toBeNull()
    expect(lastFiniteValue([])).toBeNull()
  })

  it('treats zero as a real reading', () => {
    expect(lastFiniteValue([5, 0])).toBe(0)
  })

  it('ignores non-finite values', () => {
    expect(lastFiniteValue([5, Number.NaN, Number.POSITIVE_INFINITY])).toBe(5)
  })
})

describe('summaryTone', () => {
  const thresholds = { warning: 80, critical: 90 }

  it('shows no chip on a healthy value, so quiet sections stay quiet', () => {
    expect(summaryTone(50, thresholds)).toBeNull()
    expect(summaryTone(79.9, thresholds)).toBeNull()
  })

  it('escalates at each threshold boundary', () => {
    expect(summaryTone(80, thresholds)).toBe('warning')
    expect(summaryTone(89.9, thresholds)).toBe('warning')
    expect(summaryTone(90, thresholds)).toBe('critical')
  })

  it('treats a missing reading as absence, not as a fault', () => {
    expect(summaryTone(null, thresholds)).toBeNull()
    expect(summaryTone(Number.NaN, thresholds)).toBeNull()
  })
})
