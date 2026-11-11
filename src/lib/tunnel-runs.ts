/**
 * Pure rules and copy for the Tunnels screen: where a tunnel runs, how a
 * server's connector is described, and which hostnames are fine to send.
 * The transport lives in `instance-api.ts`.
 */
import type {
  OrgServerRecord,
  TunnelCarrier,
  TunnelHostnameRecord,
  OriginCertificateRecord,
  TunnelPlacement,
  TunnelPlacementBody,
  TunnelPortal,
  TunnelRecord,
  TunnelRunTokenRotation,
  VerifyOriginState,
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
      'The tunnel runs on every server of one datacenter network, and on any server added to it later. You can leave some out.',
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
  if (!draft.datacenterId) return { ok: false, problem: 'Choose the datacenter network.' }
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

/** The tunnels that currently want a connector on this server. */
export function tunnelsRunningOn(
  tunnels: readonly Pick<TunnelRecord, 'name' | 'portals'>[],
  serverId: string
): Pick<TunnelRecord, 'name' | 'portals'>[] {
  return tunnels.filter((tunnel) =>
    tunnel.portals.some((portal) => portal.serverId === serverId && portal.wanted === 'run')
  )
}

/**
 * The badge on a tunnel card, worked out from what the servers report. The
 * panel's own status stays "pending" after creation, so it cannot say whether
 * the tunnel works: one connected server means Running; only silence or no
 * report yet means Setting Up; with none connected, a wanted server that is
 * down or in error, no wanted server at all, or an attention flag from the
 * panel, means Needs Attention.
 */
export function tunnelHealth(tunnel: Pick<TunnelRecord, 'status' | 'portals'>): {
  label: string
  tone: BadgeTone
} {
  if (tunnel.status === 'removing') return { label: 'Removing', tone: 'pending' }
  const wanted = tunnel.portals.filter((portal) => portal.wanted === 'run')
  if (wanted.some((portal) => portal.reported === 'connected')) {
    return { label: 'Running', tone: 'ok' }
  }
  if (
    tunnel.status === 'attention' ||
    wanted.length === 0 ||
    wanted.some((portal) => portal.reported === 'down' || portal.reported === 'error')
  ) {
    return { label: 'Needs Attention', tone: 'danger' }
  }
  return { label: 'Setting Up', tone: 'pending' }
}

/** What an older panel, which sends no verified-connection field, means: off. */
export const VERIFY_ORIGIN_OFF: VerifyOriginState = {
  enabled: false,
  active: false,
  pendingNames: [],
}

/**
 * The verified connection, as a badge and a sentence. "Waiting" is the safe
 * state: the choice is made but a name has no site or certificate yet, so the
 * connector keeps skipping verification for the whole tunnel until it is
 * applied again.
 */
export function verifyOriginSummary(given?: VerifyOriginState | null): {
  label: string
  tone: BadgeTone
  line: string
} {
  const state = given ?? VERIFY_ORIGIN_OFF
  if (!state.enabled) {
    return {
      label: 'Off',
      tone: 'muted',
      line: 'The connector does not check the certificate of your web server.',
    }
  }
  if (state.active) {
    return {
      label: 'On',
      tone: 'ok',
      line: 'The connector checks the certificate of your web server for every hostname.',
    }
  }
  const count = state.pendingNames.length
  const names = state.pendingNames.join(', ')
  const until = count === 1 ? 'it has a site and a certificate' : 'they have sites and certificates'
  const line =
    count === 0
      ? 'Add a hostname to start checking the certificate of your web server.'
      : `Waiting for ${names}. Until ${until}, the connector does not check the certificate for any hostname of this tunnel.`
  return { label: 'Waiting', tone: 'pending', line }
}

/** The sentence under an origin certificate TurboPanel issued: replaced, renewing soon, or nothing to say. */
export function issuedCertificateNote(
  certificate: Pick<OriginCertificateRecord, 'retired' | 'renewalDue'> &
    Partial<Pick<OriginCertificateRecord, 'inUse'>>
): string {
  if (certificate.retired) {
    return certificate.inUse
      ? ' Not needed any more. It is revoked once no site uses it.'
      : ' Not needed any more. It is revoked soon, or delete it from the Certificates library to revoke it now.'
  }
  if (certificate.renewalDue) return ' It is renewed soon.'
  return ''
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
    const where = datacenterName ? ' in ' + datacenterName : ''
    return `All servers${where} (${servers} now)`
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

/** One existing DNS record as shown before it is replaced: `A 192.0.2.10 (proxied)`. */
export function dnsRecordLine(
  record: Readonly<{ type: string; content: string; proxied: boolean }>
): string {
  return `${record.type} ${record.content}${record.proxied ? ' (proxied)' : ''}`
}

/** After a replacement failed partway: what to do about the records already removed. */
export const DNS_REPLACE_INCOMPLETE_NOTE =
  'Add them back at your DNS provider if the name still needs them, then try adding the hostname again.'

/** Past the replace limit the records are only listed: what to do instead. */
export const DNS_TOO_MANY_RECORDS_NOTE =
  'That is more than 10 records, too many to replace here. Remove them at your DNS provider, then add the hostname again.'

/** What replacing the records does, said before the person agrees. */
export const DNS_REPLACE_NOTE =
  'Replacing points the name at this tunnel. Visitors stop reaching whatever these records point at now, and removing the hostname later does not bring them back. Mail and text records on the name are kept.'

/** Asked before a run-token rotation starts (owner-approved wording). */
export const ROTATE_CONFIRM =
  'Give this tunnel a new run token? Servers move one at a time, about 10 minutes apart. At the end every connector reconnects briefly.'

/** Added when only one server runs the tunnel: there is no other server to carry visitors meanwhile. */
export const ROTATE_SINGLE_SERVER_WARNING =
  'Only one server runs this tunnel, so visitors lose it for a few seconds while its connector restarts.'

/** A rotation that is still moving on its own (not done, not stopped). */
export function rotationRunning(rotation: TunnelRunTokenRotation | null | undefined): boolean {
  return (
    rotation?.phase === 'starting' ||
    rotation?.phase === 'rolling' ||
    rotation?.phase === 'finishing'
  )
}

/** Server ids in a control-plane sentence replaced by the server names the screen knows. */
export function withServerNames(text: string, names: ReadonlyMap<string, string>): string {
  let out = text
  for (const [id, name] of names) out = out.split(id).join(name)
  return out
}

function nameOf(id: string, names: ReadonlyMap<string, string>): string {
  return names.get(id) ?? id.slice(0, 8)
}

/**
 * One line on where a running rotation is, for example
 * `Rotating run token: juliet moved, panvm next (about 10 min)`.
 */
export function rotationProgressLine(
  rotation: TunnelRunTokenRotation,
  names: ReadonlyMap<string, string>
): string {
  const head = 'Rotating run token'
  if (rotation.phase === 'starting') return `${head}: asking for a new token`
  if (rotation.phase === 'finishing') {
    return `${head}: dropping old connections, connectors reconnect briefly`
  }
  const parts: string[] = []
  if (rotation.movedServerIds.length > 0) {
    const done = rotation.movedServerIds.filter((id) => id !== rotation.currentServerId)
    if (done.length > 0) parts.push(`${done.map((id) => nameOf(id, names)).join(', ')} moved`)
  }
  if (rotation.currentServerId) {
    parts.push(`${nameOf(rotation.currentServerId, names)} moving now`)
  } else if (rotation.pendingServerIds[0]) {
    parts.push(`${nameOf(rotation.pendingServerIds[0], names)} next (about 10 min)`)
  }
  return parts.length > 0 ? `${head}: ${parts.join(', ')}` : head
}

/** Why the rotation stopped, with server names, or null when it did not stop. */
export function rotationStoppedLine(
  rotation: TunnelRunTokenRotation | null | undefined,
  names: ReadonlyMap<string, string>
): string | null {
  if (rotation?.phase !== 'stopped') return null
  const reason = rotation.stoppedReason ? withServerNames(rotation.stoppedReason, names) : null
  return reason ? `Run token rotation stopped: ${reason}` : 'Run token rotation stopped'
}

/**
 * Why Rotate Run Token cannot be pressed now, in the screen's words, or null.
 * A rotation already under way is shown as progress, not as a reason.
 */
export function rotationBlockedReason(
  tunnel: Pick<TunnelRecord, 'runTokenRotationBlock' | 'status'>,
  names: ReadonlyMap<string, string>
): string | null {
  if (tunnel.status === 'removing') return 'This tunnel is being removed.'
  const block = tunnel.runTokenRotationBlock
  if (!block || block.code === 'rotation_in_progress') return null
  const ids = block.serverIds ?? []
  const servers = ids.map((id) => nameOf(id, names)).join(', ')
  const one = ids.length === 1
  switch (block.code) {
    case 'tunnel_daemon_too_old':
      return `Update the daemon on ${servers} first: ${one ? 'it cannot move its connector' : 'they cannot move their connectors'} to a new run token.`
    case 'server_not_ready':
      return `${servers} ${one ? 'cannot' : 'cannot all'} be reached right now. Try again once ${one ? 'it is' : 'they are'} back.`
    case 'tunnel_not_ready':
      return 'This tunnel does not exist at the provider yet.'
    case 'tunnel_removing':
      return 'This tunnel is being removed.'
    default:
      return withServerNames(block.message, names)
  }
}

/**
 * Blocks that do not stop a stopped rotation from being resumed: the control
 * plane waits for an unreachable server itself once a new secret was chosen.
 */
const RESUMABLE_BLOCKS = new Set(['server_not_ready', 'rotation_in_progress'])

/** Can a stopped rotation be resumed from the screen now? Pure. */
export function rotationResumable(
  tunnel: Pick<TunnelRecord, 'runTokenRotation' | 'runTokenRotationBlock' | 'status'>
): boolean {
  if (tunnel.runTokenRotation?.phase !== 'stopped' || tunnel.status === 'removing') return false
  const block = tunnel.runTokenRotationBlock
  return !block || RESUMABLE_BLOCKS.has(block.code)
}

/** What the stopped notice says next: the control plane retries on its own, or the person resumes. */
export function rotationStoppedHint(
  rotation: TunnelRunTokenRotation,
  names: ReadonlyMap<string, string>
): string {
  const old = (rotation.oldTokenServerIds ?? []).map((id) => nameOf(id, names))
  const verb = old.length === 1 ? 'keeps' : 'keep'
  const stale =
    old.length > 0
      ? ` Until then ${old.join(', ')} ${verb} the old token, which cannot reconnect after a restart.`
      : ''
  return rotation.resumesOnItsOwn
    ? `It tries again by itself in a few minutes, or resume it now.${stale}`
    : `Resuming carries on from where it stopped, with the token already issued.${stale}`
}
