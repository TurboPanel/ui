import { describe, expect, it } from 'vitest'
import type { LicenseRecord } from '@/lib/instance-api'
import { formatLocalDateTime } from '@/lib/format-datetime'
import {
  pendingKeyDisplayName,
  provisioningKeys,
  provisioningServersLabel,
  unboundPendingKeys,
  unusedRegistrationKeysLabel,
} from '@/lib/pending-keys'

function license(
  patch: Partial<LicenseRecord> & Pick<LicenseRecord, 'id'>,
): LicenseRecord {
  return {
    name: null,
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
      boundServer: { id: 's1', name: 'node', connected: true },
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

describe('provisioning keys', () => {
  const provisioning = license({
    id: 'prov',
    createdAt: '2026-03-01T00:00:00.000Z',
    provisioning: { since: '2026-09-26T23:50:00.000Z', hostname: 'adrastea' },
  })
  const unused = license({ id: 'unused' })
  const bound = license({
    id: 'bound',
    boundServer: { id: 's1', name: 'node', connected: true },
    provisioning: { since: '2026-09-26T23:50:00.000Z', hostname: 'node' },
  })

  it('never counts a key whose server is provisioning as unused', () => {
    expect(unboundPendingKeys([provisioning, unused, bound]).map((row) => row.id)).toEqual([
      'unused',
    ])
  })

  it('lists only unbound keys that are provisioning', () => {
    expect(provisioningKeys([provisioning, unused, bound]).map((row) => row.id)).toEqual(['prov'])
  })

  it('names one provisioning server with its host and start time', () => {
    const since = formatLocalDateTime('2026-09-26T23:50:00.000Z', { includeSeconds: false })
    expect(provisioningServersLabel([provisioning])).toBe(
      `1 server provisioning (adrastea) since ${since}`
    )
  })

  it('counts several, and says nothing when none is provisioning', () => {
    expect(provisioningServersLabel([provisioning, provisioning])).toBe('2 servers provisioning')
    expect(provisioningServersLabel([])).toBeNull()
    expect(
      provisioningServersLabel([
        license({ id: 'bare', provisioning: { since: '', hostname: '  ' } }),
      ])
    ).toBe('1 server provisioning')
    const since = formatLocalDateTime('2026-09-26T23:50:00.000Z', { includeSeconds: false })
    expect(
      provisioningServersLabel([
        license({ id: 'host', provisioning: { since: '', hostname: 'node' } }),
      ])
    ).toBe('1 server provisioning (node)')
    expect(
      provisioningServersLabel([
        license({ id: 'time', provisioning: { since: '2026-09-26T23:50:00.000Z', hostname: '' } }),
      ])
    ).toBe(`1 server provisioning since ${since}`)
  })
})

describe('pendingKeyDisplayName', () => {
  it('uses a trimmed name or Unnamed key', () => {
    expect(pendingKeyDisplayName({ name: '  Rack 2  ' })).toBe('Rack 2')
    expect(pendingKeyDisplayName({ name: '   ' })).toBe('Unnamed key')
    expect(pendingKeyDisplayName({ name: null })).toBe('Unnamed key')
  })
})

describe('unusedRegistrationKeysLabel', () => {
  it('pluralizes', () => {
    expect(unusedRegistrationKeysLabel(1)).toBe('1 unused registration key')
    expect(unusedRegistrationKeysLabel(2)).toBe('2 unused registration keys')
    expect(unusedRegistrationKeysLabel(0)).toBe('0 unused registration keys')
  })
})
