import { describe, expect, it } from 'vitest'
import {
  buildCpuStackSegments,
  formatLoad,
  hasUsageMetrics,
  loadPercentOfCores,
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
    const stack = buildCpuStackSegments({
      usage: 60,
      user: 40,
      system: 10,
      iowait: 5,
    })
    expect(stack).toEqual({
      user: 40,
      system: 10,
      other: 10,
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

describe('hasUsageMetrics', () => {
  it('is false when every metric is missing', () => {
    expect(hasUsageMetrics({})).toBe(false)
    expect(
      hasUsageMetrics({
        cpuUsagePercent: null,
        load1: undefined,
        memoryPercent: null,
      }),
    ).toBe(false)
  })

  it('treats zero as a real sample', () => {
    expect(hasUsageMetrics({ cpuUsagePercent: 0 })).toBe(true)
    expect(hasUsageMetrics({ memoryPercent: 0 })).toBe(true)
    expect(hasUsageMetrics({ load1: 0 })).toBe(true)
  })

  it('is true when any displayed metric is finite', () => {
    expect(hasUsageMetrics({ swapPercent: 12.4 })).toBe(true)
    expect(hasUsageMetrics({ load15: 0.08 })).toBe(true)
  })

  it('ignores non-finite numbers', () => {
    expect(hasUsageMetrics({ cpuUsagePercent: Number.NaN })).toBe(false)
    expect(hasUsageMetrics({ load1: Number.POSITIVE_INFINITY })).toBe(false)
  })
})
