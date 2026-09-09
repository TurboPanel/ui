import { describe, expect, it } from 'vitest'
import type { BillingTier, TierPlacementRecord } from '@/lib/instance-api'
import {
  describeUnwatchedDevices,
  formatUnwatchedCounts,
  isEntryTierLicense,
  isTierShortfall,
  summarizeUnwatched,
  tierPlacementState,
  tierRankFromLabel,
  tierRankResolver,
} from './tier-placement'

function tier(label: string, rank: number): BillingTier {
  return {
    id: `tier-${label}`,
    label,
    rank,
    priceCents: rank * 1000,
    currency: 'usd',
    isCustom: label === 'SX',
    entitlements: {
      maxCores: rank * 4,
      maxMemoryBytes: rank * 8 * 1024 ** 3,
      nicSlots: 1,
      driveSlots: rank,
      gpuSlots: 0,
      filesystemSlots: 0,
    },
  }
}

function placement(
  licenseTier: string | null,
  requiredTier: string,
  recommendedTier: string
): TierPlacementRecord<number> {
  return { licenseTier, requiredTier, recommendedTier, unwatched: { nics: 0, drives: 0, gpus: 0 } }
}

describe('tierRankFromLabel', () => {
  it('ranks the shipped ladder S1…S7 with SX on top', () => {
    expect(tierRankFromLabel('S1')).toBe(1)
    expect(tierRankFromLabel('s7')).toBe(7)
    expect(tierRankFromLabel(' S3 ')).toBe(3)
    expect(tierRankFromLabel('SX')).toBe(8)
    expect(tierRankFromLabel('SX')).toBeGreaterThan(tierRankFromLabel('S7')!)
  })

  it('answers null for anything off the ladder', () => {
    expect(tierRankFromLabel(null)).toBeNull()
    expect(tierRankFromLabel('')).toBeNull()
    expect(tierRankFromLabel('Pro')).toBeNull()
    expect(tierRankFromLabel('S0')).toBeNull()
    // The ladder stops at S7; nothing is invented for a label it does not carry.
    expect(tierRankFromLabel('S99')).toBeNull()
  })
})

describe('tierRankResolver', () => {
  it('prefers catalogue ranks and falls back to the label shape', () => {
    // A catalogue whose ranks do not follow the label number proves the
    // catalogue wins when it knows the label.
    const rankOf = tierRankResolver([tier('S1', 1), tier('S2', 5)])
    expect(rankOf('S2')).toBe(5)
    expect(rankOf('s1')).toBe(1)
    expect(rankOf('S4')).toBe(4)
    expect(rankOf('Enterprise')).toBeNull()
  })

  it('tolerates a missing catalogue', () => {
    expect(tierRankResolver(null)('S3')).toBe(3)
    expect(tierRankResolver(undefined)(undefined)).toBeNull()
  })
})

describe('tierPlacementState', () => {
  it('is unlicensed without a bound tier', () => {
    expect(tierPlacementState(placement(null, 'S2', 'S3'))).toBe('unlicensed')
    expect(tierPlacementState(null)).toBe('unlicensed')
  })

  it('flags the hard floor before the recommendation', () => {
    expect(tierPlacementState(placement('S1', 'S2', 'S3'))).toBe('below-required')
    expect(tierPlacementState(placement('S2', 'S2', 'S3'))).toBe('below-recommended')
    expect(tierPlacementState(placement('S3', 'S2', 'S3'))).toBe('ok')
  })

  it('treats one step of headroom as normal and two as over-provisioned', () => {
    expect(tierPlacementState(placement('S4', 'S2', 'S3'))).toBe('ok')
    expect(tierPlacementState(placement('S5', 'S2', 'S3'))).toBe('above-hardware')
    // The negotiated tier is never "too much" — its shape is bespoke,
    // whichever resolver ranks it.
    expect(tierPlacementState(placement('SX', 'S1', 'S1'))).toBe('ok')
    const catalogue = tierRankResolver([tier('S1', 1), tier('SX', 8)])
    expect(tierPlacementState(placement('SX', 'S1', 'S1'), catalogue)).toBe('ok')
  })

  it('does not invent a warning for a label it cannot rank', () => {
    expect(tierPlacementState(placement('Legacy', 'S2', 'S3'))).toBe('unknown')
    expect(tierPlacementState(placement('S2', 'S2', 'Custom'))).toBe('unknown')
  })

  it('uses the supplied resolver', () => {
    const rankOf = tierRankResolver([tier('Small', 1), tier('Large', 2)])
    expect(tierPlacementState(placement('Small', 'Large', 'Large'), rankOf)).toBe('below-required')
  })
})

describe('isTierShortfall', () => {
  it('is true only for the two under-licensed states', () => {
    expect(isTierShortfall('below-required')).toBe(true)
    expect(isTierShortfall('below-recommended')).toBe(true)
    expect(isTierShortfall('ok')).toBe(false)
    expect(isTierShortfall('above-hardware')).toBe(false)
    expect(isTierShortfall('unlicensed')).toBe(false)
    expect(isTierShortfall('unknown')).toBe(false)
  })
})

describe('summarizeUnwatched / formatUnwatchedCounts', () => {
  it('counts both wire shapes', () => {
    expect(summarizeUnwatched({ nics: 1, drives: 2, gpus: 0 })).toEqual({
      drives: 2,
      nics: 1,
      gpus: 0,
      total: 3,
    })
    expect(summarizeUnwatched({ nics: ['eth1'], drives: [], gpus: ['gpu0', 'gpu1'] })).toEqual({
      drives: 0,
      nics: 1,
      gpus: 2,
      total: 3,
    })
    expect(summarizeUnwatched(null).total).toBe(0)
    expect(summarizeUnwatched({ nics: -1, drives: Number.NaN, gpus: 0 }).total).toBe(0)
  })

  it('formats only the non-zero parts, pluralised', () => {
    expect(formatUnwatchedCounts(summarizeUnwatched({ nics: 1, drives: 2, gpus: 0 }))).toBe(
      '2 drives, 1 NIC'
    )
    expect(formatUnwatchedCounts(summarizeUnwatched({ nics: 0, drives: 0, gpus: 1 }))).toBe('1 GPU')
    expect(formatUnwatchedCounts(summarizeUnwatched(null))).toBe('')
  })
})

describe('describeUnwatchedDevices', () => {
  it('names devices from the inventory and keeps raw ids otherwise', () => {
    const out = describeUnwatchedDevices(
      { drives: ['blk-1', 'blk-2'], nics: ['net-9'], gpus: [] },
      {
        drives: new Map([['blk-1', 'nvme0n1 (Samsung 980)']]),
        nics: new Map([['net-9', 'eth1']]),
      }
    )
    expect(out).toEqual({ drives: ['nvme0n1 (Samsung 980)', 'blk-2'], nics: ['eth1'], gpus: [] })
    expect(describeUnwatchedDevices(null)).toEqual({ drives: [], nics: [], gpus: [] })
  })
})

describe('isEntryTierLicense', () => {
  it('is true for rank 1 only, and never for a missing tier', () => {
    expect(isEntryTierLicense('S1')).toBe(true)
    expect(isEntryTierLicense('S2')).toBe(false)
    expect(isEntryTierLicense(null)).toBe(false)
    expect(isEntryTierLicense('Legacy')).toBe(false)
    const rankOf = tierRankResolver([tier('Starter', 1)])
    expect(isEntryTierLicense('Starter', rankOf)).toBe(true)
  })
})
