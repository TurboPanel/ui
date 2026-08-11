import type { ServerGeo } from '@/lib/instance-api'

const REGIONAL_INDICATOR_BASE = 0x1f1e6
const ASCII_UPPER_A = 65

let regionDisplayNames: Intl.DisplayNames | null | undefined

function getRegionDisplayNames(): Intl.DisplayNames | null {
  if (regionDisplayNames !== undefined) return regionDisplayNames
  try {
    regionDisplayNames = new Intl.DisplayNames(['en'], { type: 'region' })
  } catch {
    regionDisplayNames = null
  }
  return regionDisplayNames
}

/** Convert ISO-3166-1 alpha-2 (e.g. `"US"`) to a regional-indicator flag emoji. */
export function countryCodeToFlagEmoji(country?: string | null): string {
  const code = country?.trim().toUpperCase()
  if (code?.length !== 2) return ''
  const [first, second] = code
  if (
    first < 'A' ||
    first > 'Z' ||
    second < 'A' ||
    second > 'Z'
  ) {
    return ''
  }
  return String.fromCodePoint(
    REGIONAL_INDICATOR_BASE + ((first.codePointAt(0) ?? 0) - ASCII_UPPER_A),
    REGIONAL_INDICATOR_BASE + ((second.codePointAt(0) ?? 0) - ASCII_UPPER_A),
  )
}

/** English country/region name from ISO-3166-1 alpha-2 (e.g. `"United States"`). */
export function formatServerGeoCountryName(geo?: ServerGeo | null): string {
  const code = formatServerGeoCountryCode(geo)
  if (!code) return ''
  const names = getRegionDisplayNames()
  const label = names?.of(code)?.trim()
  return label && label !== code ? label : code
}

/** Build "City, State/Region" omitting absent parts. */
export function formatServerGeoLocation(geo?: ServerGeo | null): string {
  if (!geo) return ''
  const city = geo.city?.trim()
  const region = geo.region?.trim()
  if (city && region) return `${city}, ${region}`
  return city || region || ''
}

/** Uppercase country code for display beside the location (e.g. `"US"`). */
export function formatServerGeoCountryCode(geo?: ServerGeo | null): string {
  if (!geo) return ''
  return geo.country?.trim().toUpperCase() ?? ''
}

/** Format ASN and optional organization (e.g. `"AS13335 (Cloudflare, Inc.)"`). */
export function formatServerGeoAsn(geo?: ServerGeo | null): string {
  if (!geo) return ''
  const org = geo.asOrganization?.trim()
  const asn = geo.asn
  if (asn != null && Number.isFinite(asn)) {
    return org ? `AS${asn} (${org})` : `AS${asn}`
  }
  return org ?? ''
}
