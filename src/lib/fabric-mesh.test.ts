import { describe, expect, it } from 'vitest'
import type { RelayRecord } from './instance-api'
import {
  buildFabricPathMatrix,
  fabricPathIsDegraded,
  fabricPathKindLabel,
  fabricRoutedViaLabels,
  formatResolvedAdvertisedCidrs,
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
    resolvedAdvertisedCidrs: [],
    keepalive: null,
    endpointAddress: null,
    resolvedEndpoint: null,
    publicKey: null,
    hasPresharedKey: false,
    segments: [],
    prefix: 'tp',
    lastHandshakeAt: null,
    paths: [],
    allowRelay: null,
    effectiveAllowRelay: false,
    preferredGatewayIds: [],
    gatewayEligible: partial.role === 'gateway',
    ...partial,
  }
}

describe('resolveSiteLinks', () => {
  it('collects datacenters from relays and flags unassigned hosts', () => {
    const serverById = new Map([
      ['srv-a', { datacenters: [{ id: 'dc-ams', name: 'AMS' }] }],
      ['srv-b', { datacenters: [{ id: 'dc-fra', name: 'FRA' }] }],
      ['srv-c', { datacenters: [] }],
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

  it('includes every membership when a relay server is in multiple sites', () => {
    const mesh = resolveSiteLinks(
      [relay({ serverId: 'srv-a', role: 'gateway' })],
      new Map([
        [
          'srv-a',
          {
            datacenters: [
              { id: 'dc-ams', name: 'AMS' },
              { id: 'dc-fra', name: 'FRA' },
            ],
          },
        ],
      ]),
    )
    expect(mesh.datacenterIds).toEqual(['dc-ams', 'dc-fra'])
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

  it('labels an empty mesh with no peers', () => {
    expect(
      formatSiteLinkLabel(
        { datacenterIds: [], hasUnassignedPeers: false },
        names,
      ),
    ).toBe('No sites yet')
  })

  it('labels a single site alone or with unassigned peers', () => {
    expect(
      formatSiteLinkLabel(
        { datacenterIds: ['dc-ams'], hasUnassignedPeers: false },
        names,
      ),
    ).toBe('AMS')
    expect(
      formatSiteLinkLabel(
        { datacenterIds: ['dc-ams'], hasUnassignedPeers: true },
        names,
      ),
    ).toBe('AMS ↔ Unassigned hosts')
  })

  it('falls back to the datacenter id when a name is missing', () => {
    expect(
      formatSiteLinkLabel(
        { datacenterIds: ['dc-unknown'], hasUnassignedPeers: false },
        names,
      ),
    ).toBe('dc-unknown')
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

  it('returns the mesh label when the site participates', () => {
    expect(
      meshLabelForSite(
        'dc-ams',
        { datacenterIds: ['dc-ams', 'dc-fra'], hasUnassignedPeers: false },
        new Map([
          ['dc-ams', 'AMS'],
          ['dc-fra', 'FRA'],
        ]),
      ),
    ).toBe('AMS ↔ FRA')
  })
})

describe('resolvePrimaryGatewayByDatacenter', () => {
  it('prefers the first online gateway by serverId', () => {
    const serverById = new Map([
      [
        'srv-b',
        {
          connected: true,
          datacenters: [{ id: 'dc-1', name: 'One' }],
        },
      ],
      [
        'srv-a',
        {
          connected: false,
          datacenters: [{ id: 'dc-1', name: 'One' }],
        },
      ],
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
      [
        'srv-z',
        {
          connected: false,
          datacenters: [{ id: 'dc-1', name: 'One' }],
        },
      ],
      [
        'srv-m',
        {
          connected: false,
          datacenters: [{ id: 'dc-1', name: 'One' }],
        },
      ],
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

describe('formatResolvedAdvertisedCidrs', () => {
  it('joins derived IPv4 defaults for display', () => {
    expect(
      formatResolvedAdvertisedCidrs(['198.51.100.0/24', '203.0.113.0/24']),
    ).toBe('198.51.100.0/24, 203.0.113.0/24')
  })

  it('labels an empty derived list', () => {
    expect(formatResolvedAdvertisedCidrs([])).toBe('none')
  })
})

describe('fabricPathKindLabel', () => {
  it('maps the six path states', () => {
    expect(fabricPathKindLabel('direct_lan')).toBe('Direct')
    expect(fabricPathKindLabel('direct_public')).toBe('Direct')
    expect(fabricPathKindLabel('direct_nat')).toBe('NAT direct')
    expect(fabricPathKindLabel('gateway')).toBe('Gateway')
    expect(fabricPathKindLabel('relay')).toBe('Relayed')
    expect(fabricPathKindLabel('unreachable')).toBe('Unreachable')
  })
})

describe('fabricPathIsDegraded', () => {
  it('treats relay as always degraded', () => {
    expect(fabricPathIsDegraded({ kind: 'relay', degraded: false })).toBe(true)
  })

  it('honors the stamped degraded flag for other kinds', () => {
    expect(fabricPathIsDegraded({ kind: 'direct_lan', degraded: true })).toBe(
      true,
    )
    expect(fabricPathIsDegraded({ kind: 'gateway' })).toBe(false)
  })
})

describe('buildFabricPathMatrix', () => {
  const names = new Map([
    ['srv-a', 'Server A'],
    ['srv-b', 'Server B'],
    ['srv-c', 'Server C'],
    ['srv-d', 'Server D'],
    ['srv-e', 'Server E'],
    ['srv-f', 'Server F'],
    ['srv-gw', 'dc-gw-1'],
  ])

  it('flattens direct, gateway, relay, and unreachable rows with via labels', () => {
    const rows = buildFabricPathMatrix(
      [
        relay({
          serverId: 'srv-a',
          role: 'member',
          paths: [
            {
              peerServerId: 'srv-e',
              selected: 'relay',
              latencyMs: 93,
              degraded: false,
            },
            {
              peerServerId: 'srv-c',
              selected: 'direct_nat',
              latencyMs: 31,
              degraded: false,
            },
            {
              peerServerId: 'srv-f',
              selected: 'unreachable',
              degraded: true,
            },
            {
              peerServerId: 'srv-d',
              selected: 'gateway',
              viaServerId: 'srv-gw',
              latencyMs: 44,
              degraded: false,
            },
            {
              peerServerId: 'srv-b',
              selected: 'direct_lan',
              endpoint: '10.0.0.2:51821',
              latencyMs: 18,
              degraded: false,
            },
          ],
        }),
      ],
      names,
    )
    expect(rows.map((row) => `${row.fromLabel}→${row.toLabel}`)).toEqual([
      'Server A→Server B',
      'Server A→Server C',
      'Server A→Server D',
      'Server A→Server E',
      'Server A→Server F',
    ])
    expect(rows[0]).toMatchObject({
      kind: 'direct_lan',
      endpoint: '10.0.0.2:51821',
      latencyMs: 18,
      degraded: false,
    })
    expect(rows[1]?.kind).toBe('direct_nat')
    expect(rows[2]).toMatchObject({
      kind: 'gateway',
      viaServerId: 'srv-gw',
      viaLabel: 'dc-gw-1',
      latencyMs: 44,
    })
    expect(rows[3]).toMatchObject({ kind: 'relay', degraded: true })
    expect(rows[4]).toMatchObject({
      kind: 'unreachable',
      degraded: true,
    })
    expect(rows[4]?.latencyMs).toBeUndefined()
  })

  it('falls back to the server id when a name is missing', () => {
    const rows = buildFabricPathMatrix(
      [
        relay({
          serverId: 'srv-unknown',
          role: 'member',
          paths: [
            {
              peerServerId: 'srv-b',
              selected: 'direct_public',
              degraded: false,
            },
          ],
        }),
      ],
      names,
    )
    expect(rows[0]?.fromLabel).toBe('srv-unknown')
    expect(rows[0]?.toLabel).toBe('Server B')
  })

  it('carries optional handshake timestamps on matrix rows', () => {
    const rows = buildFabricPathMatrix(
      [
        relay({
          serverId: 'srv-a',
          role: 'member',
          paths: [
            {
              peerServerId: 'srv-b',
              selected: 'direct_lan',
              lastHandshakeAt: '2026-08-19T12:00:00.000Z',
              degraded: false,
            },
          ],
        }),
      ],
      names,
    )
    expect(rows[0]?.lastHandshakeAt).toBe('2026-08-19T12:00:00.000Z')
  })
})

describe('fabricRoutedViaLabels', () => {
  it('collects unique gateway via labels', () => {
    expect(
      fabricRoutedViaLabels(
        {
          paths: [
            {
              peerServerId: 'srv-b',
              selected: 'gateway',
              viaServerId: 'srv-gw',
              degraded: false,
            },
            {
              peerServerId: 'srv-c',
              selected: 'direct_lan',
              degraded: false,
            },
            {
              peerServerId: 'srv-d',
              selected: 'gateway',
              viaServerId: 'srv-gw',
              degraded: false,
            },
          ],
        },
        new Map([['srv-gw', 'dc-gw-1']]),
      ),
    ).toEqual(['dc-gw-1'])
  })

  it('falls back to the raw server id when the via label is unknown', () => {
    expect(
      fabricRoutedViaLabels(
        {
          paths: [
            {
              peerServerId: 'srv-b',
              selected: 'gateway',
              viaServerId: 'srv-unknown-gw',
              degraded: false,
            },
          ],
        },
        new Map(),
      ),
    ).toEqual(['srv-unknown-gw'])
  })
})
