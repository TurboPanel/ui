import { describe, expect, it } from 'vitest'
import { TURBOFABRIC_PRODUCT_NAME } from './platform-copy'
import {
  DEFAULT_MANAGED_SQL_ACCESS_SCOPE,
  isManagedSqlAccessScope,
  managedAccessScopeHint,
  managedAccessScopeLabel,
  MANAGED_SQL_ACCESS_SCOPES,
  readManagedExposureScope,
} from './managed-access-scope'

describe('managed-access-scope', () => {
  it('labels TurboFabric without wireguard jargon', () => {
    expect(managedAccessScopeLabel('turbofabric')).toBe('TurboFabric')
    expect(managedAccessScopeLabel('local')).toBe('Local')
    expect(managedAccessScopeLabel('datacenter')).toBe('Datacenter')
    expect(managedAccessScopeLabel('public')).toBe('Public')
  })

  it('describes each scope for picker hints', () => {
    expect(managedAccessScopeHint('local')).toContain('Loopback')
    expect(managedAccessScopeHint('datacenter')).toContain('private network')
    expect(managedAccessScopeHint('turbofabric')).toContain(
      TURBOFABRIC_PRODUCT_NAME,
    )
    expect(managedAccessScopeHint('public')).toContain('ProxySQL')
    expect(MANAGED_SQL_ACCESS_SCOPES.map(managedAccessScopeHint)).toHaveLength(4)
  })

  it('accepts only the four scope literals', () => {
    expect(isManagedSqlAccessScope('public')).toBe(true)
    expect(isManagedSqlAccessScope('turbofabric')).toBe(true)
    expect(isManagedSqlAccessScope('internet')).toBe(false)
    expect(isManagedSqlAccessScope(42)).toBe(false)
  })

  it('reads scope and migrates legacy bind', () => {
    expect(
      readManagedExposureScope({ enabled: true, scope: 'datacenter' }),
    ).toBe('datacenter')
    expect(
      readManagedExposureScope({ enabled: true, bind: 'local' }),
    ).toBe('local')
    expect(readManagedExposureScope({ enabled: true })).toBe(
      DEFAULT_MANAGED_SQL_ACCESS_SCOPE,
    )
    expect(
      readManagedExposureScope({
        enabled: true,
        scope: 'not-a-scope' as 'public',
        bind: 'turbofabric',
      }),
    ).toBe('turbofabric')
    expect(
      readManagedExposureScope({
        enabled: false,
        scope: 'not-a-scope' as 'public',
        bind: 'not-a-scope' as 'public',
      }),
    ).toBe(DEFAULT_MANAGED_SQL_ACCESS_SCOPE)
  })
})
