import { describe, expect, it } from 'vitest'
import type { ResolvedLocation, ResolvedLocationFields, ServerGeo } from '@/lib/instance-api'
import {
  buildLocationPatch,
  clearFieldPatch,
  detectedFieldText,
  isCustomLocation,
  isFieldOverridden,
  locationDisplayGeo,
  locationDraftFrom,
  locationErrorField,
} from '@/lib/location'

const DETECTED: ResolvedLocationFields = {
  city: 'Wichita',
  region: 'Kansas',
  regionCode: 'KS',
  country: 'US',
  asn: 13335,
  asOrganization: 'Cloudflare, Inc.',
}

function resolved(overrides: Partial<ResolvedLocationFields> = {}): ResolvedLocation {
  const overridden = Object.keys(overrides) as ResolvedLocation['overridden']
  return {
    ...DETECTED,
    ...overrides,
    source: overridden.length > 0 ? 'custom' : 'detected',
    overridden,
    detected: DETECTED,
  }
}

const RAW_GEO: ServerGeo = { city: 'Denver', region: 'Colorado', country: 'US', asn: 7922 }

describe('locationDisplayGeo', () => {
  it('shows the resolved location, including edits', () => {
    const geo = locationDisplayGeo(resolved({ city: 'Topeka' }), RAW_GEO)
    expect(geo).toEqual({
      city: 'Topeka',
      region: 'Kansas',
      regionCode: 'KS',
      country: 'US',
      asn: 13335,
      asOrganization: 'Cloudflare, Inc.',
    })
  })

  it('falls back to the raw geo when the control plane predates `location`', () => {
    expect(locationDisplayGeo(undefined, RAW_GEO)).toBe(RAW_GEO)
    expect(locationDisplayGeo(null, null)).toBeNull()
  })

  it('omits unknown fields and returns null when nothing is known', () => {
    const empty: ResolvedLocationFields = {
      city: null,
      region: null,
      regionCode: null,
      country: null,
      asn: null,
      asOrganization: null,
    }
    const location: ResolvedLocation = { ...empty, source: 'detected', overridden: [], detected: empty }
    expect(locationDisplayGeo(location, RAW_GEO)).toBeNull()
  })
})

describe('isCustomLocation / isFieldOverridden', () => {
  it('reflects the server source and overridden list', () => {
    expect(isCustomLocation(resolved())).toBe(false)
    expect(isCustomLocation(resolved({ city: 'Topeka' }))).toBe(true)
    expect(isCustomLocation(undefined)).toBe(false)
    expect(isFieldOverridden(resolved({ city: 'Topeka' }), 'city')).toBe(true)
    expect(isFieldOverridden(resolved({ city: 'Topeka' }), 'country')).toBe(false)
  })
})

describe('locationDraftFrom / detectedFieldText', () => {
  it('prefills every field as text from the resolved location', () => {
    expect(locationDraftFrom(resolved({ asn: 64512 }), RAW_GEO)).toEqual({
      city: 'Wichita',
      region: 'Kansas',
      regionCode: 'KS',
      country: 'US',
      asn: '64512',
      asOrganization: 'Cloudflare, Inc.',
    })
  })

  it('prefills from the raw geo on an older control plane', () => {
    expect(locationDraftFrom(undefined, RAW_GEO)).toEqual({
      city: 'Denver',
      region: 'Colorado',
      regionCode: '',
      country: 'US',
      asn: '7922',
      asOrganization: '',
    })
  })

  it('reads the detected value, not the override', () => {
    expect(detectedFieldText(resolved({ city: 'Topeka' }), RAW_GEO, 'city')).toBe('Wichita')
    expect(detectedFieldText(undefined, RAW_GEO, 'asn')).toBe('7922')
  })
})

describe('buildLocationPatch', () => {
  const initial = locationDraftFrom(resolved(), null)

  it('returns null when nothing changed (whitespace and case ignored where they should be)', () => {
    expect(buildLocationPatch(initial, { ...initial })).toBeNull()
    expect(buildLocationPatch(initial, { ...initial, city: '  Wichita ', country: 'us' })).toBeNull()
  })

  it('sends only the changed fields', () => {
    expect(
      buildLocationPatch(initial, { ...initial, city: 'Topeka', asOrganization: 'Acme Fiber' }),
    ).toEqual({ city: 'Topeka', asOrganization: 'Acme Fiber' })
  })

  it('upper-cases the country and passes an AS-prefixed ASN through', () => {
    expect(buildLocationPatch(initial, { ...initial, country: 'ca', asn: 'AS64512' })).toEqual({
      country: 'CA',
      asn: 'AS64512',
    })
  })

  it('sends null for an emptied field so its override clears', () => {
    expect(buildLocationPatch(initial, { ...initial, regionCode: '   ' })).toEqual({
      regionCode: null,
    })
  })
})

describe('clearFieldPatch', () => {
  it('clears one field back to detected', () => {
    expect(clearFieldPatch('city')).toEqual({ city: null })
  })
})

describe('locationErrorField', () => {
  it('names the field a 400 refusal points at', () => {
    expect(
      locationErrorField(new Error('/api/client/v1/servers/x failed: HTTP 400: Invalid location.country')),
    ).toBe('country')
    expect(locationErrorField('Invalid location.asn')).toBe('asn')
  })

  it('returns null for any other error', () => {
    expect(locationErrorField(new Error('HTTP 400: Invalid location field: planet'))).toBeNull()
    expect(locationErrorField(new Error('HTTP 500'))).toBeNull()
    expect(locationErrorField(null)).toBeNull()
    expect(locationErrorField({ message: 'Invalid location.city' })).toBeNull()
    expect(locationErrorField(42)).toBeNull()
  })
})
