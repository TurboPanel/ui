/**
 * The address model behind Networking → Public URLs.
 *
 * A public URL is an **address**, not a link: a scheme, a host, and — only when
 * it is not the scheme's default — a port. Nothing else is meaningful. The
 * panel therefore composes one from three controls (scheme picker, hostname,
 * optional port) instead of asking for a URL string, and renders stored entries
 * back as those same three parts.
 *
 * Anything past the port is dropped rather than rejected: an operator who
 * pastes `https://studio.lan:8443/admin/networking` out of the browser bar
 * means `https://studio.lan:8443`, and a 422 three clicks later is not a useful
 * way to say so. A pasted address dropped into the hostname box is absorbed
 * whole — its scheme and port win over the other two controls. The scheme's
 * default port is dropped too: `https://turbopanel.dev:443` and
 * `https://turbopanel.dev` are the same address, and the short form is what
 * belongs in a certificate SAN, a webhook URL, or an install command.
 *
 * The validation rules mirror `parseAndNormalizePublicUrlEntry` in the control
 * plane's `src/admin/public-urls.ts` — a different repo and runtime, so they
 * are reproduced rather than imported. Two deliberate differences:
 *
 * - The control plane **rejects** an entry carrying a path/query/fragment; this
 *   module **shortens** it, so what the panel adds is what the API would store.
 * - Plaintext `http:` is offered here and left to the API, which accepts it only
 *   on a development surface. The panel does not know which it is talking to,
 *   and guessing wrong would hide a legitimate dev entry.
 *
 * The self-hosted runtime (`selfHosted`) is stricter on both counts: its
 * hostname box takes a bare hostname or IP only, so there is nothing to absorb
 * and no scheme to choose.
 *
 * Stored entries may also be **scheme-less** (`panel.lan`, `panel.lan:8443`) —
 * that is what the control plane persists for a bare host, and what a
 * `TURBOPANEL_PUBLIC_URLS` env value looks like. Those are parsed for display
 * as https and left byte-for-byte alone in the draft, because a scheme-less
 * entry expands to port **8443** in an install command: rewriting it as
 * `https://panel.lan` would quietly move that command to port 443.
 */

export type PublicUrlScheme = 'https' | 'http'

export const PUBLIC_URL_SCHEMES = ['https', 'http'] as const

/** Port implied by each scheme — never written into a stored entry. */
export const PUBLIC_URL_DEFAULT_PORT: Record<PublicUrlScheme, string> = {
  https: '443',
  http: '80',
}

export type PublicUrlParts = {
  scheme: PublicUrlScheme
  /** Hostname, lowercased, IPv6 without brackets. */
  host: string
  /** Explicit port, or `null` when the scheme's default applies. */
  port: string | null
}

/** The three add-row controls, as typed. */
export type PublicUrlDraft = {
  scheme: PublicUrlScheme
  host: string
  port: string
}

export type PublicUrlEntryResult =
  { ok: true; value: string; parts: PublicUrlParts } | { ok: false; error: string }

export type PublicUrlAddResult =
  { ok: true; urls: string[]; value: string } | { ok: false; error: string }

export const PUBLIC_URL_ENTRY_HINT =
  'Hostname or IP; leave the port blank for the scheme default. Paste a whole address and its scheme, port, and path are sorted out for you.'

/** The self-hosted add-row hint: no scheme picker and no port box. */
export const PUBLIC_URL_SELF_HOSTED_HINT =
  'Hostname or IP address only, like panel.example.com. It is served over https on port 8443.'

const HOST_REQUIRED_ERROR = 'Enter a hostname, for example panel.example.com'
const HOST_INVALID_ERROR = 'That is not a valid hostname.'
const HOST_UNREACHABLE_ERROR =
  'Use a hostname other machines can resolve — localhost is not reachable from anywhere else.'
const SCHEME_ERROR = 'Only http and https addresses can be used.'
const CREDENTIALS_ERROR = 'Remove the username and password from the address.'
const PORT_ERROR = 'Port must be a number between 1 and 65535.'
const DUPLICATE_ERROR = 'That address is already listed.'
const HOST_ONLY_ERROR = 'Enter a hostname or IP address only, like panel.example.com.'

/** HTTPS comparison uses the control-plane listener, not the scheme default. */
const CONTROL_PLANE_HTTPS_PORT = '8443'

/** The one port a self-hosted control plane is reached on. */
const SELF_HOSTED_ENTRY_PORT = CONTROL_PLANE_HTTPS_PORT

function stripIpv6Brackets(host: string): string {
  return host.replace(/^\[/, '').replace(/\]$/, '')
}

function isPublicUrlScheme(protocol: string): protocol is `${PublicUrlScheme}:` {
  return protocol === 'https:' || protocol === 'http:'
}

function isUsableHost(hostname: string): boolean {
  const host = stripIpv6Brackets(hostname)
  return host.length > 0 && host !== 'null' && host !== 'localhost'
}

function parseUrl(value: string): URL | null {
  try {
    return new URL(value)
  } catch {
    return null
  }
}

/**
 * `new URL('https://::1')` throws — a bare IPv6 literal has to be bracketed
 * before it can be parsed, and an operator typing one will not bracket it.
 */
function bracketBareIpv6(raw: string): string {
  if (raw.startsWith('[') || raw.includes('://')) return raw
  const colons = raw.split(':').length - 1
  return colons > 1 ? `[${raw}]` : raw
}

/** Render parts back into the string the control plane stores. */
export function formatPublicUrlEntry(parts: PublicUrlParts): string {
  const host = parts.host.includes(':') ? `[${parts.host}]` : parts.host
  const port = parts.port ? `:${parts.port}` : ''
  return `${parts.scheme}://${host}${port}`
}

function partsFromUrl(url: URL, scheme: PublicUrlScheme): PublicUrlParts {
  const port = url.port && url.port !== PUBLIC_URL_DEFAULT_PORT[scheme] ? url.port : null
  return { scheme, host: stripIpv6Brackets(url.hostname), port }
}

/**
 * Split a stored entry into display parts, or `null` when it cannot be read.
 * Scheme-less entries are reported as https — that is how the control plane
 * expands them.
 */
export function parsePublicUrlEntry(entry: string): PublicUrlParts | null {
  const trimmed = entry.trim()
  if (!trimmed || /\s/.test(trimmed)) return null

  const hasScheme = trimmed.includes('://')
  const url = parseUrl(hasScheme ? trimmed : `https://${bracketBareIpv6(trimmed)}`)
  if (!url || !isUsableHost(url.hostname)) return null
  if (hasScheme && !isPublicUrlScheme(url.protocol)) return null

  const scheme: PublicUrlScheme = url.protocol === 'http:' ? 'http' : 'https'
  return partsFromUrl(url, scheme)
}

function validatePort(port: string): { ok: true; value: string } | { ok: false } {
  if (!/^\d{1,5}$/.test(port)) return { ok: false }
  const numeric = Number(port)
  if (numeric < 1 || numeric > 65535) return { ok: false }
  return { ok: true, value: String(numeric) }
}

type HostParse =
  | { ok: true; url: URL; scheme: PublicUrlScheme; portFromHost: string }
  | { ok: false; error: string }

/**
 * Read the hostname box. It accepts a plain host, `host:port`, or a whole
 * pasted address; when the paste carries a scheme it overrides the picker.
 */
function parseHostInput(input: string, fallbackScheme: PublicUrlScheme): HostParse {
  const raw = input.trim()
  if (!raw) return { ok: false, error: HOST_REQUIRED_ERROR }
  if (/\s/.test(raw)) return { ok: false, error: HOST_INVALID_ERROR }

  // Parsed under the *selected* scheme, not a fixed one: `URL` drops the port
  // that is default for the scheme it was given, so parsing an http entry as
  // https would silently swallow an explicit `:443`.
  const hasScheme = raw.includes('://')
  const url = parseUrl(hasScheme ? raw : `${fallbackScheme}://${bracketBareIpv6(raw)}`)
  if (!url) return { ok: false, error: HOST_INVALID_ERROR }
  if (hasScheme && !isPublicUrlScheme(url.protocol)) {
    return { ok: false, error: SCHEME_ERROR }
  }
  if (url.username || url.password) return { ok: false, error: CREDENTIALS_ERROR }
  if (!isUsableHost(url.hostname)) return { ok: false, error: HOST_UNREACHABLE_ERROR }

  let scheme = fallbackScheme
  if (hasScheme) scheme = url.protocol === 'http:' ? 'http' : 'https'
  return { ok: true, url, scheme, portFromHost: url.port }
}

/**
 * How the add row treats scheme and port. `selfHosted` is the self-hosted
 * runtime: the control plane is only ever reached over https on 8443 (it
 * stores any https entry as `:8443` whatever was typed and rejects plaintext
 * http), so there is no scheme picker and no port box, and the entry is always
 * `https://host:8443`. The hostname box takes a hostname or IP and nothing
 * else: no scheme, port, path, user name or other characters, so there is no
 * pasted address to reinterpret. The port is always 8443, so none is typed.
 */
export type PublicUrlEntryOptions = { selfHosted?: boolean }

const DNS_LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/
const IPV4_OCTET = /^(?:0|[1-9]\d{0,2})$/
const MAX_DNS_NAME = 253

/** The hostname box read as a host; `null` when it cannot be one (a port included). */
type SelfHostedInput = { host: string; ipv6: boolean }

function splitSelfHostedInput(raw: string): SelfHostedInput | null {
  const bracketed = /^\[([^\]]*)\]$/.exec(raw)
  if (bracketed) return { host: bracketed[1] ?? '', ipv6: true }
  if (raw.startsWith('[')) return null
  // Two or more colons can only be a bare IPv6 address; one colon means a port.
  const colons = raw.split(':').length - 1
  if (colons === 1) return null
  if (colons > 1) return { host: raw, ipv6: true }
  // A single trailing dot (the DNS root) is dropped: it names the same host.
  return { host: raw.endsWith('.') ? raw.slice(0, -1) : raw, ipv6: false }
}

/**
 * Letters, digits and hyphens in dot-separated labels, or a dotted IPv4
 * address. A name whose last label is all digits is read as IPv4, as `URL`
 * would, so it needs four decimal octets with no leading zeros.
 */
function isHostnameOrIpv4(host: string): boolean {
  if (host.length > MAX_DNS_NAME) return false
  const labels = host.split('.')
  if (/^\d+$/.test(labels.at(-1) ?? '')) {
    return (
      labels.length === 4 && labels.every((octet) => IPV4_OCTET.test(octet) && Number(octet) <= 255)
    )
  }
  return labels.every((label) => DNS_LABEL.test(label))
}

/** The host as it will be stored, or `null` when it is not a hostname or IP. */
function normalizeSelfHostedHost(input: SelfHostedInput): string | null {
  if (input.ipv6) {
    if (!/^[0-9a-f:.]+$/.test(input.host)) return null
    const url = parseUrl(`https://[${input.host}]`)
    return url ? stripIpv6Brackets(url.hostname) : null
  }
  if (!isHostnameOrIpv4(input.host)) return null
  // `URL` must read it back unchanged, or it would store a different host.
  return parseUrl(`https://${input.host}`)?.hostname === input.host ? input.host : null
}

function buildSelfHostedEntry(text: string): PublicUrlEntryResult {
  const raw = text.trim().toLowerCase()
  if (!raw) return { ok: false, error: HOST_REQUIRED_ERROR }
  const input = splitSelfHostedInput(raw)
  const host = input ? normalizeSelfHostedHost(input) : null
  if (!input || !host) return { ok: false, error: HOST_ONLY_ERROR }
  if (host === 'localhost') return { ok: false, error: HOST_UNREACHABLE_ERROR }
  const parts: PublicUrlParts = { scheme: 'https', host, port: SELF_HOSTED_ENTRY_PORT }
  return { ok: true, value: formatPublicUrlEntry(parts), parts }
}

/** Compose the three add-row controls into one stored entry. */
export function buildPublicUrlEntry(
  draft: PublicUrlDraft,
  options: PublicUrlEntryOptions = {}
): PublicUrlEntryResult {
  if (options.selfHosted) return buildSelfHostedEntry(draft.host)

  const host = parseHostInput(draft.host, draft.scheme)
  if (!host.ok) return host

  // A port pasted into the hostname box is part of the address the operator
  // meant; the port box only fills in when the paste carried none.
  const portInput = host.portFromHost || draft.port.trim()
  if (portInput) {
    const port = validatePort(portInput)
    if (!port.ok) return { ok: false, error: PORT_ERROR }
    host.url.port = port.value
  }

  const parts = partsFromUrl(host.url, host.scheme)
  return { ok: true, value: formatPublicUrlEntry(parts), parts }
}

function comparableHttpsHost(host: string): string {
  return host.includes(':') ? `[${host}]` : host
}

/**
 * The comparable form of a stored entry. HTTPS entries compare as the
 * control plane's `https://host:8443` origin, so a portless draft and a
 * saved `:8443` row are the same address. HTTP keeps its own port.
 */
function comparableEntry(entry: string): string {
  const parts = parsePublicUrlEntry(entry)
  if (!parts) return entry.trim()
  if (parts.scheme === 'https') {
    return `https://${comparableHttpsHost(parts.host)}:${CONTROL_PLANE_HTTPS_PORT}`
  }
  return formatPublicUrlEntry(parts)
}

/**
 * Append one composed entry to the draft list. Returns the message to show
 * under the add row instead of queueing something Save would only reject.
 */
export function addPublicUrlEntry(
  current: readonly string[],
  draft: PublicUrlDraft,
  options: PublicUrlEntryOptions = {}
): PublicUrlAddResult {
  const built = buildPublicUrlEntry(draft, options)
  if (!built.ok) return built

  if (new Set(current.map(comparableEntry)).has(comparableEntry(built.value))) {
    return { ok: false, error: DUPLICATE_ERROR }
  }

  return { ok: true, urls: [...current, built.value], value: built.value }
}

/**
 * Whether two lists name the same set of addresses — used to confirm a save
 * landed after the apply request died in transit (`useApplyPublicUrls`).
 * Order and formatting do not matter; membership does.
 */
export function samePublicUrlSet(a: readonly string[], b: readonly string[]): boolean {
  const left = new Set(a.map(comparableEntry))
  const right = new Set(b.map(comparableEntry))
  if (left.size !== right.size) return false
  for (const entry of left) {
    if (!right.has(entry)) return false
  }
  return true
}

/** Port a stored name is published on until told otherwise (the panel's own listener). */
export const DEFAULT_PANEL_PUBLIC_PORT = 8443

/**
 * The address people open for a stored hostname: `https://host` on port 443,
 * `https://host:<port>` otherwise. A missing port reads as 8443. Mirrors the
 * control plane's public origin helper; the stored entry itself stays the
 * `:8443` dial.
 */
export function publicOriginForRecord(record: { host: string; publicPort?: number }): string {
  const host = parsePublicUrlEntry(record.host)?.host ?? record.host.trim().toLowerCase()
  const literal = host.includes(':') ? `[${host}]` : host
  const port = record.publicPort ?? DEFAULT_PANEL_PUBLIC_PORT
  return port === 443 ? `https://${literal}` : `https://${literal}:${port}`
}

/** A typed public port, or `null` when it is not a whole number from 1 to 65535. */
export function parsePublicPort(text: string): number | null {
  const trimmed = text.trim()
  if (!/^\d{1,5}$/.test(trimmed)) return null
  const port = Number(trimmed)
  return port >= 1 && port <= 65535 ? port : null
}
