import type { InstanceHostnameInput, InstanceHostnamesSaveResult } from '@/lib/instance-api'

/** The warning shown after a save that moved the primary name's public address. */
export function primaryChangeNotice(result: InstanceHostnamesSaveResult): string | null {
  if (!result.warnings?.includes('primary-origin-changed')) return null
  const from = result.previousPrimaryOrigin ?? 'the old address'
  const to = result.primaryOrigin ?? 'the new address'
  return `Links now use ${to} instead of ${from}. OAuth callback URLs and Git webhook URLs registered with the old address must be updated.`
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
