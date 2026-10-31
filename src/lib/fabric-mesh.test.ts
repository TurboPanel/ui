import { describe, expect, it } from 'vitest'
import type { OrgFabricPairRecord, OrgFabricServerRecord, RelayRecord } from './instance-api'
import {
  buildFabricPairRows,
  buildFabricPathMatrix,
  buildServerPairRows,
  fabricPairPathLabel,
  fabricHandshakeReading,
  fabricInactiveServerIds,
  fabricIsQuiet,
  fabricPairUsesTunnel,
  fabricServerPairRows,
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
  partial: Pick<RelayRecord, 'serverId' | 'role'> & Partial<Omit<RelayRecord, 'serverId' | 'role'>>
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
      serverById
    )
    expect(mesh.datacenterIds).toEqual(['dc-ams', 'dc-fra'])
    expect(mesh.hasUnassignedPeers).toBe(true)
  })

  it('treats a missing server as unassigned', () => {
    const mesh = resolveSiteLinks([relay({ serverId: 'srv-missing', role: 'member' })], new Map())
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
      ])
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
      formatSiteLinkLabel({ datacenterIds: ['dc-ams', 'dc-fra'], hasUnassignedPeers: false }, names)
    ).toBe('AMS ↔ FRA')
  })

  it('labels three or more sites as first ↔ N sites', () => {
    expect(
      formatSiteLinkLabel(
        {
          datacenterIds: ['dc-ams', 'dc-fra', 'dc-sfo'],
          hasUnassignedPeers: false,
        },
        names
      )
    ).toBe('AMS ↔ 2 sites')
  })

  it('labels unassigned-only meshes', () => {
    expect(formatSiteLinkLabel({ datacenterIds: [], hasUnassignedPeers: true }, names)).toBe(
      'Unassigned hosts'
    )
  })

  it('labels an empty mesh with no peers', () => {
    expect(formatSiteLinkLabel({ datacenterIds: [], hasUnassignedPeers: false }, names)).toBe(
      'No sites yet'
    )
  })

  it('labels a single site alone or with unassigned peers', () => {
    expect(
      formatSiteLinkLabel({ datacenterIds: ['dc-ams'], hasUnassignedPeers: false }, names)
    ).toBe('AMS')
    expect(
      formatSiteLinkLabel({ datacenterIds: ['dc-ams'], hasUnassignedPeers: true }, names)
    ).toBe('AMS ↔ Unassigned hosts')
  })

  it('falls back to the datacenter id when a name is missing', () => {
    expect(
      formatSiteLinkLabel({ datacenterIds: ['dc-unknown'], hasUnassignedPeers: false }, names)
    ).toBe('dc-unknown')
  })
})

describe('meshLabelForSite', () => {
  it('returns null when the site is not on the mesh', () => {
    expect(
      meshLabelForSite(
        'dc-other',
        { datacenterIds: ['dc-ams'], hasUnassignedPeers: false },
        new Map([['dc-ams', 'AMS']])
      )
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
        ])
      )
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
      serverById
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
      serverById
    )
    expect(primary.get('dc-1')).toBe('srv-m')
  })
})

describe('relayRoleLabel', () => {
  it('labels gateway and member', () => {
    expect(relayRoleLabel('gateway')).toBe('Shared')
    expect(relayRoleLabel('member')).toBe('Not Shared')
  })
})

describe('formatResolvedAdvertisedCidrs', () => {
  it('joins derived IPv4 defaults for display', () => {
    expect(formatResolvedAdvertisedCidrs(['198.51.100.0/24', '203.0.113.0/24'])).toBe(
      '198.51.100.0/24, 203.0.113.0/24'
    )
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
    expect(fabricPathIsDegraded({ kind: 'direct_lan', degraded: true })).toBe(true)
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
      names
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
      names
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
      names
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
        new Map([['srv-gw', 'dc-gw-1']])
      )
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
        new Map()
      )
    ).toEqual(['srv-unknown-gw'])
  })
})

function pair(
  fromServerId: string,
  toServerId: string,
  path: OrgFabricPairRecord['path'],
  reason = 'Because.'
): OrgFabricPairRecord {
  return { fromServerId, toServerId, path, reason }
}

function fabricServer(serverId: string, name: string): OrgFabricServerRecord {
  return {
    serverId,
    name,
    enabled: true,
    member: true,
    role: 'gateway',
    roleSource: 'automatic',
    automaticRole: 'gateway',
  }
}

const names = new Map([
  ['srv-a', 'alpha'],
  ['srv-b', 'bravo'],
  ['srv-c', 'charlie'],
])

describe('fabricPairPathLabel', () => {
  it('names each path in book title case', () => {
    expect(fabricPairPathLabel('lan')).toBe('LAN')
    expect(fabricPairPathLabel('fabric')).toBe('TurboFabric')
    expect(fabricPairPathLabel('fabric_over_untrusted_lan')).toBe('TurboFabric over LAN')
    expect(fabricPairPathLabel('none')).toBe('No Path')
  })

  it('treats only the tunnel paths as using a tunnel', () => {
    expect(fabricPairUsesTunnel('fabric')).toBe(true)
    expect(fabricPairUsesTunnel('fabric_over_untrusted_lan')).toBe(true)
    expect(fabricPairUsesTunnel('lan')).toBe(false)
    expect(fabricPairUsesTunnel('none')).toBe(false)
  })
})

describe('buildFabricPairRows', () => {
  it('keeps the reason and adds tunnel readings from either direction', () => {
    const relays = [
      relay({
        serverId: 'srv-c',
        role: 'gateway',
        paths: [
          { peerServerId: 'srv-a', selected: 'direct_public', latencyMs: 42, degraded: false },
        ],
      }),
    ]
    const matrix = buildFabricPathMatrix(relays, names)
    const rows = buildFabricPairRows(
      [
        pair('srv-a', 'srv-c', 'fabric', 'They are in different datacenters.'),
        pair('srv-a', 'srv-b', 'lan', 'They share the trusted network Rack A.'),
      ],
      matrix,
      names
    )
    expect(rows.map((row) => [row.title, row.pathLabel, row.reason, row.latencyMs])).toEqual([
      ['alpha ↔ bravo', 'LAN', 'They share the trusted network Rack A.', undefined],
      ['alpha ↔ charlie', 'TurboFabric', 'They are in different datacenters.', 42],
    ])
  })

  it('never warns about a tunnel on a LAN pair', () => {
    const relays = [
      relay({
        serverId: 'srv-a',
        role: 'gateway',
        paths: [{ peerServerId: 'srv-b', selected: 'unreachable', degraded: true }],
      }),
    ]
    const matrix = buildFabricPathMatrix(relays, names)
    const [lanRow] = buildFabricPairRows([pair('srv-a', 'srv-b', 'lan')], matrix, names)
    expect(lanRow?.warning).toBeUndefined()
    const [tunnelRow] = buildFabricPairRows(
      [pair('srv-a', 'srv-b', 'fabric_over_untrusted_lan')],
      matrix,
      names
    )
    expect(tunnelRow?.pathLabel).toBe('TurboFabric over LAN')
    expect(tunnelRow?.warning).toBe('Unreachable')
  })

  it('does not call a tunnel unreachable when the other end connects out to it', () => {
    const relays = [
      relay({
        serverId: 'srv-a',
        role: 'gateway',
        paths: [{ peerServerId: 'srv-c', selected: 'unreachable', degraded: false }],
      }),
      relay({
        serverId: 'srv-c',
        role: 'member',
        paths: [
          { peerServerId: 'srv-a', selected: 'direct_public', latencyMs: 21, degraded: false },
        ],
      }),
    ]
    const matrix = buildFabricPathMatrix(relays, names)
    const [row] = buildFabricPairRows([pair('srv-a', 'srv-c', 'fabric')], matrix, names)
    expect(row?.warning).toBeUndefined()
    expect(row?.latencyMs).toBe(21)
  })

  it('still says unreachable when neither end reaches the other', () => {
    const relays = [
      relay({
        serverId: 'srv-a',
        role: 'gateway',
        paths: [{ peerServerId: 'srv-c', selected: 'unreachable', degraded: false }],
      }),
      relay({
        serverId: 'srv-c',
        role: 'member',
        paths: [{ peerServerId: 'srv-a', selected: 'unreachable', degraded: false }],
      }),
    ]
    const matrix = buildFabricPathMatrix(relays, names)
    const [row] = buildFabricPairRows([pair('srv-a', 'srv-c', 'fabric')], matrix, names)
    expect(row?.warning).toBe('Unreachable')
  })

  describe('a silent server never hides the warning', () => {
    const natPaths = (observedAt: string | undefined) => [
      relay({
        serverId: 'srv-a',
        role: 'gateway',
        paths: [{ peerServerId: 'srv-c', selected: 'unreachable', degraded: false }],
        observedAt: '2026-10-31T01:00:00.000Z',
      }),
      relay({
        serverId: 'srv-c',
        role: 'member',
        paths: [{ peerServerId: 'srv-a', selected: 'direct_public', degraded: false }],
        ...(observedAt ? { observedAt } : {}),
      }),
    ]
    const warningAt = (
      nowIso: string,
      observedAt: string | undefined,
      inactive?: Set<string>,
      quiet = false
    ) => {
      const matrix = buildFabricPathMatrix(natPaths(observedAt), names, inactive)
      const [row] = buildFabricPairRows([pair('srv-a', 'srv-c', 'fabric')], matrix, names, {
        nowMs: Date.parse(nowIso),
        quiet,
      })
      return row?.warning
    }

    it('trusts the other end while it reports', () => {
      expect(warningAt('2026-10-31T01:03:00.000Z', '2026-10-31T01:01:00.000Z')).toBeUndefined()
    })

    it('warns once nobody has reported for more than 7 minutes', () => {
      expect(warningAt('2026-10-31T01:20:00.000Z', '2026-10-31T01:01:00.000Z')).toBe(
        'Not Reporting'
      )
    })

    it('warns when the other end is switched off or the mesh is paused', () => {
      expect(
        warningAt('2026-10-31T01:03:00.000Z', '2026-10-31T01:01:00.000Z', new Set(['srv-c']))
      ).toBe('Unreachable')
    })

    it('says Not Reporting when neither end has reported for minutes', () => {
      const relays = [
        relay({
          serverId: 'srv-a',
          role: 'gateway',
          paths: [{ peerServerId: 'srv-c', selected: 'direct_public', degraded: false }],
          observedAt: '2026-10-31T01:00:00.000Z',
        }),
        relay({
          serverId: 'srv-c',
          role: 'member',
          paths: [{ peerServerId: 'srv-a', selected: 'direct_public', degraded: false }],
          observedAt: '2026-10-31T01:00:00.000Z',
        }),
      ]
      const matrix = buildFabricPathMatrix(relays, names)
      const read = (nowIso: string) =>
        buildFabricPairRows([pair('srv-a', 'srv-c', 'fabric')], matrix, names, {
          nowMs: Date.parse(nowIso),
          quiet: false,
        })[0]?.warning
      expect(read('2026-10-31T01:03:00.000Z')).toBeUndefined()
      expect(read('2026-10-31T01:30:00.000Z')).toBe('Not Reporting')
    })

    it('stays quiet while the mesh is paused or off', () => {
      expect(
        warningAt('2026-10-31T01:20:00.000Z', '2026-10-31T01:01:00.000Z', undefined, true)
      ).toBeUndefined()
    })

    it('trusts the other end when an older control plane sends no reading time', () => {
      expect(warningAt('2026-10-31T01:50:00.000Z', undefined)).toBeUndefined()
    })
  })

  it('falls back to the server id when a name is unknown', () => {
    const [row] = buildFabricPairRows([pair('srv-a', 'srv-x', 'none')], [], names)
    expect(row?.title).toBe('alpha ↔ srv-x')
    expect(row?.pathLabel).toBe('No Path')
  })
})

describe('buildServerPairRows', () => {
  it('lists only the pairs with this server, titled by the other server', () => {
    const rows = buildServerPairRows(
      'srv-b',
      [
        pair('srv-a', 'srv-b', 'lan'),
        pair('srv-b', 'srv-c', 'fabric'),
        pair('srv-a', 'srv-c', 'fabric'),
      ],
      [],
      names
    )
    expect(rows.map((row) => [row.key, row.title, row.pathLabel])).toEqual([
      ['srv-a', 'alpha', 'LAN'],
      ['srv-c', 'charlie', 'TurboFabric'],
    ])
  })
})

describe('fabricServerPairRows', () => {
  it('is empty when the panel sends no pairs', () => {
    expect(fabricServerPairRows('srv-a', undefined)).toEqual([])
    expect(
      fabricServerPairRows('srv-a', { servers: [fabricServer('srv-a', 'alpha')], relays: [] })
    ).toEqual([])
  })

  it('names the other servers from the fabric server list', () => {
    const rows = fabricServerPairRows('srv-a', {
      servers: [fabricServer('srv-a', 'alpha'), fabricServer('srv-b', 'bravo')],
      relays: [],
      pairs: [pair('srv-a', 'srv-b', 'lan', 'They share the trusted network Rack A.')],
    })
    expect(rows).toEqual([
      {
        key: 'srv-b',
        title: 'bravo',
        path: 'lan',
        pathLabel: 'LAN',
        reason: 'They share the trusted network Rack A.',
      },
    ])
  })
})

describe('fabricHandshakeReading', () => {
  const at = (iso: string) => Date.parse(iso)
  const reading = '2026-10-31T01:00:00.000Z'

  it('judges the handshake against the reading time, not against now', () => {
    // 100 s old when read; the page opens 4 minutes later, before the next reading.
    expect(
      fabricHandshakeReading('2026-10-31T00:58:20.000Z', reading, at('2026-10-31T01:04:00.000Z'))
    ).toBe('fresh')
  })

  it('warns when the handshake was already too old when the reading was taken', () => {
    expect(
      fabricHandshakeReading('2026-10-31T00:56:00.000Z', reading, at('2026-10-31T01:00:30.000Z'))
    ).toBe('stale')
  })

  it('says the server has stopped reporting when its reading is too old, never a quiet fine', () => {
    expect(
      fabricHandshakeReading('2026-10-31T00:59:00.000Z', reading, at('2026-10-31T01:20:00.000Z'))
    ).toBe('unreported')
  })

  it('asks for a handshake that has never happened', () => {
    expect(fabricHandshakeReading(null, reading, at(reading))).toBe('stale')
  })

  it('allows for reading lag when an older control plane sends no reading time', () => {
    const now = at('2026-10-31T01:05:00.000Z')
    expect(fabricHandshakeReading('2026-10-31T01:00:00.000Z', undefined, now)).toBe('fresh')
    expect(fabricHandshakeReading('2026-10-31T00:50:00.000Z', undefined, now)).toBe('stale')
  })
})

describe('fabricInactiveServerIds and fabricIsQuiet', () => {
  const servers = [
    { serverId: 'srv-a', enabled: true },
    { serverId: 'srv-b', enabled: false },
  ] as OrgFabricServerRecord[]
  const relays = [relay({ serverId: 'srv-a', role: 'member' })]

  it('lists the servers switched out of the mesh', () => {
    expect([...fabricInactiveServerIds({ servers, relays })]).toEqual(['srv-b'])
  })

  it('is quiet while paused or off, loud otherwise', () => {
    expect(fabricIsQuiet({ paused: true, enabled: false })).toBe(true)
    expect(fabricIsQuiet({ enabled: false })).toBe(true)
    expect(fabricIsQuiet({ paused: false, enabled: true })).toBe(false)
    expect(fabricIsQuiet({})).toBe(false)
  })
})
