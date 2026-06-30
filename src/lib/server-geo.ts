import type { ServerGeo } from '@/lib/instance-api'

const REGIONAL_INDICATOR_BASE = 0x1f1e6
const ASCII_UPPER_A = 65

/** Convert ISO-3166-1 alpha-2 (e.g. `"US"`) to a regional-indicator flag emoji. */
export function countryCodeToFlagEmoji(country?: string | null): string {
  const code = country?.trim().toUpperCase()
  if (!code || code.length !== 2) return ''
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
    REGIONAL_INDICATOR_BASE + (first.charCodeAt(0) - ASCII_UPPER_A),
    REGIONAL_INDICATOR_BASE + (second.charCodeAt(0) - ASCII_UPPER_A),
  )
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
