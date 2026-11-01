import { parsePublicUrlEntry } from '@/lib/public-url-entry'
import type { InstanceHostnameInput, InstanceHostnamesSaveResult } from '@/lib/instance-api'

const HOST_CHANGED = 'primary-host-changed'
const ORIGIN_CHANGED = 'primary-origin-changed'

/**
 * The warning shown after a save that moved the primary name's public address.
 * A different host also moves the passkey RP ID, so passkeys are named there.
 */
export function primaryChangeNotice(result: InstanceHostnamesSaveResult): string | null {
  const hostChanged = result.warnings?.includes(HOST_CHANGED) === true
  if (!hostChanged && !result.warnings?.includes(ORIGIN_CHANGED)) return null
  const from = result.previousPrimaryOrigin ?? 'the old address'
  const to = result.primaryOrigin ?? 'the new address'
  const base = `Links now use ${to} instead of ${from}. OAuth callback URLs and Git webhook URLs registered with the old address must be updated.`
  if (!hostChanged) return base
  return `${base} Passkeys registered for the old address no longer work; sign in another way and register them again.`
}

/** Shown before a save that would make a different host the primary. */
export const PRIMARY_HOST_CONFIRM =
  'Passkeys registered for the old address will stop working. Make sure you can sign in another way first.'

type PrimaryRow = { host: string; isPrimary?: boolean }

function effectivePrimaryHost(rows: readonly PrimaryRow[]): string | null {
  const row = rows.find((item) => item.isPrimary) ?? rows[0]
  if (!row) return null
  return parsePublicUrlEntry(row.host)?.host ?? row.host.trim().toLowerCase()
}

/** True when saving `draft` would move the primary to a different host than `stored` has. */
export function primaryHostWouldChange(
  stored: readonly PrimaryRow[],
  draft: readonly PrimaryRow[]
): boolean {
  const before = effectivePrimaryHost(stored)
  return before !== null && before !== effectivePrimaryHost(draft)
}

/** Make one row the only primary; every other row loses the flag. */
export function withPrimary(
  rows: readonly InstanceHostnameInput[],
  index: number
): InstanceHostnameInput[] {
  return rows.map((row, i) => ({ ...row, isPrimary: i === index }))
}

/** With no primary set the oldest (first) name acts as the primary. */
export function isEffectivePrimary(rows: readonly InstanceHostnameInput[], index: number): boolean {
  return rows.some((row) => row.isPrimary) ? rows[index]?.isPrimary === true : index === 0
}
