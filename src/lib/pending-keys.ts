import { formatLocalDateTime } from '@/lib/format-datetime'
import type { LicenseRecord } from '@/lib/instance-api'

function newestFirst(rows: readonly LicenseRecord[]): LicenseRecord[] {
  return rows.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

/**
 * Unused registration keys — minted, not bound to a server, and not
 * provisioning one. A key whose daemon has started enrolling is in use, not
 * unused, even before the server is bound.
 */
export function unboundPendingKeys(licenses: readonly LicenseRecord[]): LicenseRecord[] {
  return newestFirst(licenses.filter((row) => row.boundServer == null && row.provisioning == null))
}

/** Keys whose server is being provisioned right now (enrolling, not bound yet). */
export function provisioningKeys(licenses: readonly LicenseRecord[]): LicenseRecord[] {
  return newestFirst(licenses.filter((row) => row.boundServer == null && row.provisioning != null))
}

export function pendingKeyDisplayName(row: Pick<LicenseRecord, 'name'>): string {
  const name = row.name?.trim()
  return name && name.length > 0 ? name : 'Unnamed key'
}

export function unusedRegistrationKeysLabel(count: number): string {
  if (count === 1) return '1 unused registration key'
  return `${count} unused registration keys`
}

/**
 * `1 server provisioning (adrastea) since 26/09/2026, 23:50` for one key,
 * `2 servers provisioning` for more; `null` when none is.
 */
export function provisioningServersLabel(rows: readonly LicenseRecord[]): string | null {
  if (rows.length === 0) return null
  if (rows.length > 1) return `${rows.length} servers provisioning`
  const only = rows[0].provisioning
  const hostname = only?.hostname?.trim()
  const since = only?.since ? formatLocalDateTime(only.since, { includeSeconds: false }) : null
  const named = hostname ? ` (${hostname})` : ''
  const dated = since ? ` since ${since}` : ''
  return `1 server provisioning${named}${dated}`
}

/** The tier an unused key holds a license at (chosen in Add Server), or a dash. */
export function pendingKeyTierLabel(row: Pick<LicenseRecord, 'tier'>): string {
  return row.tier?.label ?? '—'
}

const DAY_MS = 24 * 60 * 60 * 1000

/** `Expires in 3 days` / `Expires in less than a day` / `Expired` / `Does not expire`. */
export function pendingKeyExpiryLabel(
  row: Pick<LicenseRecord, 'expiresAt' | 'expired'>,
  nowMs: number = Date.now()
): string {
  if (row.expired) return 'Expired'
  const at = row.expiresAt ? Date.parse(row.expiresAt) : Number.NaN
  if (!Number.isFinite(at)) return 'Does not expire'
  const left = at - nowMs
  if (left <= 0) return 'Expired'
  if (left < DAY_MS) return 'Expires in less than a day'
  const days = Math.floor(left / DAY_MS)
  return days === 1 ? 'Expires in 1 day' : `Expires in ${days} days`
}
