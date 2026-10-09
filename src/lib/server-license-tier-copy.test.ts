import { describe, expect, it } from 'vitest'
import { confirmLicenseTierMove } from './server-license-tier-copy'

describe('confirmLicenseTierMove', () => {
  it('names the from tier and free count in plain words', () => {
    expect(
      confirmLicenseTierMove({ fromLabel: 'S1', toLabel: 'S2', free: 6 })
    ).toBe('Move this server from S1 to S2. Uses 1 of your 6 free S2 licenses. No charge.')
  })

  it('uses the derive phrase when no tier is assigned yet', () => {
    expect(
      confirmLicenseTierMove({ fromLabel: null, toLabel: 'S3', free: 1 })
    ).toBe(
      'Move this server from the smallest that fits to S3. Uses 1 of your 1 free S3 licenses. No charge.'
    )
  })
})
