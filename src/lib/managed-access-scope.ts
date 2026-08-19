/**
 * Client mirror of the control-plane managed SQL access scopes
 * (`turbopanel/src/lib/managed/access-scope.ts`).
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

export const DEFAULT_MANAGED_SQL_ACCESS_SCOPE: ManagedSqlAccessScope = 'public'

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
  local: 'Loopback and co-located Docker networks only — no host publish.',
  datacenter:
    'Clients on the same datacenter private network dial the server pin address.',
  turbofabric: `Clients on the org ${TURBOFABRIC_PRODUCT_NAME} mesh dial the relay address.`,
  public:
    'Clients reach the shared ProxySQL listener on a public or hostname address.',
}

export function managedAccessScopeLabel(scope: ManagedSqlAccessScope): string {
  return SCOPE_LABELS[scope]
}

export function managedAccessScopeHint(scope: ManagedSqlAccessScope): string {
  return SCOPE_HINTS[scope]
}

/** Read scope from API settings, migrating a one-release legacy `bind` field. */
export function readManagedExposureScope(
  exposure: Readonly<{
    enabled: boolean
    scope?: ManagedSqlAccessScope
    bind?: ManagedSqlAccessScope
  }>,
): ManagedSqlAccessScope {
  if (exposure.scope && isManagedSqlAccessScope(exposure.scope)) {
    return exposure.scope
  }
  if (exposure.bind && isManagedSqlAccessScope(exposure.bind)) {
    return exposure.bind
  }
  return DEFAULT_MANAGED_SQL_ACCESS_SCOPE
}
