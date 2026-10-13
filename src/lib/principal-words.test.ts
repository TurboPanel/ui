import { describe, expect, it } from 'vitest'
import type { OrgPrincipalRecord } from '@/lib/instance-api'
import {
  PRINCIPAL_DEFINITION,
  principalDeleteBlockedReason,
  principalFormLabels,
  principalStateLabel,
  principalUsageLines,
} from '@/lib/principal-words'

function row(patch: Partial<OrgPrincipalRecord> = {}): OrgPrincipalRecord {
  return {
    id: 'p1',
    name: 'shop',
    appliedUsername: 'shop_abc',
    kind: 'system',
    provider: 'server',
    forms: ['system'],
    projectId: null,
    projectName: null,
    servers: [],
    logins: [],
    usedBy: { tenancies: 0, bindings: 0, storages: 0, secrets: 0, logins: 0 },
    state: 'none',
    orphaned: true,
    canDelete: true,
    createdAt: '2026-10-13T00:00:00.000Z',
    ...patch,
  }
}

describe('principal words', () => {
  it('defines a principal once, in plain words with both forms', () => {
    expect(PRINCIPAL_DEFINITION).toContain('system user')
    expect(PRINCIPAL_DEFINITION).toContain('database login')
  })

  it('names the forms and states', () => {
    expect(principalFormLabels(['system', 'database'])).toBe('System user and Database login')
    expect(principalFormLabels([])).toBe('No form yet')
    expect(principalStateLabel('retiring')).toBe('Being removed')
  })

  it('turns usage counts into short lines and skips zeros', () => {
    expect(principalUsageLines({})).toEqual([])
    expect(
      principalUsageLines({ tenancies: 1, bindings: 2, otherPlacements: 3, logins: 1 })
    ).toEqual([
      '1 service runs as it',
      '2 apps are connected to it',
      '1 database login',
      '3 other servers have it',
    ])
  })

  it('explains why a principal cannot be deleted', () => {
    expect(principalDeleteBlockedReason(row())).toBeNull()
    expect(
      principalDeleteBlockedReason(row({ canDelete: false, projectId: 'x', projectName: 'Shop' }))
    ).toBe('Belongs to the project Shop. Remove it from that project.')
    expect(
      principalDeleteBlockedReason(
        row({ canDelete: false, usedBy: { tenancies: 2, bindings: 0, storages: 0, secrets: 0, logins: 0 } })
      )
    ).toBe('In use: 2 services run as it.')
    expect(principalDeleteBlockedReason(row({ canDelete: false, provider: 'postgres' }))).toBe(
      'Removed together with its database.'
    )
  })
})
