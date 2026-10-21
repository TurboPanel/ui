import { describe, expect, it } from 'vitest'
import type { BillingTier } from '@/lib/instance-api'
import {
  eligibleTiersForPick,
  hasLicenseTierPickerData,
  pickerCatalogTiers,
} from './server-license-tier-eligible'
import { tierRankFromLabel } from './tier-placement'

function tier(label: string, rank: number): BillingTier {
  return {
    id: `id-${label}`,
    label,
    rank,
    priceCents: rank * 100,
    currency: 'usd',
    isCustom: false,
    entitlements: null,
  }
}

describe('eligibleTiersForPick', () => {
  const catalog = [tier('S1', 1), tier('S2', 2), tier('S3', 3)]

  it('drops tiers below the ranked required floor', () => {
    const { choices, requiredRankUnknown } = eligibleTiersForPick(catalog, 'S2', tierRankFromLabel)
    expect(choices.map((row) => row.label)).toEqual(['S2', 'S3'])
    expect(requiredRankUnknown).toBe(false)
  })

  it('never lists tiers below the smallest catalogue tier when required is unranked', () => {
    const { choices, requiredRankUnknown } = eligibleTiersForPick(
      catalog,
      'MYSTERY',
      tierRankFromLabel
    )
    expect(choices.map((row) => row.label)).toEqual(['S1', 'S2', 'S3'])
    expect(requiredRankUnknown).toBe(true)
  })
})

describe('pickerCatalogTiers', () => {
  it('falls back to tiersFree before the billing catalogue resolves', () => {
    const rows = pickerCatalogTiers(
      [],
      [{ tierId: 'id-s2', label: 'S2', free: 2 }],
      tierRankFromLabel
    )
    expect(rows).toHaveLength(1)
    expect(rows[0].label).toBe('S2')
  })
})

describe('hasLicenseTierPickerData', () => {
  it('is true only when tiersFree is present on the detail record', () => {
    expect(hasLicenseTierPickerData(undefined)).toBe(false)
    expect(hasLicenseTierPickerData([])).toBe(true)
  })
})
