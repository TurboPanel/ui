import type { LicenseRecord } from '@/lib/instance-api'

/** Unused registration keys — minted but not yet bound to a server. */
export function unboundPendingKeys(
  licenses: readonly LicenseRecord[],
): LicenseRecord[] {
  return licenses
    .filter((row) => row.boundServer == null)
    .slice()
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export function pendingKeyDisplayName(
  row: Pick<LicenseRecord, 'name'>,
): string {
  const name = row.name?.trim()
  return name && name.length > 0 ? name : 'Unnamed key'
}

export function unusedRegistrationKeysLabel(count: number): string {
  if (count === 1) return '1 unused registration key'
  return `${count} unused registration keys`
}
