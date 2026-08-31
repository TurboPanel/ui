import { describe, expect, it } from 'vitest'
import {
  buildCpuStackSegments,
  clampPercent,
  finiteMetric,
  formatLoad,
  formatLoadPrimary,
  formatPercent,
  hasUsageMetrics,
  loadPercentOfCores,
  memoryUsedPercentFrom,
  swapUsedPercentFrom,
  usedPercentFromBytes,
} from './server-usage'

describe('formatLoad', () => {
  it('formats compact load1 for usage columns', () => {
    expect(formatLoad(null)).toBe('—')
    expect(formatLoad(0.42)).toBe('0.42')
    expect(formatLoad(12.34)).toBe('12.3')
  })
})

describe('loadPercentOfCores', () => {
  it('maps load/cores to percent', () => {
    expect(loadPercentOfCores(2, 4)).toBe(50)
    expect(loadPercentOfCores(4, 4)).toBe(100)
    expect(loadPercentOfCores(8, 4)).toBe(100)
  })

  it('returns null without cores or load', () => {
    expect(loadPercentOfCores(1.5, null)).toBeNull()
    expect(loadPercentOfCores(null, 4)).toBeNull()
    expect(loadPercentOfCores(1, 0)).toBeNull()
  })
})

describe('buildCpuStackSegments', () => {
  it('stacks user system residual iowait', () => {
    // usage is derived busy (100 − idle), so it already includes iowait;
    // residual active = usage − user − system − iowait.
    const stack = buildCpuStackSegments({
      usage: 60,
      user: 40,
      system: 10,
      iowait: 5,
    })
    expect(stack).toEqual({
      user: 40,
      system: 10,
      other: 5,
      iowait: 5,
    })
  })

  it('returns null when all missing', () => {
    expect(buildCpuStackSegments({})).toBeNull()
  })

  it('scales down when over 100', () => {
    const stack = buildCpuStackSegments({
      usage: 100,
      user: 80,
      system: 30,
      iowait: 20,
    })
    expect(stack).not.toBeNull()
    const sum =
      (stack?.user ?? 0) +
      (stack?.system ?? 0) +
      (stack?.other ?? 0) +
      (stack?.iowait ?? 0)
    expect(sum).toBeCloseTo(100, 5)
  })
})

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

describe('formatLoadPrimary and finiteMetric', () => {
  it('formats load triples and passes through finite metrics', () => {
    expect(formatLoadPrimary(null, null, null)).toBe('—')
    expect(formatLoadPrimary(0.42, 0.35, 0.28)).toBe('0.42/0.35/0.28')
    expect(finiteMetric(12)).toBe(12)
    expect(finiteMetric(Number.POSITIVE_INFINITY)).toBeNull()
  })
})

describe('hasUsageMetrics', () => {
  it('is false when every metric is missing', () => {
    expect(hasUsageMetrics({})).toBe(false)
    expect(
      hasUsageMetrics({
        cpuIdlePercent: null,
        load1: undefined,
        memoryPercent: null,
      }),
    ).toBe(false)
  })

  it('treats zero as a real sample', () => {
    expect(hasUsageMetrics({ cpuIdlePercent: 0 })).toBe(true)
    expect(hasUsageMetrics({ memoryPercent: 0 })).toBe(true)
    expect(hasUsageMetrics({ load1: 0 })).toBe(true)
  })

  it('is true when any displayed metric is finite', () => {
    expect(hasUsageMetrics({ swapPercent: 12.4 })).toBe(true)
    expect(hasUsageMetrics({ load15: 0.08 })).toBe(true)
  })

  it('ignores non-finite numbers', () => {
    expect(hasUsageMetrics({ cpuIdlePercent: Number.NaN })).toBe(false)
    expect(hasUsageMetrics({ load1: Number.POSITIVE_INFINITY })).toBe(false)
  })
})

describe('used-percent derivation from byte pairs', () => {
  it('derives used % from total/free', () => {
    expect(usedPercentFromBytes(1000, 250)).toBe(75)
    expect(memoryUsedPercentFrom(16_000, 4_000)).toBe(75)
    expect(swapUsedPercentFrom(8_000, 8_000)).toBe(0)
  })

  it('returns null without a usable capacity pair', () => {
    expect(usedPercentFromBytes(null, 250)).toBeNull()
    expect(usedPercentFromBytes(1000, null)).toBeNull()
    expect(usedPercentFromBytes(0, 0)).toBeNull()
    expect(usedPercentFromBytes(Number.NaN, 10)).toBeNull()
    expect(memoryUsedPercentFrom(undefined, undefined)).toBeNull()
    expect(swapUsedPercentFrom(0, 0)).toBeNull()
  })

  it('clamps free above total to 0% used', () => {
    expect(usedPercentFromBytes(1000, 1500)).toBe(0)
  })
})
