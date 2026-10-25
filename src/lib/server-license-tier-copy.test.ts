import { describe, expect, it } from 'vitest'
import {
  confirmClearLicenseTierPick,
  confirmLicenseTierChange,
  confirmLicenseTierMove,
  licenseTierTooSmallCopy,
} from './server-license-tier-copy'

describe('confirmLicenseTierMove', () => {
  it('names the from tier and free count in plain words', () => {
    expect(
      confirmLicenseTierMove({ fromLabel: 'S1', toLabel: 'S2', free: 6 })
    ).toBe('Move this server from S1 to S2. Uses 1 of your 6 free S2 licenses. No charge.')
  })

  it('says no license when no tier is assigned yet', () => {
    expect(confirmLicenseTierMove({ fromLabel: null, toLabel: 'S3', free: 1 })).toBe(
      'Move this server from no license to S3. Uses 1 of your 1 free S3 licenses. No charge.'
    )
  })
})

describe('confirmClearLicenseTierPick', () => {
  it('names the tier given back and says nothing replaces it', () => {
    expect(confirmClearLicenseTierPick('S4')).toContain("this server's S4 license")
    expect(confirmClearLicenseTierPick('S4')).toContain('no license until you assign one')
    expect(confirmClearLicenseTierPick()).toContain("Give back this server's license.")
  })
})

describe('licenseTierTooSmallCopy', () => {
  it('names the CPU and RAM limits in plain words', () => {
    expect(
      licenseTierTooSmallCopy({
        label: 'S2',
        entitlements: { maxCores: 10, maxMemoryBytes: 32 * 1024 ** 3 },
      })
    ).toBe('S2 allows up to 10 CPU cores and 32 GiB of RAM. This server has more, so it cannot use S2.')
    expect(licenseTierTooSmallCopy({ label: 'S9', entitlements: null })).toBe(
      'This server has more CPU cores or RAM than S9 allows.'
    )
  })
})

describe('confirmLicenseTierChange', () => {
  it('says an upgrade is billed now and a downgrade waits for the period end', () => {
    expect(confirmLicenseTierChange({ fromLabel: 'S1', toLabel: 'S3', upgrade: true })).toContain(
      'billed now'
    )
    expect(confirmLicenseTierChange({ fromLabel: 'S3', toLabel: 'S1', upgrade: false })).toContain(
      'at the end of this billing period'
    )
  })
})
