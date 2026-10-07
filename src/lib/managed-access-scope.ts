/**
 * Client mirror of the control-plane managed SQL access scopes
 * (`turbopanel/src/features/managed/access-scope.ts`).
 */

import { TURBOFABRIC_PRODUCT_NAME } from '@/lib/platform-copy'

export type ManagedSqlAccessScope =
  | 'local'
  | 'datacenter'
  | 'turbofabric'
  | 'public'

export const MANAGED_SQL_ACCESS_SCOPES: readonly ManagedSqlAccessScope[] = [
  'local',
  'datacenter',
  'turbofabric',
  'public',
]

/**
 * Same as the control plane: a cluster that does not name a scope listens on
 * this server only. Saving settings echoes the scope back, so this must match,
 * or an unrelated save would widen an older cluster.
 */
export const DEFAULT_MANAGED_SQL_ACCESS_SCOPE: ManagedSqlAccessScope = 'local'

export function isManagedSqlAccessScope(
  value: unknown,
): value is ManagedSqlAccessScope {
  return typeof value === 'string' &&
    (MANAGED_SQL_ACCESS_SCOPES as readonly string[]).includes(value)
}

const SCOPE_LABELS: Record<ManagedSqlAccessScope, string> = {
  local: 'Local',
  datacenter: 'Datacenter',
  turbofabric: TURBOFABRIC_PRODUCT_NAME,
  public: 'Public',
}

const SCOPE_HINTS: Record<ManagedSqlAccessScope, string> = {
  local:
    'This server only: sites on this server connect on 127.0.0.1, and containers bound to the database use the private Docker network.',
  datacenter:
    'Clients on the same datacenter private network dial the server pin address.',
  turbofabric: `Clients on the org ${TURBOFABRIC_PRODUCT_NAME} mesh dial the relay address.`,
  public:
    'Clients reach the shared ProxySQL listener on a public or hostname address. Every other database on this server becomes reachable the same way, because they share one listener.',
}

export function managedAccessScopeLabel(scope: ManagedSqlAccessScope): string {
  return SCOPE_LABELS[scope]
}

export function managedAccessScopeHint(scope: ManagedSqlAccessScope): string {
  return SCOPE_HINTS[scope]
}

/** Read scope from API settings, defaulting when omitted or invalid. */
export function readManagedExposureScope(
  exposure: Readonly<{
    enabled: boolean
    scope?: ManagedSqlAccessScope
  }>,
): ManagedSqlAccessScope {
  if (exposure.scope && isManagedSqlAccessScope(exposure.scope)) {
    return exposure.scope
  }
  return DEFAULT_MANAGED_SQL_ACCESS_SCOPE
}
