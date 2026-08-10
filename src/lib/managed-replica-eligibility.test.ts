import { describe, expect, it } from 'vitest'
import {
  hasPrivatePathToPrimary,
  resolveReplicaEligibility,
  type ReplicaEligibilityInput,
} from './managed-replica-eligibility'

const BASE_SERVERS = [
  {
    id: 'srv-primary',
    connected: true,
    datacenterId: 'dc-1',
    displayName: 'Primary host',
  },
  {
    id: 'srv-ok',
    connected: true,
    datacenterId: 'dc-1',
    displayName: 'Ready host',
  },
  {
    id: 'srv-offline',
    connected: false,
    datacenterId: 'dc-1',
    displayName: 'Offline host',
  },
  {
    id: 'srv-no-dc',
    connected: true,
    datacenterId: null,
    displayName: 'No site',
  },
  {
    id: 'srv-no-cidr',
    connected: true,
    datacenterId: 'dc-empty',
    displayName: 'Empty site',
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
    vpnPeers: [],
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
          datacenterId: null,
          displayName: 'Primary',
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

  it('flags servers with no datacenter', () => {
    const row = eligibility().servers.find((s) => s.serverId === 'srv-no-dc')
    expect(row).toEqual({
      serverId: 'srv-no-dc',
      eligible: false,
      reason: 'no-datacenter',
    })
  })

  it('flags servers whose site has no private CIDR', () => {
    const row = eligibility().servers.find((s) => s.serverId === 'srv-no-cidr')
    expect(row).toEqual({
      serverId: 'srv-no-cidr',
      eligible: false,
      reason: 'no-private-cidr',
    })
  })

  it('marks same-site servers eligible', () => {
    const row = eligibility().servers.find((s) => s.serverId === 'srv-ok')
    expect(row).toEqual({ serverId: 'srv-ok', eligible: true })
  })

  it('marks linked-site servers eligible when they share a VPN with primary', () => {
    const result = eligibility({
      servers: [
        {
          id: 'srv-primary',
          connected: true,
          datacenterId: 'dc-1',
        },
        {
          id: 'srv-remote',
          connected: true,
          datacenterId: 'dc-2',
          displayName: 'Linked remote',
        },
      ],
      vpnPeers: [
        { vpnId: 'vpn-1', serverId: 'srv-primary' },
        { vpnId: 'vpn-1', serverId: 'srv-remote' },
      ],
    })
    const remote = result.servers.find((s) => s.serverId === 'srv-remote')
    expect(remote).toEqual({ serverId: 'srv-remote', eligible: true })
  })

  it('flags unlinked-site servers with no-private-path', () => {
    const result = eligibility({
      servers: [
        {
          id: 'srv-primary',
          connected: true,
          datacenterId: 'dc-1',
        },
        {
          id: 'srv-unlinked',
          connected: true,
          datacenterId: 'dc-3',
          displayName: 'Unlinked remote',
        },
      ],
      vpnPeers: [
        { vpnId: 'vpn-1', serverId: 'srv-primary' },
        // Peer on another host in dc-2 only — no shared path for srv-unlinked
        { vpnId: 'vpn-1', serverId: 'srv-other' },
      ],
    })
    const unlinked = result.servers.find((s) => s.serverId === 'srv-unlinked')
    expect(unlinked).toEqual({
      serverId: 'srv-unlinked',
      eligible: false,
      reason: 'no-private-path',
    })
  })

  it('sets atReplicaLimit when two replicas exist', () => {
    const under = eligibility({
      members: [
        { serverId: 'srv-primary', role: 'primary' },
        { serverId: 'srv-ok', role: 'replica' },
      ],
    })
    expect(under.atReplicaLimit).toBe(false)

    const at = eligibility({
      members: [
        { serverId: 'srv-primary', role: 'primary' },
        { serverId: 'srv-ok', role: 'replica' },
        { serverId: 'srv-other', role: 'replica' },
      ],
    })
    expect(at.atReplicaLimit).toBe(true)
  })
})

describe('hasPrivatePathToPrimary', () => {
  it('allows same-site candidates without VPN peers', () => {
    expect(
      hasPrivatePathToPrimary({
        candidateServerId: 'srv-a',
        candidateDatacenterId: 'dc-1',
        primaryServerId: 'srv-p',
        primaryDatacenterId: 'dc-1',
        vpnPeers: [],
      }),
    ).toBe(true)
  })

  it('allows cross-site candidates that share a VPN', () => {
    expect(
      hasPrivatePathToPrimary({
        candidateServerId: 'srv-a',
        candidateDatacenterId: 'dc-2',
        primaryServerId: 'srv-p',
        primaryDatacenterId: 'dc-1',
        vpnPeers: [
          { vpnId: 'v1', serverId: 'srv-p' },
          { vpnId: 'v1', serverId: 'srv-a' },
        ],
      }),
    ).toBe(true)
  })

  it('rejects cross-site candidates with no shared VPN', () => {
    expect(
      hasPrivatePathToPrimary({
        candidateServerId: 'srv-a',
        candidateDatacenterId: 'dc-2',
        primaryServerId: 'srv-p',
        primaryDatacenterId: 'dc-1',
        vpnPeers: [{ vpnId: 'v1', serverId: 'srv-p' }],
      }),
    ).toBe(false)
  })
})
