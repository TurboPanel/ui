/**
 * Pure rules and copy for the Tunnels screen: where a tunnel runs, how a
 * server's connector is described, and which hostnames are fine to send.
 * The transport lives in `instance-api.ts`.
 */
import type {
  OrgServerRecord,
  TunnelCarrier,
  TunnelHostnameRecord,
  TunnelPlacement,
  TunnelPlacementBody,
  TunnelPortal,
  TunnelRecord,
} from '@/lib/instance-api'
import type { BadgeTone } from '@/components/ui/badge'

export const TUNNEL_NAME_MAX = 64

export const PLACEMENT_OPTIONS: readonly Readonly<{
  value: TunnelPlacement
  label: string
  explanation: string
}>[] = [
  {
    value: 'one',
    label: 'One Server',
    explanation: 'The tunnel runs on one server. If that server goes down, the tunnel goes down.',
  },
  {
    value: 'chosen',
    label: 'Chosen Servers',
    explanation:
      'The tunnel runs on the servers you pick. New servers are not added by themselves.',
  },
  {
    value: 'all',
    label: 'All Servers',
    explanation:
      'The tunnel runs on every server of one datacenter, and on any server added to it later. You can leave some out.',
  },
]

/** What a person has chosen so far, before it is sent. */
export type PlacementDraft = {
  placement: TunnelPlacement
  serverIds: string[]
  exceptServerIds: string[]
  datacenterId: string | null
}

export const EMPTY_PLACEMENT_DRAFT: PlacementDraft = {
  placement: 'one',
  serverIds: [],
  exceptServerIds: [],
  datacenterId: null,
}

/** `options.tunnels.carry === false`: the owner marked this server as never running tunnels. */
export function serverNeverCarries(server: Pick<OrgServerRecord, 'options'>): boolean {
  const tunnels = server.options?.tunnels
  if (typeof tunnels !== 'object' || tunnels === null) return false
  return (tunnels as { carry?: unknown }).carry === false
}

export function serverInDatacenter(
  server: Pick<OrgServerRecord, 'datacenters'>,
  datacenterId: string | null
): boolean {
  return datacenterId !== null && server.datacenters.some((d) => d.id === datacenterId)
}

/** The draft that matches a tunnel as it is now, read from its connectors. */
export function draftFromTunnel(tunnel: TunnelRecord): PlacementDraft {
  const wanted = (value: string) =>
    tunnel.portals.filter((p) => p.wanted === value).map((p) => p.serverId)
  if (tunnel.placement === 'all') {
    return {
      placement: 'all',
      serverIds: [],
      exceptServerIds: wanted('skip'),
      datacenterId: tunnel.datacenterId,
    }
  }
  return {
    placement: tunnel.placement,
    serverIds: wanted('run'),
    exceptServerIds: [],
    datacenterId: tunnel.datacenterId,
  }
}

/** Switching the kind keeps what still applies and drops what does not. */
export function withPlacementKind(draft: PlacementDraft, kind: TunnelPlacement): PlacementDraft {
  if (kind === draft.placement) return draft
  if (kind === 'all') return { ...draft, placement: kind, serverIds: [], exceptServerIds: [] }
  const serverIds = kind === 'one' ? draft.serverIds.slice(0, 1) : draft.serverIds
  return { ...draft, placement: kind, serverIds, exceptServerIds: [] }
}

/** Tick or untick a server for the draft's kind. `one` holds a single server. */
export function toggleDraftServer(draft: PlacementDraft, serverId: string): PlacementDraft {
  if (draft.placement === 'all') {
    const out = draft.exceptServerIds.includes(serverId)
    return {
      ...draft,
      exceptServerIds: out
        ? draft.exceptServerIds.filter((id) => id !== serverId)
        : [...draft.exceptServerIds, serverId],
    }
  }
  if (draft.placement === 'one') {
    return { ...draft, serverIds: draft.serverIds.includes(serverId) ? [] : [serverId] }
  }
  return {
    ...draft,
    serverIds: draft.serverIds.includes(serverId)
      ? draft.serverIds.filter((id) => id !== serverId)
      : [...draft.serverIds, serverId],
  }
}

/** Whether a server is ticked ("runs it") in the draft. */
export function draftRunsOn(draft: PlacementDraft, serverId: string): boolean {
  return draft.placement === 'all'
    ? !draft.exceptServerIds.includes(serverId)
    : draft.serverIds.includes(serverId)
}

/** Servers the draft would show as choices, never-carry servers last. */
export function serverChoices(
  draft: PlacementDraft,
  servers: readonly OrgServerRecord[]
): OrgServerRecord[] {
  const pool =
    draft.placement === 'all'
      ? servers.filter((s) => serverInDatacenter(s, draft.datacenterId))
      : [...servers]
  return pool.sort((a, b) => {
    const never = Number(serverNeverCarries(a)) - Number(serverNeverCarries(b))
    return never !== 0 ? never : serverLabel(a).localeCompare(serverLabel(b))
  })
}

export function serverLabel(server: Pick<OrgServerRecord, 'id' | 'name' | 'hostname'>): string {
  return server.name?.trim() || server.hostname?.trim() || server.id.slice(0, 8)
}

/** How many servers the draft would run a connector on. */
export function draftCarryCount(
  draft: PlacementDraft,
  servers: readonly OrgServerRecord[]
): number {
  if (draft.placement !== 'all') {
    const never = new Set(servers.filter(serverNeverCarries).map((s) => s.id))
    return draft.serverIds.filter((id) => !never.has(id)).length
  }
  return servers.filter(
    (s) =>
      serverInDatacenter(s, draft.datacenterId) &&
      !serverNeverCarries(s) &&
      !draft.exceptServerIds.includes(s.id)
  ).length
}

/** The body to send, or the one thing still missing, in plain words. */
export function placementBody(
  draft: PlacementDraft,
  servers: readonly OrgServerRecord[]
): { ok: true; body: TunnelPlacementBody } | { ok: false; problem: string } {
  if (draft.placement === 'one') {
    if (draft.serverIds.length !== 1) return { ok: false, problem: 'Choose the server.' }
    return { ok: true, body: { placement: 'one', serverIds: draft.serverIds } }
  }
  if (draft.placement === 'chosen') {
    if (draft.serverIds.length === 0) return { ok: false, problem: 'Choose at least one server.' }
    return { ok: true, body: { placement: 'chosen', serverIds: draft.serverIds } }
  }
  if (!draft.datacenterId) return { ok: false, problem: 'Choose the datacenter.' }
  // Servers that left the datacenter since the page loaded are not sent as exceptions.
  const inside = new Set(
    servers.filter((s) => serverInDatacenter(s, draft.datacenterId)).map((s) => s.id)
  )
  return {
    ok: true,
    body: {
      placement: 'all',
      datacenterId: draft.datacenterId,
      exceptServerIds: draft.exceptServerIds.filter((id) => inside.has(id)),
    },
  }
}

/** One calm line saying what happens at this server count. */
export function carryCountNote(count: number): string | null {
  if (count === 0) return 'No server would run this tunnel yet, so nothing can reach it.'
  if (count === 1) {
    return 'Only one server would run this tunnel. If it goes down, the tunnel goes down. Two or more keeps it up.'
  }
  return null
}

export function tunnelStatusLabel(status: string): string {
  switch (status) {
    case 'active':
      return 'Ready'
    case 'pending':
      return 'Setting Up'
    case 'removing':
      return 'Removing'
    default:
      return 'Needs Attention'
  }
}

export function tunnelStatusTone(status: string): BadgeTone {
  switch (status) {
    case 'active':
      return 'ok'
    case 'pending':
    case 'removing':
      return 'pending'
    default:
      return 'danger'
  }
}

/** A server's connector, as a badge: what it last reported, or that it is left out. */
export function portalState(portal: Pick<TunnelPortal, 'wanted' | 'reported'>): {
  label: string
  tone: BadgeTone
} {
  if (portal.wanted === 'skip') return { label: 'Left Out', tone: 'muted' }
  switch (portal.reported) {
    case 'connected':
      return { label: 'Connected', tone: 'ok' }
    case 'down':
      return { label: 'Not Connected', tone: 'danger' }
    case 'error':
      return { label: 'Error', tone: 'danger' }
    default:
      return { label: 'Not Reported Yet', tone: 'pending' }
  }
}

/** "Connector 2026.5.2", or a plain note before the server has reported one. */
export function connectorLine(portal: Pick<TunnelPortal, 'connectorVersion'>): string {
  return portal.connectorVersion
    ? `Connector ${portal.connectorVersion}`
    : 'Connector version not reported yet'
}

/** "Seen 3 Nov 2026, 14:05", or that it never was. */
export function seenLabel(iso: string | null): string {
  if (!iso) return 'Not seen yet'
  const when = new Date(iso)
  if (Number.isNaN(when.getTime())) return 'Not seen yet'
  return `Seen ${when.toLocaleString()}`
}

/** Where a tunnel runs, in a sentence, for the card's header. */
export function placementSummary(
  tunnel: Pick<TunnelRecord, 'placement' | 'carryingServerIds'>,
  datacenterName: string | null
): string {
  const count = tunnel.carryingServerIds.length
  const servers = count === 1 ? '1 server' : `${count} servers`
  if (tunnel.placement === 'all') {
    return `All servers${datacenterName ? ` in ${datacenterName}` : ''} (${servers} now)`
  }
  if (tunnel.placement === 'one') return `One server (${servers} now)`
  return `Chosen servers (${servers} now)`
}

/** Cloudflare accounts that have an active API Token able to manage tunnels. */
export function tunnelCapableCarriers(carriers: readonly TunnelCarrier[]): TunnelCarrier[] {
  return carriers.filter((c) =>
    c.badges.some((b) => b.status === 'active' && b.capabilities.tunnels)
  )
}

const LABEL = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/

/**
 * A hostname is lowercased and trimmed before it is sent. It needs at least two
 * labels; a wildcard, a URL or a port is not a hostname. Null means it is fine.
 */
export function hostnameProblem(raw: string): string | null {
  const name = raw.trim().toLowerCase()
  if (name.length === 0) return 'Type the hostname, for example app.example.com.'
  if (/\s/.test(name)) return 'A hostname has no spaces.'
  if (name.includes('/') || name.includes(':')) {
    return 'Type only the hostname, without https:// or a port.'
  }
  if (name.includes('*')) return 'A wildcard hostname is not supported yet.'
  if (name.length > 253) return 'That hostname is too long.'
  const labels = name.split('.')
  if (labels.length < 2 || !labels.every((l) => LABEL.test(l))) {
    return 'That does not look like a hostname, for example app.example.com.'
  }
  return null
}

export function normalizeHostname(raw: string): string {
  return raw.trim().toLowerCase()
}

/** What happened to the DNS name for a hostname, in words. */
export function dnsOutcome(dns: TunnelHostnameRecord['dns']): string {
  return dns === 'created'
    ? 'DNS name created in Cloudflare.'
    : 'Added to the tunnel, but no DNS name was made: Cloudflare shows no zone for this hostname under this account. Create the DNS record yourself, pointing it at this tunnel.'
}

export function hostnameStatusLabel(status: string): string {
  switch (status) {
    case 'live':
      return 'Live'
    case 'pending':
      return 'Setting Up'
    case 'removing':
      return 'Removing'
    default:
      return 'Needs Attention'
  }
}

export function hostnameStatusTone(status: string): BadgeTone {
  switch (status) {
    case 'live':
      return 'ok'
    case 'pending':
    case 'removing':
      return 'pending'
    default:
      return 'danger'
  }
}
