import type {
  LocationField,
  LocationPatch,
  ResolvedLocation,
  ResolvedLocationFields,
  ServerGeo,
} from '@/lib/instance-api'

/**
 * Editable location for servers and datacenters. Cloudflare's connect-time
 * geo supplies the initial values; an operator may override any field. The
 * control plane resolves each field (override ?? detected) and returns it as
 * `location`; older control planes send only the raw geo, so display falls
 * back to that.
 */

/** Fields in form order. */
export const LOCATION_FIELDS: readonly LocationField[] = [
  'city',
  'region',
  'regionCode',
  'country',
  'asn',
  'asOrganization',
]

export const LOCATION_FIELD_LABELS: Readonly<Record<LocationField, string>> = {
  city: 'City',
  region: 'State',
  regionCode: 'State code',
  country: 'Country',
  asn: 'ASN number',
  asOrganization: 'ASN name',
}

/** One text value per field, as the edit form holds them. */
export type LocationDraft = Record<LocationField, string>

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** The resolved location when the control plane sent a usable one, else null. */
export function readResolvedLocation(value: unknown): ResolvedLocation | null {
  if (!isRecord(value) || !isRecord(value.detected)) return null
  return value as ResolvedLocation
}

function fieldsToGeo(fields: ResolvedLocationFields): ServerGeo | null {
  const geo: ServerGeo = {}
  if (fields.city) geo.city = fields.city
  if (fields.region) geo.region = fields.region
  if (fields.regionCode) geo.regionCode = fields.regionCode
  if (fields.country) geo.country = fields.country
  if (fields.asn != null && Number.isFinite(fields.asn)) geo.asn = fields.asn
  if (fields.asOrganization) geo.asOrganization = fields.asOrganization
  return Object.keys(geo).length > 0 ? geo : null
}

/**
 * The geo to display: the resolved `location` when present (so edits show),
 * else the raw detected geo from an older control plane.
 */
export function locationDisplayGeo(
  location: ResolvedLocation | null | undefined,
  fallback: ServerGeo | null | undefined,
): ServerGeo | null {
  const resolved = readResolvedLocation(location)
  if (resolved) return fieldsToGeo(resolved)
  return fallback ?? null
}

/** True when an operator has overridden at least one field. */
export function isCustomLocation(location: ResolvedLocation | null | undefined): boolean {
  const resolved = readResolvedLocation(location)
  return resolved?.source === 'custom'
}

function fieldText(value: string | number | null | undefined): string {
  if (value == null) return ''
  return String(value).trim()
}

/** Current value of every field as text (the form's starting point). */
export function locationDraftFrom(
  location: ResolvedLocation | null | undefined,
  fallback: ServerGeo | null | undefined,
): LocationDraft {
  const resolved = readResolvedLocation(location)
  const source: Partial<Record<LocationField, string | number | null | undefined>> =
    resolved ?? fallback ?? {}
  const draft = {} as LocationDraft
  for (const field of LOCATION_FIELDS) draft[field] = fieldText(source[field])
  return draft
}

/** Cloudflare's value for a field as text ('' when unknown). */
export function detectedFieldText(
  location: ResolvedLocation | null | undefined,
  fallback: ServerGeo | null | undefined,
  field: LocationField,
): string {
  const resolved = readResolvedLocation(location)
  if (resolved) return fieldText(resolved.detected[field])
  return fieldText(fallback?.[field])
}

/** Whether a field currently carries an operator override. */
export function isFieldOverridden(
  location: ResolvedLocation | null | undefined,
  field: LocationField,
): boolean {
  return readResolvedLocation(location)?.overridden.includes(field) ?? false
}

function normalizeDraftValue(field: LocationField, value: string): string {
  const trimmed = value.trim()
  return field === 'country' ? trimmed.toUpperCase() : trimmed
}

/**
 * The PATCH `location` body for the fields the operator changed, or null when
 * nothing changed. A field emptied in the form is sent as `null`: that clears
 * its override so the detected value shows again.
 */
export function buildLocationPatch(
  initial: LocationDraft,
  draft: LocationDraft,
): LocationPatch | null {
  const patch: LocationPatch = {}
  for (const field of LOCATION_FIELDS) {
    const before = normalizeDraftValue(field, initial[field])
    const after = normalizeDraftValue(field, draft[field])
    if (before === after) continue
    patch[field] = after === '' ? null : after
  }
  return Object.keys(patch).length > 0 ? patch : null
}

/** A patch that clears one field's override (its "use detected" action). */
export function clearFieldPatch(field: LocationField): LocationPatch {
  return { [field]: null }
}

/**
 * The field a `400 Invalid location.<field>` refusal names, so the form can
 * show the error beside that input; null for any other error.
 */
export function locationErrorField(error: unknown): LocationField | null {
  let message = ''
  if (error instanceof Error) message = error.message
  else if (typeof error === 'string') message = error
  const match = /Invalid location\.([A-Za-z]+)/.exec(message)
  const field = match?.[1] as LocationField | undefined
  return field && LOCATION_FIELDS.includes(field) ? field : null
}
