import { describe, expect, it } from 'vitest'
import {
  buildCpuStackSegments,
  loadPercentOfCores,
} from './server-usage'

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
