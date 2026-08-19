import { describe, expect, it } from 'vitest'
import {
  isManagedSqlAccessScope,
  managedAccessScopeLabel,
  readManagedExposureScope,
} from './managed-access-scope'

describe('managed-access-scope', () => {
  it('labels TurboFabric without wireguard jargon', () => {
    expect(managedAccessScopeLabel('turbofabric')).toBe('TurboFabric')
  })

  it('accepts only the four scope literals', () => {
    expect(isManagedSqlAccessScope('public')).toBe(true)
    expect(isManagedSqlAccessScope('turbofabric')).toBe(true)
    expect(isManagedSqlAccessScope('internet')).toBe(false)
  })

  it('reads scope and migrates legacy bind', () => {
    expect(
      readManagedExposureScope({ enabled: true, scope: 'datacenter' }),
    ).toBe('datacenter')
    expect(
      readManagedExposureScope({ enabled: true, bind: 'local' }),
    ).toBe('local')
    expect(readManagedExposureScope({ enabled: true })).toBe('public')
  })
})
