import { describe, expect, it } from 'vitest'
import type { LicenseRecord } from '@/lib/instance-api'
import {
  pendingKeyDisplayName,
  unboundPendingKeys,
  unusedRegistrationKeysLabel,
} from '@/lib/pending-keys'

function license(
  patch: Partial<LicenseRecord> & Pick<LicenseRecord, 'id'>,
): LicenseRecord {
  return {
    displayName: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    revocable: true,
    boundServer: null,
    ...patch,
  }
}

describe('unboundPendingKeys', () => {
  it('keeps only unbound rows, newest first', () => {
    const bound = license({
      id: 'bound',
      boundServer: { id: 's1', displayName: 'node', connected: true },
    })
    const older = license({
      id: 'older',
      createdAt: '2026-01-01T00:00:00.000Z',
    })
    const newer = license({
      id: 'newer',
      createdAt: '2026-02-01T00:00:00.000Z',
    })

    expect(unboundPendingKeys([bound, older, newer]).map((row) => row.id)).toEqual([
      'newer',
      'older',
    ])
  })
})

describe('pendingKeyDisplayName', () => {
  it('uses a trimmed name or Unnamed key', () => {
    expect(pendingKeyDisplayName({ displayName: '  Rack 2  ' })).toBe('Rack 2')
    expect(pendingKeyDisplayName({ displayName: '   ' })).toBe('Unnamed key')
    expect(pendingKeyDisplayName({ displayName: null })).toBe('Unnamed key')
  })
})

describe('unusedRegistrationKeysLabel', () => {
  it('pluralizes', () => {
    expect(unusedRegistrationKeysLabel(1)).toBe('1 unused registration key')
    expect(unusedRegistrationKeysLabel(2)).toBe('2 unused registration keys')
    expect(unusedRegistrationKeysLabel(0)).toBe('0 unused registration keys')
  })
})
