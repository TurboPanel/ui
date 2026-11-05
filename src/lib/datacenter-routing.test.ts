import { describe, expect, it } from 'vitest'
import { DEFAULT_DATACENTER_PRIORITY } from '@/lib/instance-api'
import {
  buildDatacenterPolicyMap,
  DATACENTER_PRIORITY_MAX,
  DATACENTER_PRIORITY_MIN,
  describeDatacenterTransport,
  findDatacenterWinnerHint,
  formatDatacenterWinnerHint,
  formatPriorityRivals,
  joinWithAnd,
  networksWherePriorityMatters,
  overlappingPriorityTies,
  parseDatacenterPriorityDraft,
  priorityMatters,
  priorityRivals,
  priorityTies,
  sharedServerNetworks,
  winningDatacenterId,
} from './datacenter-routing'

const DATACENTERS = [
  { id: 'dc-lan', name: 'Primary LAN', priority: 100, trusted: true },
  { id: 'dc-backhaul', name: 'Backhaul', priority: 10, trusted: true },
  { id: 'dc-retail', name: 'Retail Wi-Fi', priority: 5, trusted: false },
]

const NAMES = new Map(DATACENTERS.map((dc) => [dc.id, dc.name]))

const SERVERS = [
  {
    id: 'db-1',
    name: 'db-1',
    datacenters: [
      { id: 'dc-lan', name: 'Primary LAN' },
      { id: 'dc-backhaul', name: 'Backhaul' },
      { id: 'dc-retail', name: 'Retail Wi-Fi' },
    ],
  },
  {
    id: 'db-2',
    name: 'db-2',
    datacenters: [
      { id: 'dc-lan', name: 'Primary LAN' },
      { id: 'dc-backhaul', name: 'Backhaul' },
      { id: 'dc-retail', name: 'Retail Wi-Fi' },
    ],
  },
  {
    id: 'web-1',
    hostname: 'web-1.example',
    datacenters: [{ id: 'dc-lan', name: 'Primary LAN' }],
  },
]

describe('buildDatacenterPolicyMap', () => {
  it('applies the documented defaults to absent fields', () => {
    const map = buildDatacenterPolicyMap([{ id: 'a' }, { id: 'b', priority: 3, trusted: false }])
    expect(map.get('a')).toEqual({ priority: DEFAULT_DATACENTER_PRIORITY, trusted: true })
    expect(map.get('b')).toEqual({ priority: 3, trusted: false })
  })
})

describe('parseDatacenterPriorityDraft', () => {
  it('accepts the bounds and treats empty as the default', () => {
    expect(parseDatacenterPriorityDraft('')).toEqual({
      ok: true,
      priority: DEFAULT_DATACENTER_PRIORITY,
    })
    expect(parseDatacenterPriorityDraft(String(DATACENTER_PRIORITY_MIN))).toEqual({
      ok: true,
      priority: 0,
    })
    expect(parseDatacenterPriorityDraft(` ${DATACENTER_PRIORITY_MAX} `)).toEqual({
      ok: true,
      priority: 1000,
    })
  })

  it('rejects what the instance would silently drop instead of clamping', () => {
    expect(parseDatacenterPriorityDraft('1001').ok).toBe(false)
    expect(parseDatacenterPriorityDraft('-1').ok).toBe(false)
    expect(parseDatacenterPriorityDraft('1.5').ok).toBe(false)
    expect(parseDatacenterPriorityDraft('ten').ok).toBe(false)
    const rejected = parseDatacenterPriorityDraft('5000')
    expect(rejected.ok === false && rejected.reason).toContain('lower wins')
  })
})

describe('winningDatacenterId', () => {
  it('picks the lowest-priority trusted shared datacenter and skips untrusted ones', () => {
    const policies = buildDatacenterPolicyMap(DATACENTERS)
    expect(
      winningDatacenterId(
        ['dc-lan', 'dc-backhaul', 'dc-retail'],
        ['dc-retail', 'dc-backhaul', 'dc-lan'],
        policies
      )
    ).toBe('dc-backhaul')
    expect(winningDatacenterId(['dc-retail'], ['dc-retail'], policies)).toBeNull()
    expect(winningDatacenterId(['dc-lan'], ['dc-backhaul'], policies)).toBeNull()
  })
})

describe('findDatacenterWinnerHint', () => {
  const policies = buildDatacenterPolicyMap(DATACENTERS)

  it('names the winner and the loser for the first pair sharing more than one trusted datacenter', () => {
    const hint = findDatacenterWinnerHint('dc-lan', SERVERS, policies)
    expect(hint).toEqual({
      winnerId: 'dc-backhaul',
      loserId: 'dc-lan',
      serverA: 'db-1',
      serverB: 'db-2',
    })
    expect(formatDatacenterWinnerHint(hint!, NAMES, policies)).toBe(
      'Backhaul (priority 10) currently wins over Primary LAN (100) for db-1 ↔ db-2.'
    )
  })

  it('reports the loser from the perspective of the winning datacenter too', () => {
    const hint = findDatacenterWinnerHint('dc-backhaul', SERVERS, policies)
    expect(hint?.winnerId).toBe('dc-backhaul')
    expect(hint?.loserId).toBe('dc-lan')
  })

  it('is null when priority changes nothing (untrusted, or no multi-shared pair)', () => {
    expect(findDatacenterWinnerHint('dc-retail', SERVERS, policies)).toBeNull()
    expect(findDatacenterWinnerHint('dc-lan', [SERVERS[0]!, SERVERS[2]!], policies)).toBeNull()
    expect(findDatacenterWinnerHint('dc-lan', [], policies)).toBeNull()
  })

  it('falls back to hostname and id for unnamed servers and datacenters', () => {
    const hint = findDatacenterWinnerHint(
      'dc-lan',
      [
        {
          id: 'a',
          hostname: 'a.host',
          datacenters: [
            { id: 'dc-lan', name: null },
            { id: 'dc-x', name: null },
          ],
        },
        {
          id: 'b',
          datacenters: [
            { id: 'dc-lan', name: null },
            { id: 'dc-x', name: null },
          ],
        },
      ],
      buildDatacenterPolicyMap([{ id: 'dc-lan', priority: 50 }])
    )
    expect(hint).toEqual({
      winnerId: 'dc-lan',
      loserId: 'dc-x',
      serverA: 'a.host',
      serverB: 'b',
    })
    expect(formatDatacenterWinnerHint(hint!, new Map(), buildDatacenterPolicyMap([]))).toBe(
      'dc-lan (priority 100) currently wins over dc-x (100) for a.host ↔ b.'
    )
  })
})

describe('describeDatacenterTransport', () => {
  const policies = buildDatacenterPolicyMap(DATACENTERS)

  it('appends the winning datacenter and its priority', () => {
    expect(
      describeDatacenterTransport({
        baseLabel: 'Datacenter network',
        memberDatacenterIds: ['dc-lan', 'dc-backhaul'],
        primaryDatacenterIds: ['dc-backhaul', 'dc-lan'],
        policies,
        nameById: NAMES,
      })
    ).toBe('Datacenter network · Backhaul (priority 10)')
  })

  it('keeps the base label when no trusted datacenter is shared', () => {
    expect(
      describeDatacenterTransport({
        baseLabel: 'Datacenter network',
        memberDatacenterIds: ['dc-retail'],
        primaryDatacenterIds: ['dc-retail'],
        policies,
        nameById: NAMES,
      })
    ).toBe('Datacenter network')
  })
})

describe('priority shows only when it matters', () => {
  const on = (...ids: string[]) => ({ datacenters: ids.map((id) => ({ id, name: id })) })
  const policies = buildDatacenterPolicyMap([
    { id: 'lan', priority: 100, trusted: true },
    { id: 'backhaul', priority: 10, trusted: true },
    { id: 'office', priority: 100, trusted: true },
    { id: 'wifi', priority: 5, trusted: false },
  ])

  it('pairs networks only when two servers are on both', () => {
    const shared = sharedServerNetworks([
      on('lan', 'backhaul'),
      on('lan', 'backhaul'),
      on('lan', 'office'),
    ])
    expect([...(shared.get('lan') ?? [])]).toEqual(['backhaul'])
    expect([...(shared.get('backhaul') ?? [])]).toEqual(['lan'])
    expect(shared.has('office')).toBe(false)
  })

  it('shows priority on a trusted network that shares servers with another trusted one', () => {
    const shared = sharedServerNetworks([on('lan', 'backhaul'), on('lan', 'backhaul')])
    expect(priorityMatters('lan', true, shared, policies)).toBe(true)
    expect(priorityRivals('lan', shared, policies)).toEqual(['backhaul'])
  })

  it('hides priority with no overlap, on untrusted networks, and against untrusted rivals', () => {
    const lone = sharedServerNetworks([on('lan', 'backhaul'), on('lan')])
    expect(priorityMatters('lan', true, lone, policies)).toBe(false)
    const withWifi = sharedServerNetworks([on('lan', 'wifi'), on('lan', 'wifi')])
    expect(priorityMatters('lan', true, withWifi, policies)).toBe(false)
    expect(priorityMatters('wifi', false, withWifi, policies)).toBe(false)
    const both = sharedServerNetworks([on('lan', 'backhaul'), on('lan', 'backhaul')])
    expect(priorityMatters('lan', false, both, policies)).toBe(false)
  })

  it('lists the networks where priority matters', () => {
    const shared = sharedServerNetworks([
      on('lan', 'backhaul', 'wifi'),
      on('lan', 'backhaul', 'wifi'),
    ])
    const shown = networksWherePriorityMatters(
      [
        { id: 'lan', priority: 100, trusted: true },
        { id: 'backhaul', priority: 10, trusted: true },
        { id: 'office', priority: 100, trusted: true },
        { id: 'wifi', priority: 5, trusted: false },
      ],
      shared
    )
    expect([...shown].sort((a, b) => a.localeCompare(b))).toEqual(['backhaul', 'lan'])
  })

  it('finds ties only among networks that share servers', () => {
    const shared = sharedServerNetworks([
      on('lan', 'office', 'backhaul'),
      on('lan', 'office', 'backhaul'),
    ])
    expect(priorityTies('lan', 100, shared, policies)).toEqual(['office'])
    expect(priorityTies('backhaul', 10, shared, policies)).toEqual([])
    expect(
      formatPriorityRivals(['backhaul', 'office'], new Map([['backhaul', 'Backhaul']]), policies)
    ).toBe('Backhaul (priority 10) and office (priority 100)')
  })

  it('joins names in plain words', () => {
    expect(joinWithAnd([])).toBe('')
    expect(joinWithAnd(['A'])).toBe('A')
    expect(joinWithAnd(['A', 'B', 'C'])).toBe('A, B and C')
  })

  it('keeps an equal-priority warning only for networks that share servers', () => {
    const warnings = [
      { code: 'equal_priority', priority: 100, datacenterIds: ['lan', 'office', 'spare'] },
      { code: 'chosen_network_down', datacenterIds: ['lan'] },
    ]
    const overlapping = sharedServerNetworks([on('lan', 'office'), on('lan', 'office')])
    expect(overlappingPriorityTies(warnings, overlapping)).toEqual([
      { code: 'equal_priority', priority: 100, datacenterIds: ['lan', 'office'] },
    ])
    expect(
      overlappingPriorityTies(warnings, sharedServerNetworks([on('lan'), on('office')]))
    ).toEqual([])
  })
})
