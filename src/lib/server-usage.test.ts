import { describe, expect, it } from 'vitest'
import {
  clampPercent,
  finiteMetric,
  formatPercent,
  hasUsageMetrics,
  usedPercentFromBytes,
} from './server-usage'

describe('clampPercent and formatPercent', () => {
  it('clamps and formats percentages', () => {
    expect(clampPercent(-5)).toBe(0)
    expect(clampPercent(150)).toBe(100)
    expect(clampPercent(42.6)).toBe(42.6)
    expect(clampPercent(Number.NaN)).toBeNull()
    expect(formatPercent(null)).toBe('—')
    expect(formatPercent(42.6)).toBe('43%')
  })
})

describe('finiteMetric', () => {
  it('passes through finite metrics only', () => {
    expect(finiteMetric(12)).toBe(12)
    expect(finiteMetric(Number.POSITIVE_INFINITY)).toBeNull()
    expect(finiteMetric(null)).toBeNull()
    expect(finiteMetric(undefined)).toBeNull()
  })
})

describe('hasUsageMetrics', () => {
  it('is false when every metric is missing', () => {
    expect(hasUsageMetrics({})).toBe(false)
    expect(
      hasUsageMetrics({
        cpuBusyPercent: null,
        memoryPercent: null,
      })
    ).toBe(false)
  })

  it('treats zero as a real sample', () => {
    expect(hasUsageMetrics({ cpuBusyPercent: 0 })).toBe(true)
    expect(hasUsageMetrics({ memoryPercent: 0 })).toBe(true)
    expect(hasUsageMetrics({ swapPercent: 0 })).toBe(true)
  })

  it('is true when any displayed metric is finite', () => {
    expect(hasUsageMetrics({ swapPercent: 12.4 })).toBe(true)
  })

  it('ignores non-finite numbers', () => {
    expect(hasUsageMetrics({ cpuBusyPercent: Number.NaN })).toBe(false)
    expect(hasUsageMetrics({ memoryPercent: Number.POSITIVE_INFINITY })).toBe(false)
  })
})

describe('used-percent derivation from byte pairs', () => {
  it('derives used % from total/free', () => {
    expect(usedPercentFromBytes(1000, 250)).toBe(75)
  })

  it('returns null without a usable capacity pair', () => {
    expect(usedPercentFromBytes(null, 250)).toBeNull()
    expect(usedPercentFromBytes(1000, null)).toBeNull()
    expect(usedPercentFromBytes(0, 0)).toBeNull()
    expect(usedPercentFromBytes(Number.NaN, 10)).toBeNull()
  })

  it('clamps free above total to 0% used', () => {
    expect(usedPercentFromBytes(1000, 1500)).toBe(0)
  })
})
