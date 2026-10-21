import { describe, expect, it } from 'vitest'
import type { DatacenterRecord, ServerTrafficMapNetwork } from '@/lib/instance-api'
import {
  linkLabel,
  networkBadge,
  placeLabel,
  renumberedLines,
  networkDownNote,
  orderedNetworks,
  peerSummary,
  tiedNetworkIds,
  trafficStateLabel,
  trafficStateTone,
} from './server-traffic'

function dc(
  id: string,
  priority: number,
  trusted = true,
  name: string | null = id
): DatacenterRecord {
  return { id, name, priority, trusted } as DatacenterRecord
}

function net(over: Partial<ServerTrafficMapNetwork>): ServerTrafficMapNetwork {
  return {
    datacenterId: 'a',
    name: 'Backhaul',
    priority: 10,
    trusted: true,
    state: 'chosen',
    localAddress: null,
    peerAddress: null,
    localInterface: null,
    peerInterface: null,
    localLink: 'up',
    peerLink: 'up',
    ...over,
  }
}

describe('orderedNetworks', () => {
  it('puts the lowest number first and moves untrusted networks to the unused list', () => {
    const { used, unused } = orderedNetworks([dc('b', 100), dc('a', 10), dc('c', 5, false)])
    expect(used.map((d) => d.id)).toEqual(['a', 'b'])
    expect(unused.map((d) => d.id)).toEqual(['c'])
  })

  it('breaks a tie by name', () => {
    const { used } = orderedNetworks([dc('x', 100, true, 'Zed'), dc('y', 100, true, 'Alpha')])
    expect(used.map((d) => d.id)).toEqual(['y', 'x'])
  })
})

describe('tiedNetworkIds', () => {
  it('flags networks that share a number', () => {
    expect([...tiedNetworkIds([dc('a', 10), dc('b', 10), dc('c', 20)])].sort()).toEqual(['a', 'b'])
  })
})

describe('labels', () => {
  it('uses plain words for every state', () => {
    expect(trafficStateLabel('chosen')).toBe('Carrying traffic')
    expect(trafficStateLabel('standby')).toBe('Ready as a backup')
    expect(trafficStateLabel('link_down')).toBe('Down, last resort only')
    expect(trafficStateTone('chosen')).toBe('ok')
    expect(trafficStateTone('link_down')).toBe('danger')
    expect(trafficStateTone('untrusted')).toBe('muted')
    expect(linkLabel('unknown')).toBe('Not reported')
  })

  it('names the network carrying a peer, or says none is up', () => {
    expect(peerSummary('a', [net({})])).toBe('Using Backhaul')
    expect(peerSummary(null, [net({})])).toBe('No shared network is up')
  })

  it('says which side is down', () => {
    expect(networkDownNote(net({}))).toBeNull()
    expect(networkDownNote(net({ localLink: 'down' }))).toContain('this server')
    expect(networkDownNote(net({ peerLink: 'down' }))).toContain('other server')
    expect(networkDownNote(net({ localLink: 'down', peerLink: 'down' }))).toContain('both')
  })
})

describe('networkBadge and placeLabel', () => {
  it('shows one clear badge per row', () => {
    expect(networkBadge(1, false)).toEqual({ label: 'Used first', tone: 'ok' })
    expect(networkBadge(1, true)?.label).toBe('Tied for first')
    expect(networkBadge(2, true)?.label).toBe('Same priority as another')
    expect(networkBadge(3, false)?.label).toBe('Third')
    expect(networkBadge(null, false)?.label).toBe('Not used')
    expect(placeLabel(12)).toBe('Number 12')
  })

  it('lists renumbered networks by name', () => {
    expect(
      renumberedLines([{ datacenterId: 'a', before: 100, after: 110 }], new Map([['a', 'LAN']]))
    ).toEqual(['LAN: priority 100 is now 110'])
  })
})
