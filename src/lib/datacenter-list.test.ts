import { describe, expect, it } from 'vitest'
import type {
  DatacenterRecord,
  DatacenterSubnetRecord,
  ServerReportedIp,
} from './instance-api'
import {
  buildCreateDatacenterFromSeed,
  buildCreateDatacenterRequest,
  buildMemberPins,
  candidateMemberNetworks,
  countServersByDatacenterId,
  datacenterDisplayName,
  datacenterGeoFromMetadata,
  datacenterTimezoneLabel,
  formatDatacenterCidrs,
  formatDatacenterServerCount,
  formatDatacenterSubnetSummary,
  formatServerDatacenterNames,
  listServersWithCandidateAddresses,
  listServersWithReportedPrivateAddresses,
  listServersWithReportedPrivateNetworks,
  listServersWithoutMembership,
  memberAssignEmptyCopy,
  mergeDatacenterOptions,
  pruneSelectedIds,
  reportedCidrForAddress,
  reportedPrivateAddresses,
  reportedPrivateNetworks,
  resolveDatacenterAddEligibility,
  serverIsDatacenterMember,
  sortDatacenterSubnets,
  sortDatacentersByName,
  subnetForAddress,
  toggleSelectedId,
} from './datacenter-list'
import { addressInCidr, isValidCidr } from './cidr'

function datacenter(
  overrides: Partial<DatacenterRecord> & Pick<DatacenterRecord, 'id'>,
): DatacenterRecord {
  return {
    name: null,
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
    version: address.includes(':') ? 6 : 4,
    scope: 'private',
  }
  if (cidr) row.cidr = cidr
  return row
}

function subnet(
  overrides: Partial<DatacenterSubnetRecord> &
    Pick<DatacenterSubnetRecord, 'id' | 'cidr' | 'version'>,
): DatacenterSubnetRecord {
  return {
    name: null,
    description: null,
    memberCount: 0,
    ...overrides,
  }
}

describe('datacenterDisplayName', () => {
  it('uses a trimmed display name and falls back when blank', () => {
    expect(datacenterDisplayName({ name: '  AMS-1  ' })).toBe('AMS-1')
    expect(datacenterDisplayName({ name: '  ' })).toBe(
      'Unnamed datacenter',
    )
    expect(datacenterDisplayName({ name: null })).toBe(
      'Unnamed datacenter',
    )
  })
})

describe('formatServerDatacenterNames', () => {
  it('joins names and abbreviates when many', () => {
    expect(formatServerDatacenterNames([])).toBeNull()
    expect(
      formatServerDatacenterNames([{ id: 'dc-1', name: 'AMS' }]),
    ).toBe('AMS')
    expect(
      formatServerDatacenterNames([
        { id: 'dc-1', name: 'AMS' },
        { id: 'dc-2', name: 'FRA' },
      ]),
    ).toBe('AMS +1')
  })
})

describe('serverIsDatacenterMember', () => {
  it('matches by membership id', () => {
    expect(
      serverIsDatacenterMember(
        { datacenters: [{ id: 'dc-1', name: 'A' }] },
        'dc-1',
      ),
    ).toBe(true)
    expect(
      serverIsDatacenterMember(
        { datacenters: [{ id: 'dc-1', name: 'A' }] },
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
          { id: 'dc-a', name: 'A' },
          { id: 'dc-b', name: 'B' },
        ],
      },
      { datacenters: [{ id: 'dc-a', name: 'A' }] },
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
      { datacenters: [{ id: 'dc-a', name: 'A' }] },
    ])
    expect(counts.unassigned).toBe(2)
    expect(counts.uniqueMembers).toBe(1)
    expect(counts.byDatacenter.get('dc-a')).toBe(1)
  })
})

describe('sortDatacentersByName', () => {
  it('sorts by name without mutating the input', () => {
    const rows = [
      datacenter({ id: '2', name: 'Zurich' }),
      datacenter({ id: '1', name: 'Amsterdam' }),
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

describe('reportedPrivateAddresses', () => {
  it('collects private IPs', () => {
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

describe('sortDatacenterSubnets', () => {
  it('orders IPv4 before IPv6, then CIDR', () => {
    const rows = [
      subnet({ id: 'v6', cidr: '2001:db8:1::/64', version: 6 }),
      subnet({ id: 'v4-b', cidr: '203.0.113.0/24', version: 4 }),
      subnet({ id: 'v4-a', cidr: '10.0.0.0/24', version: 4 }),
    ]
    expect(sortDatacenterSubnets(rows).map((row) => row.id)).toEqual([
      'v4-a',
      'v4-b',
      'v6',
    ])
  })
})

describe('formatDatacenterSubnetSummary', () => {
  it('renders an em dash, a single CIDR, or a +N remainder', () => {
    expect(formatDatacenterSubnetSummary([])).toBe('—')
    expect(formatDatacenterSubnetSummary(['10.0.0.0/24'])).toBe('10.0.0.0/24')
    expect(
      formatDatacenterSubnetSummary(['10.0.0.0/24', '10.0.1.0/24', '2001:db8::/64']),
    ).toBe('10.0.0.0/24 +2')
    expect(
      formatDatacenterSubnetSummary([
        subnet({ id: 'a', cidr: '203.0.113.0/24', version: 4 }),
      ]),
    ).toBe('203.0.113.0/24')
  })
})

describe('subnetForAddress', () => {
  it('returns the first subnet that contains the address', () => {
    const subnets = [
      subnet({ id: 'v4', cidr: '10.0.0.0/24', version: 4 }),
      subnet({ id: 'v6', cidr: '2001:db8::/64', version: 6 }),
    ]
    expect(subnetForAddress(subnets, '10.0.0.5')?.id).toBe('v4')
    expect(subnetForAddress(subnets, '2001:db8::5')?.id).toBe('v6')
    expect(subnetForAddress(subnets, '203.0.113.10')).toBeNull()
  })
})

describe('candidateMemberNetworks and listServersWithCandidateAddresses', () => {
  const siteSubnets = [
    subnet({ id: 'v4', cidr: '10.0.0.0/24', version: 4 }),
    subnet({ id: 'v6', cidr: '2001:db8::/64', version: 6 }),
  ]

  it('excludes already-pinned addresses and offers both families in site CIDRs', () => {
    const server = {
      id: 'a',
      ips: ips([
        privateIp('10.0.0.5', '10.0.0.0/24'),
        privateIp('2001:db8::5', '2001:db8::/64'),
      ]),
    }
    expect(candidateMemberNetworks(server, ['10.0.0.5'], siteSubnets)).toEqual([
      {
        address: '2001:db8::5',
        cidr: '2001:db8::/64',
        cidrSource: 'reported',
      },
    ])
    expect(
      candidateMemberNetworks(server, [], siteSubnets).map((row) => row.address),
    ).toEqual(['10.0.0.5', '2001:db8::5'])
    expect(
      listServersWithCandidateAddresses(
        [
          server,
          { id: 'b', ips: ips([privateIp('10.0.1.9', '10.0.1.0/24')]) },
          { id: 'c', ips: ips([privateIp('10.0.0.5', '10.0.0.0/24')]) },
        ],
        ['10.0.0.5'],
        siteSubnets,
      ).map((row) => row.id),
    ).toEqual(['a'])
  })

  it("omits reported IPs that fall outside this datacenter's subnets", () => {
    const server = {
      id: 'a',
      ips: ips([
        privateIp('10.0.0.5', '10.0.0.0/24'),
        privateIp('10.0.1.9', '10.0.1.0/24'),
        privateIp('fd00::1', 'fd00::/64'),
      ]),
    }
    expect(
      candidateMemberNetworks(server, [], [
        subnet({ id: 'v4', cidr: '10.0.0.0/24', version: 4 }),
      ]).map((row) => row.address),
    ).toEqual(['10.0.0.5'])
    expect(
      candidateMemberNetworks(server, [], []).map((row) => row.address),
    ).toEqual([])
  })
})

describe('memberAssignEmptyCopy', () => {
  it('tells operators to add a subnet before pinning when none exist', () => {
    expect(memberAssignEmptyCopy(0)).toBe(
      "Add a subnet first. Member IPs must fall inside this datacenter's ranges.",
    )
    expect(memberAssignEmptyCopy(2)).toBe(
      "No unpinned private IPs fall inside this datacenter's subnets.",
    )
  })
})

describe('mergeDatacenterOptions', () => {
  it('preserves addressPreference across a timezone-only patch', () => {
    expect(
      mergeDatacenterOptions(
        {
          addressPreference: 'ipv4',
          defaultServerTimezone: 'UTC',
          enforceServerTimezone: false,
        },
        {
          defaultServerTimezone: 'Europe/Amsterdam',
          enforceServerTimezone: true,
        },
      ),
    ).toEqual({
      addressPreference: 'ipv4',
      defaultServerTimezone: 'Europe/Amsterdam',
      enforceServerTimezone: true,
    })
  })

  it('preserves sshPort and ntp across an address-preference patch', () => {
    expect(
      mergeDatacenterOptions(
        {
          sshPort: 22022,
          ntp: { enabled: true, servers: ['time.cloudflare.com'] },
          addressPreference: 'ipv6',
        },
        { addressPreference: 'ipv4' },
      ),
    ).toEqual({
      sshPort: 22022,
      ntp: { enabled: true, servers: ['time.cloudflare.com'] },
      addressPreference: 'ipv4',
    })
  })
})

describe('listServersWithoutMembership', () => {
  it('keeps servers with an empty datacenters list', () => {
    expect(
      listServersWithoutMembership([
        { id: 'a', datacenters: [{ id: 'dc-1', name: 'A' }] },
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
        name: '  ',
        description: '',
        members: [],
      }),
    ).toBeNull()
    expect(
      buildCreateDatacenterRequest({
        name: '  AMS-1 ',
        description: '  core ',
        members: [
          { serverId: 'b', address: '10.0.0.2' },
          { serverId: 'a', address: '10.0.0.1' },
          { serverId: 'a', address: '10.0.0.9' },
        ],
      }),
    ).toEqual({
      name: 'AMS-1',
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
        name: 'AMS-1',
        description: '',
        serverId: 'srv-1',
        address: '10.0.0.5',
      }),
    ).toEqual({
      name: 'AMS-1',
      members: [{ serverId: 'srv-1', address: '10.0.0.5' }],
      sourceServerId: 'srv-1',
    })
  })

  it('returns null when the seed address is blank', () => {
    expect(
      buildCreateDatacenterFromSeed({
        name: '',
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
