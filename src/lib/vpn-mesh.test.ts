import { describe, expect, it } from 'vitest'
import type { IpRecord, PeerRecord } from './instance-api'
import {
  formatSiteLinkLabel,
  overlayAddressForPeer,
  peerRoleLabel,
  resolvePrimaryGatewayByDatacenter,
  resolveSiteLinks,
  type MeshServerRef,
} from './vpn-mesh'

function peer(
  partial: Pick<PeerRecord, 'id' | 'serverId' | 'role' | 'createdAt'> &
    Partial<PeerRecord>,
): PeerRecord {
  return {
    vpnId: 'vpn-1',
    endpointIpId: null,
    tunnelIpId: null,
    publicKey: 'pk',
    listenPort: null,
    endpoint: null,
    metadata: null,
    options: null,
    updatedAt: partial.createdAt,
    ...partial,
  }
}

describe('resolvePrimaryGatewayByDatacenter', () => {
  it('picks the oldest online gateway per datacenter', () => {
    const peers = [
      peer({
        id: 'p-old-offline',
        serverId: 's-offline',
        role: 'gateway',
        createdAt: '2026-01-01T00:00:00.000Z',
      }),
      peer({
        id: 'p-newer-online',
        serverId: 's-online',
        role: 'gateway',
        createdAt: '2026-01-02T00:00:00.000Z',
      }),
      peer({
        id: 'p-member',
        serverId: 's-member',
        role: 'member',
        createdAt: '2026-01-01T00:00:00.000Z',
      }),
    ]
    const servers = new Map<string, MeshServerRef>([
      ['s-offline', { connected: false, datacenterId: 'dc-1' }],
      ['s-online', { connected: true, datacenterId: 'dc-1' }],
      ['s-member', { connected: true, datacenterId: 'dc-1' }],
    ])

    const primary = resolvePrimaryGatewayByDatacenter(peers, servers)
    expect(primary.get('dc-1')).toBe('p-newer-online')
  })

  it('falls back to oldest gateway when none are online', () => {
    const peers = [
      peer({
        id: 'p-b',
        serverId: 's-b',
        role: 'gateway',
        createdAt: '2026-01-02T00:00:00.000Z',
      }),
      peer({
        id: 'p-a',
        serverId: 's-a',
        role: 'gateway',
        createdAt: '2026-01-01T00:00:00.000Z',
      }),
    ]
    const servers = new Map<string, MeshServerRef>([
      ['s-a', { connected: false, datacenterId: 'dc-1' }],
      ['s-b', { connected: false, datacenterId: 'dc-1' }],
    ])

    expect(resolvePrimaryGatewayByDatacenter(peers, servers).get('dc-1')).toBe(
      'p-a',
    )
  })

  it('skips gateways without a datacenter', () => {
    const peers = [
      peer({
        id: 'p-1',
        serverId: 's-1',
        role: 'gateway',
        createdAt: '2026-01-01T00:00:00.000Z',
      }),
    ]
    const servers = new Map<string, MeshServerRef>([
      ['s-1', { connected: true, datacenterId: null }],
    ])
    expect(resolvePrimaryGatewayByDatacenter(peers, servers).size).toBe(0)
  })
})

describe('peerRoleLabel', () => {
  it('labels gateway and member roles', () => {
    expect(peerRoleLabel('gateway')).toBe('Gateway')
    expect(peerRoleLabel('member')).toBe('Member')
  })
})

describe('overlayAddressForPeer', () => {
  it('resolves tunnelIpId through the IP map', () => {
    const p = peer({
      id: 'p-1',
      serverId: 's-1',
      role: 'member',
      createdAt: '2026-01-01T00:00:00.000Z',
      tunnelIpId: 'ip-1',
    })
    const ipById = new Map<string, IpRecord>([
      [
        'ip-1',
        {
          id: 'ip-1',
          organizationId: 'org',
          datacenterId: null,
          networkId: null,
          serverId: 's-1',
          vpnId: 'vpn-1',
          address: '10.200.0.2',
          version: 4,
          allocation: 'dedicated',
          scope: 'vpn',
          displayName: null,
          metadata: null,
          options: null,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    ])
    expect(overlayAddressForPeer(p, ipById)).toBe('10.200.0.2')
    expect(overlayAddressForPeer({ ...p, tunnelIpId: null }, ipById)).toBeNull()
  })
})

describe('resolveSiteLinks', () => {
  it('collects multi-site peer landings per VPN', () => {
    const peers = [
      peer({
        id: 'p-a',
        serverId: 's-a',
        role: 'gateway',
        createdAt: '2026-01-01T00:00:00.000Z',
        vpnId: 'vpn-1',
      }),
      peer({
        id: 'p-b',
        serverId: 's-b',
        role: 'gateway',
        createdAt: '2026-01-01T00:00:00.000Z',
        vpnId: 'vpn-1',
      }),
    ]
    const servers = new Map([
      ['s-a', { datacenterId: 'dc-ams' }],
      ['s-b', { datacenterId: 'dc-fra' }],
    ])
    const result = resolveSiteLinks(peers, servers, [{ id: 'vpn-1' }])
    expect(result.get('vpn-1')).toEqual({
      datacenterIds: ['dc-ams', 'dc-fra'],
      hasUnassignedPeers: false,
    })
  })

  it('keeps a single-site mesh as one datacenter id', () => {
    const peers = [
      peer({
        id: 'p-1',
        serverId: 's-1',
        role: 'member',
        createdAt: '2026-01-01T00:00:00.000Z',
        vpnId: 'vpn-1',
      }),
    ]
    const servers = new Map([['s-1', { datacenterId: 'dc-1' }]])
    expect(resolveSiteLinks(peers, servers, [{ id: 'vpn-1' }]).get('vpn-1')).toEqual({
      datacenterIds: ['dc-1'],
      hasUnassignedPeers: false,
    })
  })

  it('flags peers without a datacenter as unassigned', () => {
    const peers = [
      peer({
        id: 'p-1',
        serverId: 's-1',
        role: 'member',
        createdAt: '2026-01-01T00:00:00.000Z',
        vpnId: 'vpn-1',
      }),
      peer({
        id: 'p-2',
        serverId: 's-2',
        role: 'gateway',
        createdAt: '2026-01-01T00:00:00.000Z',
        vpnId: 'vpn-1',
      }),
    ]
    const servers = new Map([
      ['s-1', { datacenterId: null }],
      ['s-2', { datacenterId: 'dc-1' }],
    ])
    const sites = resolveSiteLinks(peers, servers, [{ id: 'vpn-1' }]).get(
      'vpn-1',
    )
    expect(sites).toEqual({
      datacenterIds: ['dc-1'],
      hasUnassignedPeers: true,
    })
    expect(
      formatSiteLinkLabel(sites!, new Map([['dc-1', 'AMS']])),
    ).toBe('AMS ↔ Unassigned hosts')
  })
})
