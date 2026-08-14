import { describe, expect, it } from 'vitest'
import type { RelayRecord } from './instance-api'
import {
  formatSiteLinkLabel,
  meshLabelForSite,
  relayRoleLabel,
  resolvePrimaryGatewayByDatacenter,
  resolveSiteLinks,
} from './fabric-mesh'

function relay(
  partial: Pick<RelayRecord, 'serverId' | 'role'> &
    Partial<Omit<RelayRecord, 'serverId' | 'role'>>,
): RelayRecord {
  return {
    address: '10.64.0.1',
    advertisedCidrs: [],
    keepalive: null,
    endpointAddress: null,
    resolvedEndpoint: null,
    publicKey: null,
    hasPresharedKey: false,
    segments: [],
    prefix: 'tp',
    lastHandshakeAt: null,
    ...partial,
  }
}

describe('resolveSiteLinks', () => {
  it('collects datacenters from relays and flags unassigned hosts', () => {
    const serverById = new Map([
      ['srv-a', { datacenterId: 'dc-ams' }],
      ['srv-b', { datacenterId: 'dc-fra' }],
      ['srv-c', { datacenterId: null }],
    ])
    const mesh = resolveSiteLinks(
      [
        relay({ serverId: 'srv-a', role: 'gateway' }),
        relay({ serverId: 'srv-b', role: 'member' }),
        relay({ serverId: 'srv-c', role: 'member' }),
      ],
      serverById,
    )
    expect(mesh.datacenterIds).toEqual(['dc-ams', 'dc-fra'])
    expect(mesh.hasUnassignedPeers).toBe(true)
  })

  it('treats a missing server as unassigned', () => {
    const mesh = resolveSiteLinks(
      [relay({ serverId: 'srv-missing', role: 'member' })],
      new Map(),
    )
    expect(mesh.datacenterIds).toEqual([])
    expect(mesh.hasUnassignedPeers).toBe(true)
  })
})

describe('formatSiteLinkLabel', () => {
  const names = new Map([
    ['dc-ams', 'AMS'],
    ['dc-fra', 'FRA'],
    ['dc-sfo', 'SFO'],
  ])

  it('labels two sites as A ↔ B', () => {
    expect(
      formatSiteLinkLabel(
        { datacenterIds: ['dc-ams', 'dc-fra'], hasUnassignedPeers: false },
        names,
      ),
    ).toBe('AMS ↔ FRA')
  })

  it('labels three or more sites as first ↔ N sites', () => {
    expect(
      formatSiteLinkLabel(
        {
          datacenterIds: ['dc-ams', 'dc-fra', 'dc-sfo'],
          hasUnassignedPeers: false,
        },
        names,
      ),
    ).toBe('AMS ↔ 2 sites')
  })

  it('labels unassigned-only meshes', () => {
    expect(
      formatSiteLinkLabel(
        { datacenterIds: [], hasUnassignedPeers: true },
        names,
      ),
    ).toBe('Unassigned hosts')
  })
})

describe('meshLabelForSite', () => {
  it('returns null when the site is not on the mesh', () => {
    expect(
      meshLabelForSite(
        'dc-other',
        { datacenterIds: ['dc-ams'], hasUnassignedPeers: false },
        new Map([['dc-ams', 'AMS']]),
      ),
    ).toBeNull()
  })
})

describe('resolvePrimaryGatewayByDatacenter', () => {
  it('prefers the first online gateway by serverId', () => {
    const serverById = new Map([
      ['srv-b', { connected: true, datacenterId: 'dc-1' }],
      ['srv-a', { connected: false, datacenterId: 'dc-1' }],
    ])
    const primary = resolvePrimaryGatewayByDatacenter(
      [
        relay({ serverId: 'srv-a', role: 'gateway' }),
        relay({ serverId: 'srv-b', role: 'gateway' }),
        relay({ serverId: 'srv-c', role: 'member' }),
      ],
      serverById,
    )
    expect(primary.get('dc-1')).toBe('srv-b')
  })

  it('falls back to the first gateway when none are online', () => {
    const serverById = new Map([
      ['srv-z', { connected: false, datacenterId: 'dc-1' }],
      ['srv-m', { connected: false, datacenterId: 'dc-1' }],
    ])
    const primary = resolvePrimaryGatewayByDatacenter(
      [
        relay({ serverId: 'srv-z', role: 'gateway' }),
        relay({ serverId: 'srv-m', role: 'gateway' }),
      ],
      serverById,
    )
    expect(primary.get('dc-1')).toBe('srv-m')
  })
})

describe('relayRoleLabel', () => {
  it('labels gateway and member', () => {
    expect(relayRoleLabel('gateway')).toBe('Gateway')
    expect(relayRoleLabel('member')).toBe('Member')
  })
})
