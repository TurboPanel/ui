import { describe, expect, it } from 'vitest'
import { licenseLine, shortfallCopy } from './tier-shortfall-copy'
import { orgBillingHref } from './org-navigation'

const labels = (licenseTier: string | null) => ({
  licenseTier,
  requiredTier: 'S5',
  recommendedTier: 'S6',
})

describe('a server nothing bought covers', () => {
  it('reads "Not covered - needs Sn" and offers a license at that tier', () => {
    const copy = shortfallCopy('unlicensed', labels(null))
    expect(copy.title).toBe('Not covered — needs S5')
    expect(copy.cta).toBe('Get a license at S5')
    expect(copy.body).toContain('Buy a license at S5')
    expect(licenseLine(labels(null))).toBe('Not covered — needs S5')
  })

  it('shows the tier it landed on once a license covers it', () => {
    expect(licenseLine(labels('S3'))).toBe('S3')
  })

  it('the button opens the billing page on the recommended tier', () => {
    expect(orgBillingHref('org-1', { tier: 'S6' })).toBe('/org-1/billing?tier=S6')
  })

  it('a server over the floor and a server with unwatched devices each name the tier to move to', () => {
    expect(shortfallCopy('below-required', labels('S3')).title).toBe(
      'This host exceeds what S3 covers'
    )
    expect(shortfallCopy('below-required', labels('S3')).cta).toBe('Upgrade to S6')
    expect(shortfallCopy('below-recommended', labels('S3')).cta).toBe('Upgrade to S6')
  })
})
