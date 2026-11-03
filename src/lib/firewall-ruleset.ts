/**
 * Reads the `iptables-restore` text a server rendered for its firewall preview
 * into rows a table can show, search and filter. Pure: no React, no I/O.
 *
 * The text is the daemon's own output (`turbopaneld/src/firewall/render.ts`):
 * one `-A <chain> …` line per rule, each tagged with a comment
 * `tp:<origin>:<id>[ <label>]`, where origin is `system` (always kept by
 * TurboPanel), `derived` (worked out from what is deployed) or `user` (a rule
 * someone added). A line this reader does not understand still becomes a row
 * with its raw text, so nothing the server rendered is ever hidden.
 */

export type RulesetFamily = 'v4' | 'v6'
export type RulesetCategory = 'system' | 'derived' | 'user' | 'other'
export type RulesetChain = 'host' | 'published' | 'other'
export type RulesetAction = 'allow' | 'drop' | 'reject' | 'pass' | 'other'

export type RulesetRow = {
  /** Stable React key: family, chain and position of the line's first appearance. */
  key: string
  /** 1-based position within its chain in each family's document it appears in. */
  positions: Partial<Record<RulesetFamily, number>>
  families: RulesetFamily[]
  category: RulesetCategory
  chain: RulesetChain
  /** The chain name as written (`TP-INPUT`, `TP-FWD`, …). */
  chainName: string
  /** Rule id from the comment (`u:…`, `d:…`, `loopback`), or null. */
  ruleId: string | null
  /** Plain-words name for the row. */
  name: string
  /** `TCP`, `UDP`, `ICMP`, `ICMPv6` or `Any`. */
  protocol: string
  /** Destination port or range (`8443`, `5432-5440`), or null for every port. */
  port: string | null
  /** Source address or range, or null for anyone. */
  source: string | null
  action: RulesetAction
  /** Remaining match details in short words (interface, state, destination). */
  details: string[]
  /** The line exactly as rendered. */
  raw: string
}

export const RULESET_CATEGORY_LABELS: Record<RulesetCategory, string> = {
  system: 'Built In',
  derived: 'From Deployments',
  user: 'Your Rules',
  other: 'Other',
}

export const RULESET_CHAIN_LABELS: Record<RulesetChain, string> = {
  host: 'Server',
  published: 'Container Ports',
  other: 'Other',
}

export const RULESET_ACTION_LABELS: Record<RulesetAction, string> = {
  allow: 'Allow',
  drop: 'Drop',
  reject: 'Reject',
  pass: 'Pass to Docker',
  other: 'Other',
}

/** Splits a line on spaces, keeping a double-quoted value (the comment) whole. */
export function tokenizeRuleLine(line: string): string[] {
  const tokens: string[] = []
  let current = ''
  let quoted = false
  let started = false
  for (const char of line) {
    if (char === '"') {
      quoted = !quoted
      started = true
    } else if (!quoted && (char === ' ' || char === '\t')) {
      if (started) tokens.push(current)
      current = ''
      started = false
    } else {
      current += char
      started = true
    }
  }
  if (started) tokens.push(current)
  return tokens
}

const SYSTEM_NAMES: Record<string, string> = {
  loopback: 'Loopback (the server talking to itself)',
  established: 'Replies to existing connections',
  icmp: 'Ping and network messages (ICMP)',
  icmpv6: 'Ping and network messages (ICMPv6)',
  dhcp: 'Address from DHCP',
  dhcpv6: 'Address from DHCPv6',
  'container-egress': 'Traffic from containers',
  default: 'Everything else',
}

function systemName(label: string): string {
  if (Object.hasOwn(SYSTEM_NAMES, label)) return SYSTEM_NAMES[label]
  const port = /^tcp-(\d+)$/.exec(label)
  if (port) return `Always open: TCP ${port[1]} (SSH or the control plane)`
  return label
}

function chainOf(name: string): RulesetChain {
  if (name === 'TP-INPUT') return 'host'
  if (name === 'TP-FWD') return 'published'
  return 'other'
}

function protocolLabel(proto: string | null): string {
  if (proto === null) return 'Any'
  if (proto === 'ipv6-icmp' || proto === 'icmpv6') return 'ICMPv6'
  return proto.toUpperCase()
}

function actionOf(target: string | null): RulesetAction {
  if (target === 'ACCEPT') return 'allow'
  if (target === 'DROP') return 'drop'
  if (target === 'REJECT') return 'reject'
  if (target === 'RETURN') return 'pass'
  return 'other'
}

function portRange(raw: string): string {
  return raw.replace(':', '-')
}

type Comment = { category: RulesetCategory; ruleId: string | null; label: string | null }

/** `tp:<origin>:<id>[ <label>]`; ids may contain `:`, the label starts at the first space. */
function parseComment(text: string | null): Comment {
  if (!text?.startsWith('tp:')) {
    return { category: 'other', ruleId: null, label: text }
  }
  const rest = text.slice(3)
  const colon = rest.indexOf(':')
  if (colon === -1) return { category: 'other', ruleId: null, label: text }
  const origin = rest.slice(0, colon)
  const tail = rest.slice(colon + 1)
  const space = tail.indexOf(' ')
  const id = space === -1 ? tail : tail.slice(0, space)
  const label = space === -1 ? null : tail.slice(space + 1).trim() || null
  if (origin === 'system') return { category: 'system', ruleId: id, label: id }
  if (origin === 'derived' || origin === 'user') return { category: origin, ruleId: id, label }
  return { category: 'other', ruleId: id, label }
}

type Parsed = {
  chainName: string
  proto: string | null
  port: string | null
  sourcePort: string | null
  source: string | null
  destination: string | null
  iface: string | null
  state: string | null
  target: string | null
  targetExtra: string[]
  comment: string | null
}

function readTokens(tokens: string[]): Parsed {
  const parsed: Parsed = {
    chainName: tokens[1] ?? '',
    proto: null,
    port: null,
    sourcePort: null,
    source: null,
    destination: null,
    iface: null,
    state: null,
    target: null,
    targetExtra: [],
    comment: null,
  }
  // Flag → field for every option that takes one value; `-m <module>` names are skipped.
  const single: Record<string, (value: string) => void> = {
    '-p': (value) => (parsed.proto = value),
    '--dport': (value) => (parsed.port = portRange(value)),
    '--ctorigdstport': (value) => (parsed.port = portRange(value)),
    '--sport': (value) => (parsed.sourcePort = portRange(value)),
    '-s': (value) => (parsed.source = value),
    '-d': (value) => (parsed.destination = value),
    '--ctorigdst': (value) => (parsed.destination = value),
    '-i': (value) => (parsed.iface = value),
    '--ctstate': (value) => (parsed.state = value),
    '--comment': (value) => (parsed.comment = value),
    '-m': () => undefined,
  }
  let i = 2
  while (i < tokens.length) {
    const token = tokens[i]
    const value = tokens[i + 1]
    if (token === '-j') {
      parsed.target = value ?? null
      parsed.targetExtra = tokens.slice(i + 2)
      break
    }
    if (Object.hasOwn(single, token) && value !== undefined) {
      single[token](value)
      i += 2
    } else {
      i += 1
    }
  }
  return parsed
}

function detailsOf(parsed: Parsed): string[] {
  const details: string[] = []
  if (parsed.iface) details.push(`coming in on ${parsed.iface}`)
  if (parsed.state) details.push(`state ${parsed.state}`)
  if (parsed.sourcePort) details.push(`from port ${parsed.sourcePort}`)
  if (parsed.destination) details.push(`to ${parsed.destination}`)
  const rejectWith = parsed.targetExtra.indexOf('--reject-with')
  if (rejectWith !== -1 && parsed.targetExtra[rejectWith + 1]) {
    details.push(`answers ${parsed.targetExtra[rejectWith + 1]}`)
  }
  return details
}

function rowName(comment: Comment, parsed: Parsed): string {
  if (comment.category === 'system' && comment.label) {
    const name = systemName(comment.label)
    return comment.label === 'container-egress' && parsed.iface ? `${name} (${parsed.iface})` : name
  }
  if (comment.label) return comment.label
  if (comment.ruleId) return comment.ruleId
  return 'Unnamed line'
}

/** One `-A` line into a row; null for headers (`*filter`, `:CHAIN`, `COMMIT`) and blanks. */
export function parseRuleLine(
  line: string,
  family: RulesetFamily,
  position: number
): RulesetRow | null {
  const trimmed = line.trim()
  if (!trimmed.startsWith('-A ')) return null
  return rowFromTokens(trimmed, tokenizeRuleLine(trimmed), family, position)
}

function rowFromTokens(
  trimmed: string,
  tokens: string[],
  family: RulesetFamily,
  position: number
): RulesetRow {
  const parsed = readTokens(tokens)
  const comment = parseComment(parsed.comment)
  return {
    key: `${family}:${parsed.chainName}:${position}`,
    positions: { [family]: position },
    families: [family],
    category: comment.category,
    chain: chainOf(parsed.chainName),
    chainName: parsed.chainName,
    ruleId: comment.ruleId,
    name: rowName(comment, parsed),
    protocol: protocolLabel(parsed.proto),
    port: parsed.port,
    source: parsed.source,
    action: actionOf(parsed.target),
    details: detailsOf(parsed),
    raw: trimmed,
  }
}

/** Every `-A` line of one family's document, numbered within its chain. */
export function parseRulesetText(text: string, family: RulesetFamily): RulesetRow[] {
  const rows: RulesetRow[] = []
  const positions = new Map<string, number>()
  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed.startsWith('-A ')) continue
    const tokens = tokenizeRuleLine(trimmed)
    const chain = tokens[1] ?? ''
    const position = (positions.get(chain) ?? 0) + 1
    positions.set(chain, position)
    rows.push(rowFromTokens(trimmed, tokens, family, position))
  }
  return rows
}

function remainingCounts(rows: readonly RulesetRow[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const row of rows) counts.set(row.raw, (counts.get(row.raw) ?? 0) + 1)
  return counts
}

function consume(counts: Map<string, number>, raw: string): void {
  counts.set(raw, (counts.get(raw) ?? 1) - 1)
}

/**
 * One chain's IPv4 and IPv6 lines woven into a single list that keeps each
 * family's own order: reading only the IPv4 rows (or only the IPv6 rows) of
 * the result gives exactly that family's document. A line at the head of both
 * lists becomes one row for both families; a line the other family does not
 * have (any more) goes in on its own. Repeated lines are matched by count, so
 * every rendered line is a row.
 */
function weaveChain(v4: readonly RulesetRow[], v6: readonly RulesetRow[]): RulesetRow[] {
  const out: RulesetRow[] = []
  const left4 = remainingCounts(v4)
  const left6 = remainingCounts(v6)
  let i = 0
  let j = 0
  for (;;) {
    const a = v4.at(i)
    const b = v6.at(j)
    // One side is used up: the rest of the other side follows in its order.
    if (a === undefined) return [...out, ...v6.slice(j)]
    if (b === undefined) return [...out, ...v4.slice(i)]
    if (a.raw === b.raw) {
      out.push({ ...a, families: ['v4', 'v6'], positions: { ...a.positions, ...b.positions } })
      consume(left4, a.raw)
      consume(left6, b.raw)
      i++
      j++
    } else if ((left6.get(a.raw) ?? 0) === 0 || (left4.get(b.raw) ?? 0) > 0) {
      // The IPv4 head is IPv4-only, or the IPv6 head still has a match further
      // down the IPv4 list: IPv4 goes first and the IPv6 head waits.
      out.push(a)
      consume(left4, a.raw)
      i++
    } else {
      out.push(b)
      consume(left6, b.raw)
      j++
    }
  }
}

function byChain(rows: readonly RulesetRow[]): Map<string, RulesetRow[]> {
  const chains = new Map<string, RulesetRow[]>()
  for (const row of rows) {
    const list = chains.get(row.chainName)
    if (list) list.push(row)
    else chains.set(row.chainName, [row])
  }
  return chains
}

/**
 * Both families in one list, chain by chain in document order. Within a chain
 * each family keeps the order its server checks the lines in; a line rendered
 * the same in IPv4 and IPv6 is one row marked for both.
 */
export function rulesetRows(rendered: Readonly<{ v4: string; v6: string | null }>): RulesetRow[] {
  const v4 = byChain(parseRulesetText(rendered.v4, 'v4'))
  const v6 = byChain(rendered.v6 === null ? [] : parseRulesetText(rendered.v6, 'v6'))
  const chains = [...new Set([...v4.keys(), ...v6.keys()])]
  return chains.flatMap((chain) => weaveChain(v4.get(chain) ?? [], v6.get(chain) ?? []))
}

/**
 * The `#` to show: the row's place in the chosen family's document; with both
 * families shown, one number when they agree and `IPv4 / IPv6` when not.
 */
export function rulesetPositionLabel(row: RulesetRow, family: RulesetFamily | 'all'): string {
  if (family !== 'all') return String(row.positions[family] ?? '')
  const { v4, v6 } = row.positions
  if (v4 !== undefined && v6 !== undefined && v4 !== v6) return `${v4} / ${v6}`
  return String(v4 ?? v6 ?? '')
}

export function rulesetFamilyLabel(families: readonly RulesetFamily[]): string {
  if (families.includes('v4') && families.includes('v6')) return 'IPv4 + IPv6'
  return families.includes('v6') ? 'IPv6' : 'IPv4'
}

export type RulesetFilter = {
  query: string
  category: RulesetCategory | 'all'
  family: RulesetFamily | 'all'
}

export const EMPTY_RULESET_FILTER: Readonly<RulesetFilter> = {
  query: '',
  category: 'all',
  family: 'all',
}

function searchText(row: RulesetRow): string {
  return [
    row.name,
    row.ruleId ?? '',
    RULESET_CATEGORY_LABELS[row.category],
    RULESET_CHAIN_LABELS[row.chain],
    row.chainName,
    row.protocol,
    row.port ?? 'any port',
    row.source ?? 'anyone',
    RULESET_ACTION_LABELS[row.action],
    rulesetFamilyLabel(row.families),
    ...row.details,
    row.raw,
  ]
    .join(' ')
    .toLowerCase()
}

/** Rows matching every word of the query (any column or the raw line), the category and the family. */
export function filterRulesetRows(
  rows: readonly RulesetRow[],
  filter: Readonly<RulesetFilter>
): RulesetRow[] {
  const words = filter.query.toLowerCase().split(/\s+/).filter(Boolean)
  return rows.filter((row) => {
    if (filter.category !== 'all' && row.category !== filter.category) return false
    if (filter.family !== 'all' && !row.families.includes(filter.family)) return false
    if (words.length === 0) return true
    const haystack = searchText(row)
    return words.every((word) => haystack.includes(word))
  })
}

/** How many rows fall in each category, for the filter labels. */
export function rulesetCategoryCounts(
  rows: readonly RulesetRow[]
): Record<RulesetCategory, number> {
  const counts: Record<RulesetCategory, number> = { system: 0, derived: 0, user: 0, other: 0 }
  for (const row of rows) counts[row.category] += 1
  return counts
}
