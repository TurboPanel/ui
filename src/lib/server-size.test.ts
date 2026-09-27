import { describe, expect, it } from 'vitest'
import type { BillingTier } from '@/lib/instance-api'
import { describeSizeFit, parseSizeOutput, sizeBandRows, tierForSize } from '@/lib/server-size'

const GIB = 1024 ** 3

function tier(label: string, rank: number, maxCores: number, maxGib: number): BillingTier {
  return {
    id: `t-${label}`,
    label,
    rank,
    priceCents: 500,
    currency: 'usd',
    isCustom: false,
    entitlements: {
      maxCores,
      maxMemoryBytes: maxGib * GIB,
      nicSlots: 2,
      driveSlots: 2,
      gpuSlots: 2,
      filesystemSlots: 9,
    },
  }
}

const LADDER: BillingTier[] = [
  tier('S2', 2, 10, 32),
  tier('S1', 1, 4, 16),
  tier('S3', 3, 16, 64),
  { ...tier('SX', 8, 9999, 9999), isCustom: true },
]

describe('parseSizeOutput', () => {
  it('reads the size command line', () => {
    expect(parseSizeOutput('8 cores, 31.3 GiB RAM')).toEqual({
      cores: 8,
      memoryBytes: Math.round(31.3 * GIB),
    })
  })

  it('tolerates the older "-> S2" suffix, a prompt around it and odd spacing', () => {
    expect(parseSizeOutput('root@adrastea:~# 4 cores ,  7.6 GiB RAM -> S1\n')).toEqual({
      cores: 4,
      memoryBytes: Math.round(7.6 * GIB),
    })
    expect(parseSizeOutput('1 core, 1 GiB RAM')?.cores).toBe(1)
  })

  it('refuses anything else', () => {
    expect(parseSizeOutput('')).toBeNull()
    expect(parseSizeOutput('nproc: 8')).toBeNull()
    expect(parseSizeOutput('0 cores, 4 GiB RAM')).toBeNull()
    expect(parseSizeOutput('4 cores, 0 GiB RAM')).toBeNull()
  })
})

describe('tierForSize', () => {
  it('picks the smallest tier whose cores AND memory both cover the server', () => {
    expect(tierForSize({ cores: 8, memoryBytes: 31.3 * GIB }, LADDER)?.label).toBe('S2')
    // Few cores but lots of RAM still needs the bigger tier.
    expect(tierForSize({ cores: 2, memoryBytes: 40 * GIB }, LADDER)?.label).toBe('S3')
    expect(tierForSize({ cores: 4, memoryBytes: 16 * GIB }, LADDER)?.label).toBe('S1')
  })

  it('never lands on a negotiated tier', () => {
    expect(tierForSize({ cores: 64, memoryBytes: 512 * GIB }, LADDER)).toBeNull()
  })
})

describe('sizeBandRows', () => {
  it('lists purchasable tiers in ladder order with their ceilings', () => {
    expect(sizeBandRows(LADDER)).toEqual([
      { tierId: 't-S1', label: 'S1', cores: '≤ 4 cores', memory: '≤ 16 GiB' },
      { tierId: 't-S2', label: 'S2', cores: '≤ 10 cores', memory: '≤ 32 GiB' },
      { tierId: 't-S3', label: 'S3', cores: '≤ 16 cores', memory: '≤ 64 GiB' },
    ])
  })

  it('skips a tier the ladder no longer describes', () => {
    expect(sizeBandRows([{ ...tier('S9', 9, 1, 1), entitlements: null }])).toEqual([])
  })
})

describe('describeSizeFit', () => {
  it('names the tier the server needs', () => {
    expect(describeSizeFit({ cores: 8, memoryBytes: Math.round(31.3 * GIB) }, { label: 'S2' })).toBe(
      '8 cores, 31.3 GiB RAM → S2'
    )
    expect(describeSizeFit({ cores: 1, memoryBytes: 2 * GIB }, { label: 'S1' })).toBe(
      '1 core, 2 GiB RAM → S1'
    )
  })

  it('points beyond the ladder at SX', () => {
    expect(describeSizeFit({ cores: 300, memoryBytes: 2048 * GIB }, null)).toBe(
      '300 cores, 2048 GiB RAM → larger than every listed tier; contact us for an SX license'
    )
  })
})
