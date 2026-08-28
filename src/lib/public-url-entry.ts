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
  | { ok: true; value: string; parts: PublicUrlParts }
  | { ok: false; error: string }

export type PublicUrlAddResult =
  | { ok: true; urls: string[]; value: string }
  | { ok: false; error: string }

export const PUBLIC_URL_ENTRY_HINT =
  'Hostname or IP; leave the port blank for the scheme default. Paste a whole address and its scheme, port, and path are sorted out for you.'

const HOST_REQUIRED_ERROR = 'Enter a hostname, for example panel.example.com'
const HOST_INVALID_ERROR = 'That is not a valid hostname.'
const HOST_UNREACHABLE_ERROR =
  'Use a hostname other machines can resolve — localhost is not reachable from anywhere else.'
const SCHEME_ERROR = 'Only http and https addresses can be used.'
const CREDENTIALS_ERROR = 'Remove the username and password from the address.'
const PORT_ERROR = 'Port must be a number between 1 and 65535.'
const DUPLICATE_ERROR = 'That address is already listed.'

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

/** Compose the three add-row controls into one stored entry. */
export function buildPublicUrlEntry(draft: PublicUrlDraft): PublicUrlEntryResult {
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

/** The comparable form of a stored entry — its parsed address, or itself. */
function comparableEntry(entry: string): string {
  const parts = parsePublicUrlEntry(entry)
  return parts ? formatPublicUrlEntry(parts) : entry.trim()
}

/**
 * Append one composed entry to the draft list. Returns the message to show
 * under the add row instead of queueing something Save would only reject.
 */
export function addPublicUrlEntry(
  current: readonly string[],
  draft: PublicUrlDraft,
): PublicUrlAddResult {
  const built = buildPublicUrlEntry(draft)
  if (!built.ok) return built

  if (new Set(current.map(comparableEntry)).has(built.value)) {
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
