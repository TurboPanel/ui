import { describe, expect, it } from 'vitest'
import type { IpRecord, ServerReportedIp } from '@/lib/instance-api'
import {
  formatStaleSince,
  groupReportedAddresses,
  indexPinsByAddress,
} from './server-interfaces'

const NAMED: ServerReportedIp[] = [
  { address: '10.0.0.5', version: 4, scope: 'private', interface: 'eth1', cidr: '10.0.0.5/24' },
  { address: '203.0.113.9', version: 4, scope: 'public', interface: 'eth0', preferred: true },
  { address: '2001:db8::9', version: 6, scope: 'public', interface: 'eth0' },
  { address: '192.168.7.2', version: 4, scope: 'private' },
]

describe('groupReportedAddresses', () => {
  it('groups by interface, default-route interface first, unnamed last', () => {
    const groups = groupReportedAddresses(NAMED)
    expect(groups.map((g) => g.label)).toEqual(['eth0', 'eth1', 'Unnamed interface'])
    expect(groups[0]).toMatchObject({ defaultRoute: true })
    expect(groups[0]?.addresses.map((a) => a.address)).toEqual(['203.0.113.9', '2001:db8::9'])
    expect(groups[1]).toMatchObject({ defaultRoute: false })
    expect(groups[2]?.addresses.map((a) => a.address)).toEqual(['192.168.7.2'])
  })

  it('falls back to public/private × family buckets when no interface is named', () => {
    const groups = groupReportedAddresses([
      { address: '192.168.7.2', version: 4, scope: 'private' },
      { address: '203.0.113.9', version: 4, scope: 'public' },
      { address: 'fd00::2', version: 6, scope: 'private' },
    ])
    expect(groups.map((g) => g.label)).toEqual(['Public IPv4', 'Private IPv4', 'Private IPv6'])
    expect(groups.every((g) => g.defaultRoute === false)).toBe(true)
  })

  it('returns nothing for an empty report', () => {
    expect(groupReportedAddresses([])).toEqual([])
  })
})

function pin(overrides: Partial<IpRecord> & Pick<IpRecord, 'id' | 'address'>): IpRecord {
  return {
    organizationId: 'org-1',
    datacenterId: 'dc-1',
    serverId: 'srv-1',
    networkId: 'net-1',
    scope: 'datacenter',
    allocation: 'dedicated',
    version: 4,
    description: null,
    metadata: null,
    options: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  } as IpRecord
}

describe('indexPinsByAddress', () => {
  it('keys pins by trimmed address and keeps duplicates together', () => {
    const map = indexPinsByAddress([
      pin({ id: 'a', address: '10.0.0.5 ' }),
      pin({ id: 'b', address: '10.0.0.5', datacenterId: 'dc-2' }),
      pin({ id: 'c', address: '10.0.0.6' }),
    ])
    expect(map.get('10.0.0.5')?.map((p) => p.id)).toEqual(['a', 'b'])
    expect(map.get('10.0.0.6')?.map((p) => p.id)).toEqual(['c'])
    expect(map.get('10.0.0.7')).toBeUndefined()
  })
})

describe('formatStaleSince', () => {
  it('formats a parsable timestamp and returns null otherwise', () => {
    expect(formatStaleSince('2026-03-04T05:06:07.000Z')).toBe(
      new Date('2026-03-04T05:06:07.000Z').toLocaleString(),
    )
    expect(formatStaleSince('not a date')).toBeNull()
    expect(formatStaleSince(null)).toBeNull()
    expect(formatStaleSince(undefined)).toBeNull()
  })
})
