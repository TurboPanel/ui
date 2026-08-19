/**
 * Pure Connect-panel helpers for managed read endpoint visibility.
 */

import type {
  ManagedMemberRecord,
  ManagedUserRecord,
} from '@/lib/managed-services'

/** True when at least one read-eligible *replica* exists (primary alone does not count). */
export function hasReadEligibleReplica(
  members: readonly ManagedMemberRecord[] | undefined,
): boolean {
  return (members ?? []).some(
    (m) => m.role === 'replica' && m.readEligible,
  )
}

/**
 * Logins whose ProxySQL default hostgroup is the reader side, sorted for a
 * stable chip order. Reads only reach a replica through one of these — a
 * read-write login always lands on the current primary.
 */
export function readOnlyLoginNames(
  users: readonly ManagedUserRecord[] | undefined,
): string[] {
  return (users ?? [])
    .filter((user) => user.connectionRole === 'read-only')
    .map((user) => user.username)
    .sort((a, b) => a.localeCompare(b))
}
