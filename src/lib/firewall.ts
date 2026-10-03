import { ipVersionOf, isValidCidr } from '@/lib/cidr'
import { formatLocalDateTime } from '@/lib/format-datetime'
import type {
  FirewallInputDefault,
  FirewallIpv6,
  FirewallMode,
  FirewallPreview,
  FirewallPolicy,
  FirewallPolicyUpdate,
  FirewallPreviewStatus,
  FirewallRule,
  FirewallRuleAction,
  FirewallRuleBody,
  FirewallRuleProto,
  FirewallRuleScope,
  FirewallServerState,
  FirewallSourceKind,
} from '@/lib/instance-api'
import { TURBOFABRIC_PRODUCT_NAME } from '@/lib/platform-copy'

/** Matches the instance: at most this many rules per organization, and addresses per rule. */
export const FIREWALL_RULE_LIMIT = 200
export const FIREWALL_RULE_ADDRESS_LIMIT = 256
export const FIREWALL_LABEL_MAX = 48

/** A rule's label is also its comment on the host: letters, digits, space and `._:/-`. */
const LABEL_RE = /^[A-Za-z0-9 ._:/-]{1,48}$/
const PORT_RE = /^(\d{1,5})(?:-(\d{1,5}))?$/

export const FIREWALL_PREVIEW_BANNER = 'Preview only: nothing is applied to this server.'

// ---------------------------------------------------------------------------
// Words
// ---------------------------------------------------------------------------

export const FIREWALL_MODE_OPTIONS: readonly { value: FirewallMode; label: string }[] = [
  { value: 'observe', label: 'Observe' },
  { value: 'managed', label: 'Managed' },
  { value: 'off', label: 'Off' },
]

export function firewallModeLabel(mode: FirewallMode): string {
  const labels: Record<FirewallMode, string> = {
    observe: 'Observe',
    managed: 'Managed',
    off: 'Off',
  }
  return labels[mode]
}

/** What choosing a mode means, said before the choice is saved. */
export function firewallModeChoiceText(mode: FirewallMode): string {
  const text: Record<FirewallMode, string> = {
    observe:
      'Observe shows the firewall this server would get and applies nothing. Rule changes and reconnects refresh the preview.',
    managed:
      'Managed means you want this server to enforce its firewall. It is saved, but until enforcement is switched on at the control plane it behaves exactly like Observe: only a preview is sent.',
    off: 'Off leaves this server’s firewall alone. The control plane sends it nothing.',
  }
  return text[mode]
}

export const FIREWALL_ACTION_OPTIONS: readonly { value: FirewallRuleAction; label: string }[] = [
  { value: 'accept', label: 'Allow' },
  { value: 'drop', label: 'Block' },
  { value: 'reject', label: 'Block and tell the sender' },
]

export function firewallActionLabel(action: FirewallRuleAction): string {
  const labels: Record<FirewallRuleAction, string> = {
    accept: 'Allow',
    drop: 'Block',
    reject: 'Block and tell the sender',
  }
  return labels[action]
}

export const FIREWALL_PROTO_OPTIONS: readonly { value: FirewallRuleProto; label: string }[] = [
  { value: 'tcp', label: 'TCP' },
  { value: 'udp', label: 'UDP' },
  { value: 'any', label: 'Any protocol' },
]

export function firewallProtoLabel(proto: FirewallRuleProto): string {
  const labels: Record<FirewallRuleProto, string> = {
    tcp: 'TCP',
    udp: 'UDP',
    any: 'any protocol',
  }
  return labels[proto]
}

export const FIREWALL_SCOPE_OPTIONS: readonly { value: FirewallRuleScope; label: string }[] = [
  { value: 'host', label: 'The server’s own services' },
  { value: 'published', label: 'Ports published by containers' },
]

export const FIREWALL_SOURCE_OPTIONS: readonly { value: FirewallSourceKind; label: string }[] = [
  { value: 'any', label: 'Anyone' },
  { value: 'servers', label: 'My other TurboPanel servers' },
  { value: 'datacenter', label: 'This datacenter' },
  { value: 'fabric', label: `${TURBOFABRIC_PRODUCT_NAME} only` },
  { value: 'addresses', label: 'These addresses' },
]

const MAX_ADDRESSES_SHOWN = 3

function sourcePhrase(kind: FirewallSourceKind, addresses: readonly string[]): string {
  const phrases: Record<Exclude<FirewallSourceKind, 'addresses'>, string> = {
    any: 'anyone',
    servers: 'my other TurboPanel servers',
    datacenter: 'this server’s datacenter',
    fabric: `${TURBOFABRIC_PRODUCT_NAME} only`,
  }
  if (kind !== 'addresses') return phrases[kind]
  const shown = addresses.slice(0, MAX_ADDRESSES_SHOWN).join(', ')
  const more = addresses.length - MAX_ADDRESSES_SHOWN
  return more > 0 ? `${shown} and ${more} more` : shown
}

function portsPhrase(rule: Readonly<Pick<FirewallRule, 'ports'>>): string {
  if (rule.ports === null) return 'all ports'
  return rule.ports.includes('-') ? `ports ${rule.ports}` : `port ${rule.ports}`
}

/** One line in plain words, e.g. "Allow TCP port 5432 from my other TurboPanel servers". */
export function describeFirewallRule(
  rule: Readonly<
    Pick<FirewallRule, 'action' | 'proto' | 'ports' | 'sourceKind' | 'sourceAddresses' | 'scope'>
  >
): string {
  const proto = rule.proto === 'any' ? '' : `${firewallProtoLabel(rule.proto)} `
  const published = rule.scope === 'published' ? ' (container-published ports)' : ''
  const source = sourcePhrase(rule.sourceKind, rule.sourceAddresses)
  return `${firewallActionLabel(rule.action)} ${proto}${portsPhrase(rule)} from ${source}${published}`
}

// ---------------------------------------------------------------------------
// Rule form
// ---------------------------------------------------------------------------

export type FirewallRuleForm = {
  label: string
  scope: FirewallRuleScope
  action: FirewallRuleAction
  proto: FirewallRuleProto
  /** One port or an ascending range; empty means every port (a block only). */
  ports: string
  sourceKind: FirewallSourceKind
  /** IPs or CIDRs, separated by commas, spaces or new lines. */
  addresses: string
  /** One server, or null for every server. */
  serverId: string | null
  isEnabled: boolean
}

export type FirewallRuleFormField = 'label' | 'proto' | 'ports' | 'addresses'
export type FirewallRuleFormErrors = Partial<Record<FirewallRuleFormField, string>>

export const EMPTY_FIREWALL_RULE_FORM: Readonly<FirewallRuleForm> = {
  label: '',
  scope: 'host',
  action: 'accept',
  proto: 'tcp',
  ports: '',
  sourceKind: 'any',
  addresses: '',
  serverId: null,
  isEnabled: true,
}

export function firewallRuleFormFromRecord(rule: Readonly<FirewallRule>): FirewallRuleForm {
  return {
    label: rule.label,
    scope: rule.scope,
    action: rule.action,
    proto: rule.proto,
    ports: rule.ports ?? '',
    sourceKind: rule.sourceKind,
    addresses: rule.sourceAddresses.join('\n'),
    serverId: rule.serverId,
    isEnabled: rule.isEnabled,
  }
}

/** Why a ports value is wrong, or null when it is one port (1-65535) or an ascending range. */
export function firewallPortsError(raw: string): string | null {
  const match = PORT_RE.exec(raw.trim())
  if (!match) return 'Use one port like 5432, or a range like 5432-5440.'
  const first = Number(match[1])
  const last = match[2] === undefined ? first : Number(match[2])
  if (first < 1 || first > 65_535 || last < 1 || last > 65_535) {
    return 'Ports go from 1 to 65535.'
  }
  if (match[2] !== undefined && last <= first) {
    return 'A range must count up, like 5432-5440. For one port, write just the number.'
  }
  return null
}

function splitList(raw: string): string[] {
  return raw
    .split(/[\s,]+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
}

function isAddressOrCidr(token: string): boolean {
  return isValidCidr(token) || ipVersionOf(token) !== null
}

/** A bare IP becomes its single-address CIDR; anything else is kept as typed. */
function withPrefix(token: string): string {
  if (token.includes('/')) return token
  return ipVersionOf(token) === 6 ? `${token}/128` : `${token}/32`
}

export type AddressListResult = { ok: true; addresses: string[] } | { ok: false; error: string }

/** Parse a typed list of IPs and CIDRs: de-duplicated, at most {@link FIREWALL_RULE_ADDRESS_LIMIT}. */
export function parseAddressList(raw: string): AddressListResult {
  const tokens = [...new Set(splitList(raw))]
  if (tokens.length === 0) return { ok: false, error: 'Add at least one address or range.' }
  if (tokens.length > FIREWALL_RULE_ADDRESS_LIMIT) {
    return { ok: false, error: `A rule can name at most ${FIREWALL_RULE_ADDRESS_LIMIT} addresses.` }
  }
  const bad = tokens.find((token) => !isAddressOrCidr(token))
  if (bad !== undefined) {
    return { ok: false, error: `“${bad}” is not an IP address or a range like 10.0.0.0/24.` }
  }
  return { ok: true, addresses: tokens.map(withPrefix) }
}

function labelError(label: string): string | undefined {
  if (LABEL_RE.test(label)) return undefined
  return `Use 1 to ${FIREWALL_LABEL_MAX} letters, digits, spaces or . _ : / -`
}

function portsFieldError(form: Readonly<FirewallRuleForm>): string | undefined {
  const ports = form.ports.trim()
  if (form.proto === 'any') {
    return ports.length > 0
      ? 'Ports need TCP or UDP. Pick a protocol, or clear the ports.'
      : undefined
  }
  if (ports.length === 0) {
    return form.action === 'accept' ? 'An allow rule needs the port or range to open.' : undefined
  }
  return firewallPortsError(ports) ?? undefined
}

function addressesFieldError(form: Readonly<FirewallRuleForm>): string | undefined {
  if (form.sourceKind !== 'addresses') return undefined
  const parsed = parseAddressList(form.addresses)
  return parsed.ok ? undefined : parsed.error
}

export function firewallRuleFormErrors(form: Readonly<FirewallRuleForm>): FirewallRuleFormErrors {
  const errors: FirewallRuleFormErrors = {}
  const label = labelError(form.label.trim())
  if (label) errors.label = label
  const ports = portsFieldError(form)
  if (ports) errors.ports = ports
  const addresses = addressesFieldError(form)
  if (addresses) errors.addresses = addresses
  return errors
}

export type FirewallRuleFormResult =
  { ok: true; body: FirewallRuleBody } | { ok: false; errors: FirewallRuleFormErrors }

export function validateFirewallRuleForm(form: Readonly<FirewallRuleForm>): FirewallRuleFormResult {
  const errors = firewallRuleFormErrors(form)
  if (Object.keys(errors).length > 0) return { ok: false, errors }
  const ports = form.ports.trim()
  const body: FirewallRuleBody = {
    label: form.label.trim(),
    scope: form.scope,
    action: form.action,
    proto: form.proto,
    ports: ports.length > 0 ? ports : null,
    sourceKind: form.sourceKind,
    isEnabled: form.isEnabled,
    serverId: form.serverId,
  }
  if (form.sourceKind === 'addresses') {
    const parsed = parseAddressList(form.addresses)
    if (parsed.ok) body.sourceAddresses = parsed.addresses
  }
  return { ok: true, body }
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

const ERROR_COPY: Record<string, string> = {
  firewall_rule_limit: `An organization can have at most ${FIREWALL_RULE_LIMIT} rules. Delete one first.`,
  firewall_policy_invalid:
    'The firewall policy was not accepted. Check the SSH sources: use Anyone, or addresses and ranges like 203.0.113.0/24.',
  firewall_mode_invalid: 'That is not a firewall mode this server can use.',
}

/** Shown when a narrowed SSH list leaves out the address the admin is using right now. */
export const SSH_EXCLUDES_YOU_COPY =
  'Your current address is not in this list. If you save, you may lose SSH access to your servers from here.'

/** The API refused a narrowed SSH list that does not cover the caller (409 `firewall_ssh_excludes_you`). */
export function isSshExcludesYouError(err: unknown): boolean {
  return (
    err instanceof Error &&
    /HTTP 409(?!\d)/.test(err.message) &&
    err.message.includes('firewall_ssh_excludes_you')
  )
}

const FORBIDDEN_COPY = 'Only organization owners and managers can see or change the firewall.'

/** Plain words for an API refusal; the API's own explanation is kept for an invalid rule. */
export function firewallErrorMessage(err: unknown, fallback: string): string {
  const raw = err instanceof Error ? err.message : ''
  if (/HTTP 403(?!\d)/.test(raw)) return FORBIDDEN_COPY
  if (/HTTP 404(?!\d)/.test(raw)) return 'That no longer exists; it may have just been deleted.'
  const code = /HTTP \d+:\s*([a-z0-9_]+)/i.exec(raw)?.[1]
  if (code === 'firewall_rule_invalid') {
    const detail = raw.includes(' — ') ? raw.slice(raw.indexOf(' — ') + 3) : ''
    return detail.length > 0
      ? `The rule was not accepted: ${detail}`
      : 'The rule was not accepted. Check its fields.'
  }
  if (code && ERROR_COPY[code]) return ERROR_COPY[code]
  return raw.length > 0 ? raw : fallback
}

// ---------------------------------------------------------------------------
// Organization policy
// ---------------------------------------------------------------------------

export const FIREWALL_INPUT_DEFAULT_OPTIONS: readonly {
  value: FirewallInputDefault
  label: string
}[] = [
  { value: 'accept', label: 'Allow by default' },
  { value: 'drop', label: 'Block by default' },
]

export const FIREWALL_IPV6_OPTIONS: readonly { value: FirewallIpv6; label: string }[] = [
  { value: 'mirror', label: 'Same rules for IPv6' },
  { value: 'skip', label: 'Leave IPv6 alone' },
]

/** Only the fields that differ from what is stored, or null when nothing changed. */
export function firewallPolicyPatch(
  stored: Readonly<FirewallPolicy>,
  draft: Readonly<FirewallPolicy>
): FirewallPolicyUpdate | null {
  const patch: FirewallPolicyUpdate = {}
  if (draft.inputDefault !== stored.inputDefault) patch.inputDefault = draft.inputDefault
  if (draft.ipv6 !== stored.ipv6) patch.ipv6 = draft.ipv6
  if (draft.sshSources.join(',') !== stored.sshSources.join(',')) {
    patch.sshSources = draft.sshSources
  }
  return Object.keys(patch).length > 0 ? patch : null
}

export function formatSshSources(sources: readonly string[]): string {
  if (sources.length === 0 || sources.includes('any')) return 'Anyone'
  return sources.join(', ')
}

export type SshSourcesResult = { ok: true; sources: string[] } | { ok: false; error: string }

/** "Anyone" (or `any`), or a list of IPs and ranges; a bare IP becomes a single-address range. */
export function parseSshSources(raw: string): SshSourcesResult {
  const text = raw.trim().toLowerCase()
  if (text === 'any' || text === 'anyone') return { ok: true, sources: ['any'] }
  const parsed = parseAddressList(raw)
  if (!parsed.ok)
    return {
      ok: false,
      error: parsed.error.replace(
        'Add at least one address or range.',
        'Write Anyone, or list the addresses SSH may come from.'
      ),
    }
  return { ok: true, sources: parsed.addresses }
}

// ---------------------------------------------------------------------------
// Server state and preview
// ---------------------------------------------------------------------------

export function firewallPreviewBadge(status: FirewallPreviewStatus): {
  tone: 'ok' | 'pending' | 'danger'
  label: string
} {
  const badges: Record<
    FirewallPreviewStatus,
    { tone: 'ok' | 'pending' | 'danger'; label: string }
  > = {
    queued: { tone: 'pending', label: 'Waiting for the server' },
    previewed: { tone: 'ok', label: 'Previewed' },
    refused: { tone: 'danger', label: 'Would be refused' },
    failed: { tone: 'danger', label: 'Failed' },
  }
  return badges[status]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function stringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : []
}

export type FirewallPreviewFacts = {
  /** The mode the server itself reports it was sent; null before it answers. */
  hostMode: string | null
  applied: boolean | null
  warnings: string[]
  validation: { ok: boolean; errors: string[] } | null
  rendered: { v4: string; v6: string | null } | null
  summary: string | null
}

function validationOf(raw: unknown): FirewallPreviewFacts['validation'] {
  if (!isRecord(raw) || typeof raw.ok !== 'boolean') return null
  return { ok: raw.ok, errors: stringList(raw.errors) }
}

function renderedOf(raw: unknown): FirewallPreviewFacts['rendered'] {
  if (!isRecord(raw) || typeof raw.v4 !== 'string') return null
  return { v4: raw.v4, v6: typeof raw.v6 === 'string' ? raw.v6 : null }
}

/** What the host's own answer says, read defensively: the answer is opaque to the API. */
export function firewallPreviewFacts(
  preview: Readonly<FirewallPreview> | null
): FirewallPreviewFacts {
  const host = preview && isRecord(preview.host) ? preview.host : null
  return {
    hostMode: host && typeof host.mode === 'string' ? host.mode : null,
    applied: host && typeof host.applied === 'boolean' ? host.applied : null,
    warnings: stringList(host?.warnings),
    validation: validationOf(host?.validation),
    rendered: renderedOf(host?.rendered),
    summary: host && typeof host.summary === 'string' ? host.summary : null,
  }
}

/**
 * What the saved mode means right now, from facts only: the server's own answer
 * when there is one, otherwise what the API documents for the mode.
 */
export function firewallModeNote(
  mode: FirewallMode,
  facts: Readonly<Pick<FirewallPreviewFacts, 'hostMode'>>
): string {
  if (mode === 'off')
    return 'Off: the control plane sends this server nothing and leaves its firewall alone.'
  if (mode === 'observe')
    return 'Observe: shows the firewall this server would get and applies nothing.'
  if (facts.hostMode === 'observe') {
    return 'Managed is saved, but enforcement is not switched on at the control plane, so this server was only sent a preview.'
  }
  return 'Managed is saved. Until enforcement is switched on at the control plane it behaves like Observe: only a preview is sent.'
}

/** A line about applied or pending rulesets when there is one; null for a never-applied server. */
export function firewallStateNote(
  state: Readonly<
    Pick<FirewallServerState, 'state' | 'deadlineAt' | 'lastAppliedAt' | 'confirmedAt'>
  >
): string | null {
  if (state.state === 'pending') {
    const until = state.deadlineAt ? ` until ${formatLocalDateTime(state.deadlineAt)}` : ''
    return `A ruleset was applied and is waiting for confirmation${until}; it is undone automatically if it is not confirmed.`
  }
  if (state.state === 'rolled_back')
    return 'The last ruleset that was applied was rolled back automatically.'
  if (state.lastAppliedAt) {
    return `A ruleset was last applied ${formatLocalDateTime(state.lastAppliedAt)}.`
  }
  return null
}

export type FirewallBanner = { title: string; body: string | null; tone: 'info' | 'warning' }

/**
 * The strip at the top of a server's firewall tab. A server that never had a
 * ruleset applied gets the plain preview-only line; one that did (or has one
 * pending or rolled back) is told so, and never that "nothing" was applied.
 */
export function firewallBanner(
  state: Readonly<
    Pick<FirewallServerState, 'state' | 'deadlineAt' | 'lastAppliedAt' | 'confirmedAt'>
  >
): FirewallBanner {
  const note = firewallStateNote(state)
  if (note === null) return { title: FIREWALL_PREVIEW_BANNER, body: null, tone: 'info' }
  return {
    title: 'This screen only previews; it does not apply rules.',
    body: note,
    tone: 'warning',
  }
}

export function shortDigest(digest: string | null | undefined): string {
  return digest ? digest.slice(0, 12) : '—'
}
