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
