import { describe, expect, it } from 'vitest'
import type { OrgServerRecord, TunnelCarrier, TunnelPortal, TunnelRecord } from '@/lib/instance-api'
import {
  carryCountNote,
  connectorLine,
  dnsOutcome,
  draftCarryCount,
  draftFromTunnel,
  draftRunsOn,
  EMPTY_PLACEMENT_DRAFT,
  hostnameProblem,
  hostnameStatusLabel,
  hostnameStatusTone,
  normalizeHostname,
  placementBody,
  placementSummary,
  portalState,
  seenLabel,
  serverChoices,
  serverInDatacenter,
  serverLabel,
  serverNeverCarries,
  toggleDraftServer,
  tunnelCapableCarriers,
  tunnelHealth,
  tunnelsRunningOn,
  withPlacementKind,
  type PlacementDraft,
  issuedCertificateNote,
  verifyOriginSummary,
} from './tunnel-runs'

function server(
  id: string,
  extra: { name?: string | null; dcs?: string[]; carry?: boolean } = {}
): OrgServerRecord {
  return {
    id,
    name: extra.name ?? null,
    hostname: null,
    datacenters: (extra.dcs ?? []).map((d) => ({ id: d, name: d })),
    options: extra.carry === undefined ? null : { tunnels: { carry: extra.carry } },
  } as unknown as OrgServerRecord
}

function tunnel(extra: Partial<TunnelRecord> = {}): TunnelRecord {
  return {
    id: 't1',
    name: 'main',
    provider: 'cloudflare',
    carrierId: 'c1',
    placement: 'chosen',
    datacenterId: null,
    status: 'active',
    createdAt: '2026-10-28T00:00:00Z',
    portals: [],
    carryingServerIds: [],
    warnings: [],
    doorwayCount: 0,
    verifyOrigin: { enabled: false, active: false, pendingNames: [] },
    ...extra,
  }
}

const portal = (extra: Partial<TunnelPortal>): TunnelPortal => ({
  serverId: 's1',
  wanted: 'run',
  reported: 'unknown',
  lastSeenAt: null,
  lastError: null,
  connectorVersion: null,
  ...extra,
})

describe('server facts', () => {
  it('knows a server set to never run tunnels', () => {
    expect(serverNeverCarries(server('a', { carry: false }))).toBe(true)
    expect(serverNeverCarries(server('a', { carry: true }))).toBe(false)
    expect(serverNeverCarries(server('a'))).toBe(false)
    expect(serverNeverCarries({ options: { tunnels: 'x' } } as unknown as OrgServerRecord)).toBe(
      false
    )
  })
  it('knows datacenter membership', () => {
    expect(serverInDatacenter(server('a', { dcs: ['d1'] }), 'd1')).toBe(true)
    expect(serverInDatacenter(server('a', { dcs: ['d1'] }), 'd2')).toBe(false)
    expect(serverInDatacenter(server('a', { dcs: ['d1'] }), null)).toBe(false)
  })
  it('names a server by name, then host name, then a short id', () => {
    expect(serverLabel({ id: 'abcdefghij', name: ' Web ', hostname: 'h' })).toBe('Web')
    expect(serverLabel({ id: 'abcdefghij', name: null, hostname: 'h' })).toBe('h')
    expect(serverLabel({ id: 'abcdefghij', name: '', hostname: null })).toBe('abcdefgh')
  })
})

describe('placement drafts', () => {
  it('reads a draft back from a chosen tunnel', () => {
    const t = tunnel({
      placement: 'chosen',
      portals: [portal({ serverId: 'a' }), portal({ serverId: 'b', wanted: 'skip' })],
    })
    expect(draftFromTunnel(t)).toMatchObject({ placement: 'chosen', serverIds: ['a'] })
  })
  it('reads the left-out servers of an all-servers tunnel', () => {
    const t = tunnel({
      placement: 'all',
      datacenterId: 'd1',
      portals: [portal({ serverId: 'b', wanted: 'skip' })],
    })
    expect(draftFromTunnel(t)).toEqual({
      placement: 'all',
      serverIds: [],
      exceptServerIds: ['b'],
      datacenterId: 'd1',
    })
  })
  it('keeps what applies when the kind changes', () => {
    const chosen: PlacementDraft = {
      ...EMPTY_PLACEMENT_DRAFT,
      placement: 'chosen',
      serverIds: ['a', 'b'],
    }
    expect(withPlacementKind(chosen, 'one').serverIds).toEqual(['a'])
    expect(withPlacementKind(chosen, 'all')).toMatchObject({ serverIds: [], exceptServerIds: [] })
    expect(withPlacementKind(chosen, 'chosen')).toBe(chosen)
    const all: PlacementDraft = {
      ...EMPTY_PLACEMENT_DRAFT,
      placement: 'all',
      exceptServerIds: ['x'],
      datacenterId: 'd1',
    }
    expect(withPlacementKind(all, 'chosen')).toMatchObject({
      exceptServerIds: [],
      datacenterId: 'd1',
    })
  })
  it('ticks servers for each kind', () => {
    const one = { ...EMPTY_PLACEMENT_DRAFT, placement: 'one' as const }
    const picked = toggleDraftServer(one, 'a')
    expect(picked.serverIds).toEqual(['a'])
    expect(toggleDraftServer(picked, 'b').serverIds).toEqual(['b'])
    expect(toggleDraftServer(picked, 'a').serverIds).toEqual([])
    const chosen = { ...EMPTY_PLACEMENT_DRAFT, placement: 'chosen' as const }
    const two = toggleDraftServer(toggleDraftServer(chosen, 'a'), 'b')
    expect(two.serverIds).toEqual(['a', 'b'])
    expect(toggleDraftServer(two, 'a').serverIds).toEqual(['b'])
    const all = { ...EMPTY_PLACEMENT_DRAFT, placement: 'all' as const, datacenterId: 'd1' }
    const left = toggleDraftServer(all, 'a')
    expect(left.exceptServerIds).toEqual(['a'])
    expect(toggleDraftServer(left, 'a').exceptServerIds).toEqual([])
  })
  it('says whether a server runs it in the draft', () => {
    const all = { ...EMPTY_PLACEMENT_DRAFT, placement: 'all' as const, exceptServerIds: ['a'] }
    expect(draftRunsOn(all, 'a')).toBe(false)
    expect(draftRunsOn(all, 'b')).toBe(true)
    expect(draftRunsOn({ ...EMPTY_PLACEMENT_DRAFT, serverIds: ['a'] }, 'a')).toBe(true)
  })
})

describe('server choices and counts', () => {
  const servers = [
    server('b', { name: 'B', dcs: ['d1'] }),
    server('a', { name: 'A', dcs: ['d1'] }),
    server('n', { name: 'Never', dcs: ['d1'], carry: false }),
    server('o', { name: 'Other', dcs: ['d2'] }),
  ]
  it('lists the datacenter for an all-servers tunnel, never-carry servers last', () => {
    const all = { ...EMPTY_PLACEMENT_DRAFT, placement: 'all' as const, datacenterId: 'd1' }
    expect(serverChoices(all, servers).map((s) => s.id)).toEqual(['a', 'b', 'n'])
  })
  it('lists every server for one and chosen', () => {
    expect(serverChoices(EMPTY_PLACEMENT_DRAFT, servers)).toHaveLength(4)
  })
  it('counts the servers that would run it', () => {
    const all = { ...EMPTY_PLACEMENT_DRAFT, placement: 'all' as const, datacenterId: 'd1' }
    expect(draftCarryCount(all, servers)).toBe(2)
    expect(draftCarryCount({ ...all, exceptServerIds: ['a'] }, servers)).toBe(1)
    const chosen = { ...EMPTY_PLACEMENT_DRAFT, placement: 'chosen' as const, serverIds: ['a', 'n'] }
    expect(draftCarryCount(chosen, servers)).toBe(1)
  })
  it('warns calmly about none and one', () => {
    expect(carryCountNote(0)).toMatch(/nothing can reach/)
    expect(carryCountNote(1)).toMatch(/Only one server/)
    expect(carryCountNote(2)).toBeNull()
  })
})

describe('placementBody', () => {
  const servers = [server('a', { dcs: ['d1'] }), server('b', { dcs: ['d1'] })]
  it('needs exactly one server for one', () => {
    expect(placementBody(EMPTY_PLACEMENT_DRAFT, servers)).toEqual({
      ok: false,
      problem: 'Choose the server.',
    })
    expect(placementBody({ ...EMPTY_PLACEMENT_DRAFT, serverIds: ['a'] }, servers)).toEqual({
      ok: true,
      body: { placement: 'one', serverIds: ['a'] },
    })
  })
  it('needs at least one server for chosen', () => {
    const chosen = { ...EMPTY_PLACEMENT_DRAFT, placement: 'chosen' as const }
    expect(placementBody(chosen, servers).ok).toBe(false)
    expect(placementBody({ ...chosen, serverIds: ['a', 'b'] }, servers)).toEqual({
      ok: true,
      body: { placement: 'chosen', serverIds: ['a', 'b'] },
    })
  })
  it('needs a datacenter for all and drops left-out servers that moved away', () => {
    const all = { ...EMPTY_PLACEMENT_DRAFT, placement: 'all' as const }
    expect(placementBody(all, servers)).toEqual({ ok: false, problem: 'Choose the datacenter.' })
    expect(
      placementBody({ ...all, datacenterId: 'd1', exceptServerIds: ['a', 'gone'] }, servers)
    ).toEqual({
      ok: true,
      body: { placement: 'all', datacenterId: 'd1', exceptServerIds: ['a'] },
    })
  })
})

describe('which tunnels run on a server', () => {
  it('lists the tunnels that want a connector there, not the ones that skip it', () => {
    const a = tunnel({ name: 'a', portals: [portal({ serverId: 's1' })] })
    const b = tunnel({ name: 'b', portals: [portal({ serverId: 's1', wanted: 'skip' })] })
    const c = tunnel({ name: 'c', portals: [portal({ serverId: 's2' })] })
    expect(tunnelsRunningOn([a, b, c], 's1').map((t) => t.name)).toEqual(['a'])
    expect(tunnelsRunningOn([a, b, c], 's3')).toEqual([])
  })
})

describe('the tunnel badge', () => {
  const run = (reported: TunnelPortal['reported'], wanted: TunnelPortal['wanted'] = 'run') =>
    portal({ reported, wanted })

  it('says Running once one wanted server is connected, whatever the panel status says', () => {
    const connected = tunnelHealth({ status: 'pending', portals: [run('connected'), run('down')] })
    expect(connected).toEqual({ label: 'Running', tone: 'ok' })
    expect(tunnelHealth({ status: 'attention', portals: [run('connected')] }).label).toBe('Running')
  })
  it('says Setting Up while no server has reported yet', () => {
    expect(tunnelHealth({ status: 'pending', portals: [run('unknown'), run('unknown')] })).toEqual({
      label: 'Setting Up',
      tone: 'pending',
    })
  })
  it('says Needs Attention when every wanted server is down or in error, or none is wanted', () => {
    expect(tunnelHealth({ status: 'pending', portals: [run('down')] }).label).toBe(
      'Needs Attention'
    )
    expect(tunnelHealth({ status: 'pending', portals: [run('unknown'), run('error')] }).tone).toBe(
      'danger'
    )
    expect(tunnelHealth({ status: 'attention', portals: [run('unknown')] }).label).toBe(
      'Needs Attention'
    )
    expect(tunnelHealth({ status: 'pending', portals: [] }).label).toBe('Needs Attention')
    expect(tunnelHealth({ status: 'pending', portals: [run('connected', 'skip')] }).label).toBe(
      'Needs Attention'
    )
  })
  it('says Removing whatever the servers report', () => {
    expect(tunnelHealth({ status: 'removing', portals: [run('connected')] })).toEqual({
      label: 'Removing',
      tone: 'pending',
    })
  })
})

describe('words for status', () => {
  it('names hostname states', () => {
    expect(hostnameStatusLabel('live')).toBe('Live')
    expect(hostnameStatusLabel('pending')).toBe('Setting Up')
    expect(hostnameStatusLabel('removing')).toBe('Removing')
    expect(hostnameStatusLabel('attention')).toBe('Needs Attention')
    expect(hostnameStatusTone('live')).toBe('ok')
    expect(hostnameStatusTone('removing')).toBe('pending')
    expect(hostnameStatusTone('attention')).toBe('danger')
  })
  it('describes a server connector', () => {
    expect(portalState(portal({ wanted: 'skip' }))).toEqual({ label: 'Left Out', tone: 'muted' })
    expect(portalState(portal({ reported: 'connected' })).label).toBe('Connected')
    expect(portalState(portal({ reported: 'down' })).label).toBe('Not Connected')
    expect(portalState(portal({ reported: 'error' })).label).toBe('Error')
    expect(portalState(portal({ reported: 'unknown' })).label).toBe('Not Reported Yet')
  })
  it('reads versions and dates defensively', () => {
    expect(connectorLine({ connectorVersion: '2026.5.2' })).toBe('Connector 2026.5.2')
    expect(connectorLine({ connectorVersion: null })).toMatch(/not reported/)
    expect(seenLabel(null)).toBe('Not seen yet')
    expect(seenLabel('nope')).toBe('Not seen yet')
    expect(seenLabel('2026-10-28T12:00:00Z')).toMatch(/^Seen /)
  })
  it('summarises where a tunnel runs', () => {
    expect(placementSummary({ placement: 'all', carryingServerIds: ['a', 'b'] }, 'Tokyo')).toBe(
      'All servers in Tokyo (2 servers now)'
    )
    expect(placementSummary({ placement: 'all', carryingServerIds: [] }, null)).toBe(
      'All servers (0 servers now)'
    )
    expect(placementSummary({ placement: 'one', carryingServerIds: ['a'] }, null)).toBe(
      'One server (1 server now)'
    )
    expect(placementSummary({ placement: 'chosen', carryingServerIds: ['a', 'b'] }, null)).toBe(
      'Chosen servers (2 servers now)'
    )
  })
})

describe('Cloudflare accounts that can run tunnels', () => {
  const badge = (status: string, tunnels: boolean) => ({
    id: 'b',
    status,
    capabilities: { tunnels, dns: [], certificates: [] },
  })
  const carrier = (id: string, badges: unknown[]) => ({ id, badges }) as unknown as TunnelCarrier
  it('keeps accounts with an active token that manages tunnels', () => {
    const list = [
      carrier('ok', [badge('active', true)]),
      carrier('attention', [badge('attention', true)]),
      carrier('dns-only', [badge('active', false)]),
      carrier('none', []),
    ]
    expect(tunnelCapableCarriers(list).map((c) => c.id)).toEqual(['ok'])
  })
})

describe('hostnames', () => {
  it('accepts ordinary hostnames, in any case', () => {
    expect(hostnameProblem('app.example.com')).toBeNull()
    expect(hostnameProblem('  App.Example.COM ')).toBeNull()
    expect(hostnameProblem('a-b.c1.example.co.uk')).toBeNull()
    expect(normalizeHostname('  App.Example.COM ')).toBe('app.example.com')
  })
  it('asks for what is missing in plain words', () => {
    expect(hostnameProblem('')).toMatch(/Type the hostname/)
    expect(hostnameProblem('a b.com')).toMatch(/no spaces/)
    expect(hostnameProblem('https://app.example.com')).toMatch(/without https/)
    expect(hostnameProblem('app.example.com:8443')).toMatch(/without https/)
    expect(hostnameProblem('*.example.com')).toMatch(/wildcard/)
    expect(hostnameProblem('localhost')).toMatch(/does not look like/)
    expect(hostnameProblem('-bad.example.com')).toMatch(/does not look like/)
    expect(hostnameProblem(`${'a'.repeat(64)}.example.com`)).toMatch(/does not look like/)
    expect(hostnameProblem(`${'a.'.repeat(130)}com`)).toMatch(/too long/)
  })
  it('says what happened to the DNS name', () => {
    expect(dnsOutcome('created')).toMatch(/created/)
    expect(dnsOutcome('none')).toMatch(/no zone for this hostname/)
    expect(dnsOutcome('none')).toMatch(/Added to the tunnel/)
  })
})

describe('verifyOriginSummary', () => {
  it('says Off, On and Waiting in plain words, and names what it waits for', () => {
    expect(verifyOriginSummary({ enabled: false, active: false, pendingNames: [] }).label).toBe(
      'Off'
    )
    expect(verifyOriginSummary({ enabled: true, active: true, pendingNames: [] })).toMatchObject({
      label: 'On',
      tone: 'ok',
    })
    const one = verifyOriginSummary({
      enabled: true,
      active: false,
      pendingNames: ['a.example.com'],
    })
    expect(one.label).toBe('Waiting')
    expect(one.line).toContain('a.example.com')
    expect(one.line).toContain('it has a site and a certificate')
    const two = verifyOriginSummary({
      enabled: true,
      active: false,
      pendingNames: ['a.example.com', 'b.example.com'],
    })
    expect(two.line).toContain('a.example.com, b.example.com')
    expect(two.line).toContain('they have sites and certificates')
    expect(verifyOriginSummary({ enabled: true, active: false, pendingNames: [] }).line).toContain(
      'Add a hostname'
    )
  })
})

describe('issuedCertificateNote', () => {
  it('explains a replaced certificate, a renewal coming up, or says nothing', () => {
    expect(issuedCertificateNote({ retired: true, renewalDue: true })).toContain(
      'revoked once no site uses it'
    )
    expect(issuedCertificateNote({ retired: false, renewalDue: true })).toContain('renewed soon')
    expect(issuedCertificateNote({ retired: false, renewalDue: false })).toBe('')
  })
})
