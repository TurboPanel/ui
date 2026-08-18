import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ServerGeo } from '@/lib/instance-api'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetModules()
})

async function loadGeo() {
  return import('@/lib/server-geo')
}

describe('countryCodeToFlagEmoji', () => {
  it('returns empty for missing, blank, or non-alpha-2 codes', async () => {
    const { countryCodeToFlagEmoji } = await loadGeo()
    expect(countryCodeToFlagEmoji(undefined)).toBe('')
    expect(countryCodeToFlagEmoji(null)).toBe('')
    expect(countryCodeToFlagEmoji('')).toBe('')
    expect(countryCodeToFlagEmoji('   ')).toBe('')
    expect(countryCodeToFlagEmoji('U')).toBe('')
    expect(countryCodeToFlagEmoji('USA')).toBe('')
    expect(countryCodeToFlagEmoji('U1')).toBe('')
    expect(countryCodeToFlagEmoji('1S')).toBe('')
    expect(countryCodeToFlagEmoji('!!')).toBe('')
  })

  it('builds regional-indicator flag emoji from ISO alpha-2', async () => {
    const { countryCodeToFlagEmoji } = await loadGeo()
    expect(countryCodeToFlagEmoji('US')).toBe('🇺🇸')
    expect(countryCodeToFlagEmoji(' us ')).toBe('🇺🇸')
    expect(countryCodeToFlagEmoji('nl')).toBe('🇳🇱')
    expect(countryCodeToFlagEmoji('GB')).toBe('🇬🇧')
  })
})

describe('formatServerGeoCountryCode', () => {
  it('returns empty without geo or country', async () => {
    const { formatServerGeoCountryCode } = await loadGeo()
    expect(formatServerGeoCountryCode(undefined)).toBe('')
    expect(formatServerGeoCountryCode(null)).toBe('')
    expect(formatServerGeoCountryCode({})).toBe('')
    expect(formatServerGeoCountryCode({ country: '  ' })).toBe('')
  })

  it('uppercases trimmed country codes', async () => {
    const { formatServerGeoCountryCode } = await loadGeo()
    expect(formatServerGeoCountryCode({ country: ' us ' })).toBe('US')
  })
})

describe('formatServerGeoCountryName', () => {
  it('returns empty when country is absent', async () => {
    const { formatServerGeoCountryName } = await loadGeo()
    expect(formatServerGeoCountryName(undefined)).toBe('')
    expect(formatServerGeoCountryName(null)).toBe('')
    expect(formatServerGeoCountryName({})).toBe('')
  })

  it('resolves an English region label when Intl is available', async () => {
    const { formatServerGeoCountryName } = await loadGeo()
    const name = formatServerGeoCountryName({ country: 'US' })
    // Environments without DisplayNames fall back to the code.
    expect(name === 'United States' || name === 'US').toBe(true)
  })

  it('falls back to the code when DisplayNames returns the code itself', async () => {
    const { formatServerGeoCountryName } = await loadGeo()
    // ZZ is not a real ISO region; of() often returns the input or undefined.
    const name = formatServerGeoCountryName({ country: 'ZZ' })
    expect(typeof name).toBe('string')
    expect(name.length).toBeGreaterThan(0)
  })

  it('falls back to the country code when DisplayNames construction fails', async () => {
    vi.stubGlobal('Intl', {
      DisplayNames: class {
        constructor() {
          throw new Error('unsupported')
        }
      },
    })
    const { formatServerGeoCountryName } = await loadGeo()
    expect(formatServerGeoCountryName({ country: 'us' })).toBe('US')
  })

  it('falls back to the code when of() returns blank or the code', async () => {
    vi.stubGlobal('Intl', {
      DisplayNames: class {
        of() {
          return '  '
        }
      },
    })
    const blank = await loadGeo()
    expect(blank.formatServerGeoCountryName({ country: 'NL' })).toBe('NL')

    vi.resetModules()
    vi.stubGlobal('Intl', {
      DisplayNames: class {
        of(code: string) {
          return code
        }
      },
    })
    const same = await loadGeo()
    expect(same.formatServerGeoCountryName({ country: 'NL' })).toBe('NL')
  })
})

describe('formatServerGeoLocation', () => {
  it('returns empty without geo', async () => {
    const { formatServerGeoLocation } = await loadGeo()
    expect(formatServerGeoLocation(undefined)).toBe('')
    expect(formatServerGeoLocation(null)).toBe('')
  })

  it('joins city and region when both present', async () => {
    const { formatServerGeoLocation } = await loadGeo()
    const geo: ServerGeo = { city: ' Austin ', region: ' Texas ' }
    expect(formatServerGeoLocation(geo)).toBe('Austin, Texas')
  })

  it('omits absent parts', async () => {
    const { formatServerGeoLocation } = await loadGeo()
    expect(formatServerGeoLocation({ city: 'Austin' })).toBe('Austin')
    expect(formatServerGeoLocation({ region: 'Texas' })).toBe('Texas')
    expect(formatServerGeoLocation({ city: '  ', region: '  ' })).toBe('')
  })
})

describe('formatServerGeoAsn', () => {
  it('returns empty without geo', async () => {
    const { formatServerGeoAsn } = await loadGeo()
    expect(formatServerGeoAsn(undefined)).toBe('')
    expect(formatServerGeoAsn(null)).toBe('')
  })

  it('formats ASN with optional organization', async () => {
    const { formatServerGeoAsn } = await loadGeo()
    expect(formatServerGeoAsn({ asn: 13335 })).toBe('AS13335')
    expect(
      formatServerGeoAsn({ asn: 13335, asOrganization: ' Cloudflare, Inc. ' }),
    ).toBe('AS13335 (Cloudflare, Inc.)')
  })

  it('returns organization alone when ASN is missing or non-finite', async () => {
    const { formatServerGeoAsn } = await loadGeo()
    expect(formatServerGeoAsn({ asOrganization: 'Acme' })).toBe('Acme')
    expect(formatServerGeoAsn({ asn: Number.NaN, asOrganization: 'Acme' })).toBe(
      'Acme',
    )
    expect(formatServerGeoAsn({ asn: Number.POSITIVE_INFINITY })).toBe('')
    expect(formatServerGeoAsn({})).toBe('')
  })
})
