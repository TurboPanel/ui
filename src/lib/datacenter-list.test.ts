import { describe, expect, it } from 'vitest'
import type { DatacenterRecord, ServerReportedIp } from './instance-api'
import {
  addressesInCidr,
  buildCreateDatacenterFromSeed,
  buildCreateDatacenterRequest,
  buildMemberPins,
  countServersByDatacenterId,
  datacenterDisplayName,
  datacenterGeoFromMetadata,
  datacenterTimezoneLabel,
  formatDatacenterCidrs,
  formatDatacenterServerCount,
  formatServerDatacenterNames,
  listServersWithAddressInCidrs,
  listServersWithReportedPrivateAddresses,
  listServersWithReportedPrivateNetworks,
  listServersWithoutMembership,
  pruneSelectedIds,
  reportedCidrForAddress,
  reportedPrivateAddresses,
  reportedPrivateNetworks,
  resolveDatacenterAddEligibility,
  serverIsDatacenterMember,
  sortDatacentersByName,
  toggleSelectedId,
} from './datacenter-list'
import { addressInCidr, isValidCidr } from './cidr'

function datacenter(
  overrides: Partial<DatacenterRecord> & Pick<DatacenterRecord, 'id'>,
): DatacenterRecord {
  return {
    displayName: null,
    description: null,
    organizationId: 'org-1',
    privateCidrs: [],
    metadata: null,
    options: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

function ips(rows: ServerReportedIp[]): ServerReportedIp[] {
  return rows
}

function privateIp(
  address: string,
  cidr?: string,
): ServerReportedIp {
  const row: ServerReportedIp = {
    address,
    version: 4,
    scope: 'private',
  }
  if (cidr) row.cidr = cidr
  return row
}

describe('datacenterDisplayName', () => {
  it('uses a trimmed display name and falls back when blank', () => {
    expect(datacenterDisplayName({ displayName: '  AMS-1  ' })).toBe('AMS-1')
    expect(datacenterDisplayName({ displayName: '  ' })).toBe(
      'Unnamed datacenter',
    )
    expect(datacenterDisplayName({ displayName: null })).toBe(
      'Unnamed datacenter',
    )
  })
})

describe('formatServerDatacenterNames', () => {
  it('joins names and abbreviates when many', () => {
    expect(formatServerDatacenterNames([])).toBeNull()
    expect(
      formatServerDatacenterNames([{ id: 'dc-1', displayName: 'AMS' }]),
    ).toBe('AMS')
    expect(
      formatServerDatacenterNames([
        { id: 'dc-1', displayName: 'AMS' },
        { id: 'dc-2', displayName: 'FRA' },
      ]),
    ).toBe('AMS +1')
  })
})

describe('serverIsDatacenterMember', () => {
  it('matches by membership id', () => {
    expect(
      serverIsDatacenterMember(
        { datacenters: [{ id: 'dc-1', displayName: 'A' }] },
        'dc-1',
      ),
    ).toBe(true)
    expect(
      serverIsDatacenterMember(
        { datacenters: [{ id: 'dc-1', displayName: 'A' }] },
        'dc-2',
      ),
    ).toBe(false)
  })
})

describe('datacenterTimezoneLabel', () => {
  it('returns the default timezone or an em dash', () => {
    expect(
      datacenterTimezoneLabel({ defaultServerTimezone: 'Europe/Amsterdam' }),
    ).toBe('Europe/Amsterdam')
    expect(datacenterTimezoneLabel({ defaultServerTimezone: '  ' })).toBe('—')
    expect(datacenterTimezoneLabel(null)).toBe('—')
  })
})

describe('formatDatacenterCidrs', () => {
  it('joins trimmed CIDRs and falls back when none remain', () => {
    expect(formatDatacenterCidrs([' 10.0.0.0/24 ', '10.0.1.0/24'])).toBe(
      '10.0.0.0/24, 10.0.1.0/24',
    )
    expect(formatDatacenterCidrs(['  ', ''])).toBe('—')
    expect(formatDatacenterCidrs([])).toBe('—')
  })
})

describe('formatDatacenterServerCount', () => {
  it('uses singular and plural labels', () => {
    expect(formatDatacenterServerCount(0)).toBe('0 servers')
    expect(formatDatacenterServerCount(1)).toBe('1 server')
    expect(formatDatacenterServerCount(4)).toBe('4 servers')
  })
})

describe('datacenterGeoFromMetadata', () => {
  it('reads a seeded geo snapshot and ignores empty objects', () => {
    expect(
      datacenterGeoFromMetadata({
        geo: { country: 'NL', city: 'Amsterdam', region: 'North Holland' },
      }),
    ).toEqual({
      country: 'NL',
      city: 'Amsterdam',
      region: 'North Holland',
    })
    expect(datacenterGeoFromMetadata({ geo: { country: '  ' } })).toBeNull()
    expect(datacenterGeoFromMetadata({ geo: 'not-an-object' })).toBeNull()
    expect(datacenterGeoFromMetadata(null)).toBeNull()
  })
})

describe('countServersByDatacenterId', () => {
  it('counts each membership and servers with zero memberships', () => {
    const counts = countServersByDatacenterId([
      {
        datacenters: [
          { id: 'dc-a', displayName: 'A' },
          { id: 'dc-b', displayName: 'B' },
        ],
      },
      { datacenters: [{ id: 'dc-a', displayName: 'A' }] },
      { datacenters: [] },
    ])
    expect(counts.byDatacenter.get('dc-a')).toBe(2)
    expect(counts.byDatacenter.get('dc-b')).toBe(1)
    expect(counts.unassigned).toBe(1)
    expect(counts.membershipPins).toBe(3)
    expect(counts.uniqueMembers).toBe(2)
  })

  it('treats missing datacenters as unassigned', () => {
    const counts = countServersByDatacenterId([
      { datacenters: undefined },
      {},
      { datacenters: [{ id: 'dc-a', displayName: 'A' }] },
    ])
    expect(counts.unassigned).toBe(2)
    expect(counts.uniqueMembers).toBe(1)
    expect(counts.byDatacenter.get('dc-a')).toBe(1)
  })
})

describe('sortDatacentersByName', () => {
  it('sorts by display name without mutating the input', () => {
    const rows = [
      datacenter({ id: '2', displayName: 'Zurich' }),
      datacenter({ id: '1', displayName: 'Amsterdam' }),
    ]
    const sorted = sortDatacentersByName(rows)
    expect(sorted.map((row) => row.id)).toEqual(['1', '2'])
    expect(rows.map((row) => row.id)).toEqual(['2', '1'])
  })
})

describe('resolveDatacenterAddEligibility', () => {
  it('allows create when any server has a reported private address', () => {
    expect(
      resolveDatacenterAddEligibility({
        serversWithPrivateAddress: 2,
        serverCount: 2,
      }),
    ).toEqual({ canAdd: true, reason: null })
    expect(
      resolveDatacenterAddEligibility({
        serversWithPrivateAddress: 0,
        serverCount: 0,
      }),
    ).toEqual({
      canAdd: false,
      reason: 'Add a server first.',
    })
    expect(
      resolveDatacenterAddEligibility({
        serversWithPrivateAddress: 0,
        serverCount: 3,
      }),
    ).toEqual({
      canAdd: false,
      reason: 'No private IPs reported yet.',
    })
  })
})

describe('reportedPrivateNetworks and reportedCidrForAddress', () => {
  it('keeps reported interface CIDRs and looks up by address', () => {
    const server = {
      ips: ips([
        privateIp('10.0.0.5', '10.0.0.0/24'),
        privateIp('10.0.0.5', '10.0.0.0/16'),
      ]),
    }
    expect(reportedPrivateNetworks(server)).toEqual([
      { address: '10.0.0.5', cidr: '10.0.0.0/24', cidrSource: 'reported' },
    ])
    expect(reportedCidrForAddress(server, '10.0.0.5')).toBe('10.0.0.0/24')
    expect(reportedCidrForAddress(server, '10.0.0.9')).toBeNull()
    expect(reportedPrivateNetworks({ ips: null })).toEqual([])
  })

  it('assumes a typical LAN when the daemon omitted the prefix', () => {
    expect(reportedPrivateNetworks({ ips: ips([privateIp('10.0.0.5')]) })).toEqual(
      [{ address: '10.0.0.5', cidr: '10.0.0.0/24', cidrSource: 'assumed' }],
    )
    expect(
      reportedCidrForAddress({ ips: ips([privateIp('10.0.0.5')]) }, '10.0.0.5'),
    ).toBe('10.0.0.0/24')
  })
})

describe('listServersWithReportedPrivateNetworks', () => {
  it('keeps servers that reported a private IP, with or without a prefix', () => {
    expect(
      listServersWithReportedPrivateNetworks([
        {
          id: 'a',
          ips: ips([privateIp('10.0.0.1', '10.0.0.0/24')]),
        },
        {
          id: 'b',
          ips: ips([privateIp('10.0.0.2')]),
        },
      ]).map((row) => row.id),
    ).toEqual(['a', 'b'])
  })
})

describe('reportedPrivateAddresses and addressesInCidr', () => {
  it('collects private IPs and filters by CIDR', () => {
    expect(
      reportedPrivateAddresses({
        ips: ips([
          privateIp('10.0.0.5'),
          { address: ' 10.0.0.5 ', version: 4, scope: 'private' },
          privateIp('10.0.1.9'),
          { address: 'fd00::1', version: 6, scope: 'private' },
        ]),
      }),
    ).toEqual(['10.0.0.5', '10.0.1.9', 'fd00::1'])
    expect(reportedPrivateAddresses({ ips: null })).toEqual([])
    expect(
      addressesInCidr(['10.0.0.5', '10.0.1.9', 'not-an-ip'], '10.0.0.0/24'),
    ).toEqual(['10.0.0.5'])
  })
})

describe('listServersWithReportedPrivateAddresses', () => {
  it('keeps servers that report at least one private address', () => {
    expect(
      listServersWithReportedPrivateAddresses([
        {
          id: 'a',
          ips: ips([privateIp('10.0.0.1')]),
        },
        { id: 'b', ips: ips([]) },
        { id: 'c', ips: null },
      ]).map((row) => row.id),
    ).toEqual(['a'])
  })
})

describe('listServersWithAddressInCidrs', () => {
  it('keeps servers with a private IP inside any listed CIDR', () => {
    expect(
      listServersWithAddressInCidrs(
        [
          {
            id: 'a',
            ips: ips([privateIp('10.0.0.1')]),
          },
          {
            id: 'b',
            ips: ips([privateIp('10.0.1.9')]),
          },
          { id: 'c', ips: ips([privateIp('10.0.0.8')]) },
        ],
        ['10.0.0.0/24'],
      ).map((row) => row.id),
    ).toEqual(['a', 'c'])
  })
})

describe('listServersWithoutMembership', () => {
  it('keeps servers with an empty datacenters list', () => {
    expect(
      listServersWithoutMembership([
        { id: 'a', datacenters: [{ id: 'dc-1', displayName: 'A' }] },
        { id: 'b', datacenters: [] },
        { id: 'c' },
      ]).map((row) => row.id),
    ).toEqual(['b', 'c'])
  })
})

describe('pruneSelectedIds and toggleSelectedId', () => {
  it('drops ids that are no longer allowed and toggles membership', () => {
    const pruned = pruneSelectedIds(new Set(['a', 'b']), new Set(['b', 'c']))
    expect([...pruned]).toEqual(['b'])
    expect(
      [...toggleSelectedId(new Set(['a']), 'b')].sort((x, y) =>
        x.localeCompare(y),
      ),
    ).toEqual(['a', 'b'])
    expect([...toggleSelectedId(new Set(['a', 'b']), 'a')]).toEqual(['b'])
  })
})

describe('buildMemberPins', () => {
  it('builds unique pins and skips blanks', () => {
    expect(
      buildMemberPins(
        new Map([
          ['a', '10.0.0.1'],
          ['b', '  '],
          ['c', '10.0.0.3'],
        ]),
      ),
    ).toEqual([
      { serverId: 'a', address: '10.0.0.1' },
      { serverId: 'c', address: '10.0.0.3' },
    ])
  })
})

describe('buildCreateDatacenterRequest', () => {
  it('requires at least one member pin', () => {
    expect(
      buildCreateDatacenterRequest({
        displayName: '  ',
        description: '',
        members: [],
      }),
    ).toBeNull()
    expect(
      buildCreateDatacenterRequest({
        displayName: '  AMS-1 ',
        description: '  core ',
        members: [
          { serverId: 'b', address: '10.0.0.2' },
          { serverId: 'a', address: '10.0.0.1' },
          { serverId: 'a', address: '10.0.0.9' },
        ],
      }),
    ).toEqual({
      displayName: 'AMS-1',
      description: 'core',
      members: [
        { serverId: 'b', address: '10.0.0.2' },
        { serverId: 'a', address: '10.0.0.1' },
      ],
      sourceServerId: 'b',
    })
  })
})

describe('buildCreateDatacenterFromSeed', () => {
  it('builds a create body from the seed host and address', () => {
    expect(
      buildCreateDatacenterFromSeed({
        displayName: 'AMS-1',
        description: '',
        serverId: 'srv-1',
        address: '10.0.0.5',
      }),
    ).toEqual({
      displayName: 'AMS-1',
      members: [{ serverId: 'srv-1', address: '10.0.0.5' }],
      sourceServerId: 'srv-1',
    })
  })

  it('returns null when the seed address is blank', () => {
    expect(
      buildCreateDatacenterFromSeed({
        displayName: '',
        description: '',
        serverId: 'srv-1',
        address: '  ',
      }),
    ).toBeNull()
  })
})

describe('addressInCidr', () => {
  it('validates IPv4 membership and rejects bad CIDRs', () => {
    expect(isValidCidr('10.0.0.0/24')).toBe(true)
    expect(isValidCidr('not-a-cidr')).toBe(false)
    expect(addressInCidr('10.0.0.50', '10.0.0.0/24')).toBe(true)
    expect(addressInCidr('10.0.1.50', '10.0.0.0/24')).toBe(false)
    expect(addressInCidr('203.0.113.10', '203.0.113.0/24')).toBe(true)
  })
})
