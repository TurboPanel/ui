/**
 * Pure Connect-panel helpers for managed read endpoint visibility.
 */

import type { ManagedMemberRecord } from '@/lib/managed-services'

/** True when at least one read-eligible *replica* exists (primary alone does not count). */
export function hasReadEligibleReplica(
  members: readonly ManagedMemberRecord[] | undefined,
): boolean {
  return (members ?? []).some(
    (m) => m.role === 'replica' && m.readEligible,
  )
}
