import { describe, expect, it } from 'vitest'
import {
  hasPrivatePathToPrimary,
  predictReplicaTransport,
  replicaIneligibleReasonLabel,
  resolveReplicaEligibility,
  type ReplicaEligibilityInput,
} from './managed-replica-eligibility'

const BASE_SERVERS = [
  {
    id: 'srv-primary',
    connected: true,
    datacenters: [{ id: 'dc-1', name: 'One' }],
    name: 'Primary host',
  },
  {
    id: 'srv-ok',
    connected: true,
    datacenters: [{ id: 'dc-1', name: 'One' }],
    name: 'Ready host',
  },
  {
    id: 'srv-offline',
    connected: false,
    datacenters: [{ id: 'dc-1', name: 'One' }],
    name: 'Offline host',
  },
  {
    id: 'srv-no-dc',
    connected: true,
    datacenters: [],
    name: 'No site',
  },
  {
    id: 'srv-no-cidr',
    connected: true,
    datacenters: [{ id: 'dc-empty', name: 'Empty' }],
    name: 'Empty site',
  },
] as const

const DATACENTERS = [
  { id: 'dc-1', privateCidrs: ['10.0.0.0/24'] },
  { id: 'dc-empty', privateCidrs: [] as string[] },
  { id: 'dc-2', privateCidrs: ['10.0.1.0/24'] },
  { id: 'dc-3', privateCidrs: ['10.0.2.0/24'] },
]

function eligibility(
  partial: Partial<ReplicaEligibilityInput> = {},
) {
  return resolveReplicaEligibility({
    servers: [...BASE_SERVERS],
    datacenters: DATACENTERS,
    members: [
      { serverId: 'srv-primary', role: 'primary' },
    ],
    primaryServerId: 'srv-primary',
    fabricRelays: [],
    replicaClass: 'failover',
    ...partial,
  })
}

describe('resolveReplicaEligibility', () => {
  it('marks already-member above other reasons', () => {
    const result = eligibility({
      servers: [
        {
          id: 'srv-primary',
          connected: false,
          datacenters: [],
          name: 'Primary',
        },
      ],
    })
    expect(result.servers[0]).toEqual({
      serverId: 'srv-primary',
      eligible: false,
      reason: 'already-member',
    })
  })

  it('flags offline servers', () => {
    const offline = eligibility().servers.find((s) => s.serverId === 'srv-offline')
    expect(offline).toEqual({
      serverId: 'srv-offline',
      eligible: false,
      reason: 'offline',
    })
  })

  it('flags failover servers with no datacenter', () => {
    const row = eligibility().servers.find((s) => s.serverId === 'srv-no-dc')
    expect(row).toEqual({
      serverId: 'srv-no-dc',
      eligible: false,
      reason: 'no-datacenter',
    })
  })

  it('flags failover servers whose shared site has no private CIDR', () => {
    const result = eligibility({
      datacenters: [
        { id: 'dc-1', privateCidrs: [] as string[] },
        { id: 'dc-empty', privateCidrs: [] as string[] },
      ],
    })
    const row = result.servers.find((s) => s.serverId === 'srv-ok')
    expect(row).toEqual({
      serverId: 'srv-ok',
      eligible: false,
      reason: 'no-private-cidr',
      candidateDatacenterId: 'dc-1',
    })
  })

  it('marks same-site failover servers eligible on Datacenter LAN', () => {
    const row = eligibility().servers.find((s) => s.serverId === 'srv-ok')
    expect(row).toEqual({
      serverId: 'srv-ok',
      eligible: true,
      candidateDatacenterId: 'dc-1',
      predictedTransport: 'datacenter',
    })
  })

  it('predicts local transport when the candidate is the primary host', () => {
    const result = eligibility({
      servers: [
        {
          id: 'srv-primary',
          connected: true,
          datacenters: [{ id: 'dc-1', name: 'One' }],
        },
      ],
      members: [],
      primaryServerId: 'srv-primary',
    })
    expect(result.servers[0]).toEqual({
      serverId: 'srv-primary',
      eligible: true,
      candidateDatacenterId: 'dc-1',
      predictedTransport: 'local',
    })
  })

  it('treats a datacenter with two private CIDRs as eligible', () => {
    const result = eligibility({
      datacenters: [
        { id: 'dc-1', privateCidrs: ['10.0.0.0/24', '2001:db8::/64'] },
        { id: 'dc-empty', privateCidrs: [] },
      ],
    })
    const row = result.servers.find((s) => s.serverId === 'srv-ok')
    expect(row).toEqual({
      serverId: 'srv-ok',
      eligible: true,
      candidateDatacenterId: 'dc-1',
      predictedTransport: 'datacenter',
    })
  })

  it('rejects failover candidates that only share TurboFabric', () => {
    const result = eligibility({
      servers: [
        {
          id: 'srv-primary',
          connected: true,
          datacenters: [{ id: 'dc-1', name: 'One' }],
        },
        {
          id: 'srv-remote',
          connected: true,
          datacenters: [{ id: 'dc-2', name: 'Two' }],
          name: 'Linked remote',
        },
      ],
      fabricRelays: [
        { serverId: 'srv-primary' },
        { serverId: 'srv-remote' },
      ],
    })
    const remote = result.servers.find((s) => s.serverId === 'srv-remote')
    expect(remote).toEqual({
      serverId: 'srv-remote',
      eligible: false,
      reason: 'no-private-path',
      candidateDatacenterId: 'dc-2',
    })
  })

  it('flags unlinked-site failover servers with no-private-path', () => {
    const result = eligibility({
      servers: [
        {
          id: 'srv-primary',
          connected: true,
          datacenters: [{ id: 'dc-1', name: 'One' }],
        },
        {
          id: 'srv-unlinked',
          connected: true,
          datacenters: [{ id: 'dc-3', name: 'Three' }],
          name: 'Unlinked remote',
        },
      ],
      fabricRelays: [
        { serverId: 'srv-primary' },
        { serverId: 'srv-other' },
      ],
    })
    const unlinked = result.servers.find((s) => s.serverId === 'srv-unlinked')
    expect(unlinked).toEqual({
      serverId: 'srv-unlinked',
      eligible: false,
      reason: 'no-private-path',
      candidateDatacenterId: 'dc-3',
    })
  })

  it('does not cap replica count', () => {
    const result = eligibility({
      members: [
        { serverId: 'srv-primary', role: 'primary' },
        { serverId: 'srv-ok', role: 'replica' },
        { serverId: 'srv-other', role: 'replica' },
        { serverId: 'srv-third', role: 'replica' },
      ],
    })
    expect(result.servers.find((s) => s.serverId === 'srv-no-dc')?.reason).toBe(
      'no-datacenter',
    )
  })

  it('accepts read-only replicas on fabric, public, or missing datacenter', () => {
    const result = eligibility({
      replicaClass: 'read',
      servers: [
        {
          id: 'srv-primary',
          connected: true,
          datacenters: [{ id: 'dc-1', name: 'One' }],
        },
        {
          id: 'srv-fabric',
          connected: true,
          datacenters: [{ id: 'dc-2', name: 'Two' }],
        },
        {
          id: 'srv-public',
          connected: true,
          datacenters: [{ id: 'dc-3', name: 'Three' }],
        },
        {
          id: 'srv-bare',
          connected: true,
          datacenters: [],
        },
      ],
      fabricRelays: [
        { serverId: 'srv-primary' },
        { serverId: 'srv-fabric' },
      ],
    })
    expect(result.servers.find((s) => s.serverId === 'srv-fabric')).toEqual({
      serverId: 'srv-fabric',
      eligible: true,
      candidateDatacenterId: 'dc-2',
      predictedTransport: 'fabric',
    })
    expect(result.servers.find((s) => s.serverId === 'srv-public')).toEqual({
      serverId: 'srv-public',
      eligible: true,
      candidateDatacenterId: 'dc-3',
      predictedTransport: 'public',
    })
    expect(result.servers.find((s) => s.serverId === 'srv-bare')).toEqual({
      serverId: 'srv-bare',
      eligible: true,
      candidateDatacenterId: null,
      predictedTransport: 'public',
    })
  })

  it('still blocks offline and already-member for read-only', () => {
    const result = eligibility({ replicaClass: 'read' })
    expect(result.servers.find((s) => s.serverId === 'srv-primary')?.reason).toBe(
      'already-member',
    )
    expect(result.servers.find((s) => s.serverId === 'srv-offline')?.reason).toBe(
      'offline',
    )
  })

  it('handles a primary server id that is missing from the fleet list', () => {
    const result = eligibility({
      primaryServerId: 'srv-missing',
      members: [],
    })
    expect(result.servers.find((s) => s.serverId === 'srv-no-dc')?.reason).toBe(
      'no-datacenter',
    )
  })

  it('treats a null primary as having no datacenter pins', () => {
    const result = eligibility({
      primaryServerId: null,
      members: [],
    })
    expect(result.servers.find((s) => s.serverId === 'srv-no-dc')?.reason).toBe(
      'no-datacenter',
    )
  })
})

describe('replicaIneligibleReasonLabel', () => {
  it('labels every ineligible reason', () => {
    expect(replicaIneligibleReasonLabel('already-member')).toBe('Already a member')
    expect(replicaIneligibleReasonLabel('offline')).toBe('Offline')
    expect(replicaIneligibleReasonLabel('no-datacenter')).toBe(
      'Not assigned to a datacenter',
    )
    expect(replicaIneligibleReasonLabel('no-private-cidr')).toBe(
      'Datacenter has no subnets yet',
    )
    expect(replicaIneligibleReasonLabel('no-private-path')).toBe(
      "Must share the primary's datacenter",
    )
  })
})

describe('predictReplicaTransport', () => {
  it('prefers local, then datacenter, then fabric, then public', () => {
    expect(
      predictReplicaTransport({
        candidateServerId: 'srv-p',
        candidateDatacenterIds: ['dc-1'],
        primaryServerId: 'srv-p',
        primaryDatacenterIds: ['dc-1'],
        fabricRelays: [],
      }),
    ).toBe('local')
    expect(
      predictReplicaTransport({
        candidateServerId: 'srv-a',
        candidateDatacenterIds: ['dc-1'],
        primaryServerId: 'srv-p',
        primaryDatacenterIds: ['dc-1'],
        fabricRelays: [],
      }),
    ).toBe('datacenter')
    expect(
      predictReplicaTransport({
        candidateServerId: 'srv-a',
        candidateDatacenterIds: ['dc-2'],
        primaryServerId: 'srv-p',
        primaryDatacenterIds: ['dc-1'],
        fabricRelays: [
          { serverId: 'srv-p' },
          { serverId: 'srv-a' },
        ],
      }),
    ).toBe('fabric')
    expect(
      predictReplicaTransport({
        candidateServerId: 'srv-a',
        candidateDatacenterIds: [],
        primaryServerId: 'srv-p',
        primaryDatacenterIds: ['dc-1'],
        fabricRelays: [],
      }),
    ).toBe('public')
  })
})

describe('hasPrivatePathToPrimary', () => {
  it('treats the primary host as reachable from itself', () => {
    expect(
      hasPrivatePathToPrimary({
        candidateServerId: 'srv-p',
        candidateDatacenterIds: [],
        primaryServerId: 'srv-p',
        primaryDatacenterIds: ['dc-1'],
        fabricRelays: [],
      }),
    ).toBe(true)
  })

  it('allows same-site candidates without fabric relays', () => {
    expect(
      hasPrivatePathToPrimary({
        candidateServerId: 'srv-a',
        candidateDatacenterIds: ['dc-1'],
        primaryServerId: 'srv-p',
        primaryDatacenterIds: ['dc-1'],
        fabricRelays: [],
      }),
    ).toBe(true)
  })

  it('allows cross-site candidates that share TurboFabric', () => {
    expect(
      hasPrivatePathToPrimary({
        candidateServerId: 'srv-a',
        candidateDatacenterIds: ['dc-2'],
        primaryServerId: 'srv-p',
        primaryDatacenterIds: ['dc-1'],
        fabricRelays: [
          { serverId: 'srv-p' },
          { serverId: 'srv-a' },
        ],
      }),
    ).toBe(true)
  })

  it('rejects cross-site candidates with no shared fabric path', () => {
    expect(
      hasPrivatePathToPrimary({
        candidateServerId: 'srv-a',
        candidateDatacenterIds: ['dc-2'],
        primaryServerId: 'srv-p',
        primaryDatacenterIds: ['dc-1'],
        fabricRelays: [{ serverId: 'srv-p' }],
      }),
    ).toBe(false)
  })
})
