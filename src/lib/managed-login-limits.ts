/**
 * Where a database login may connect from, and how many connections it may
 * hold. The control plane stores a list of places (`internal`, `server:<id>`,
 * `address:<ip, prefix% or range>`); `any` or no list means anywhere. The
 * control plane is the final judge, these helpers only catch the obvious
 * mistakes in plain words before a request is sent.
 */

export const MAX_CONNECTIONS_LIMIT = 10_000

/** What the owner has chosen in the form. */
export type LoginLimitsDraft = {
  /** `false` = anywhere. */
  limited: boolean
  /** This server and its containers. */
  internal: boolean
  serverIds: string[]
  /** Typed addresses, prefixes or ranges, separated by commas, spaces or new lines. */
  addresses: string
  /** Empty = no cap. */
  maxConnections: string
}

export const EMPTY_LIMITS_DRAFT: LoginLimitsDraft = {
  limited: false,
  internal: false,
  serverIds: [],
  addresses: '',
  maxConnections: '',
}

/** The request fields: `null` clears, so the same shape serves create and change. */
export type LoginLimitsPayload = {
  allowedSources: string[] | null
  maxConnections: number | null
}

export type LoginLimitsResult =
  | { ok: true; payload: LoginLimitsPayload }
  | { ok: false; error: string }

const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/
const IPV4_PREFIX = /^(\d{1,3})(\.\d{1,3}){0,2}\.%$/
const IPV4_CIDR = /^(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\/(\d{1,2})$/
const IPV6 = /^[0-9a-f:]+$/i
const IPV6_PREFIX = /^([0-9a-f]{1,4}:){1,7}%$/i
const IPV6_CIDR = /^([0-9a-f:]+)\/(\d{1,3})$/i

const octetsOk = (parts: readonly string[]): boolean =>
  parts.every((part) => Number(part) <= 255 && (part === '0' || !part.startsWith('0')))

function isIpv4(value: string): boolean {
  const match = IPV4.exec(value)
  return match !== null && octetsOk(match.slice(1))
}

function isIpv6(value: string): boolean {
  if (!value.includes(':') || !IPV6.test(value)) return false
  if (value.split('::').length > 2) return false
  const groups = value.split(':').filter((group) => group !== '')
  return groups.length <= 8 && groups.every((group) => group.length <= 4)
}

/** Plain-words refusal for one typed entry, or `null` when it looks fine. */
export function addressProblem(entry: string): string | null {
  const value = entry.trim()
  const cidr4 = IPV4_CIDR.exec(value)
  if (cidr4) {
    const bits = Number(cidr4[2])
    if (!isIpv4(cidr4[1]!) || bits > 32) return `${value} is not a valid address range.`
    if (bits === 32 || (bits > 0 && bits % 8 === 0)) return null
    return `${value} can't be matched exactly. Use a whole /8, /16 or /24 range, list the addresses one by one, or type a prefix such as 203.0.113.%.`
  }
  const cidr6 = IPV6_CIDR.exec(value)
  if (cidr6) {
    const bits = Number(cidr6[2])
    if (!isIpv6(cidr6[1]!) || bits > 128) return `${value} is not a valid address range.`
    if (bits === 128 || (bits >= 16 && bits <= 112 && bits % 16 === 0)) return null
    return `${value} can't be matched exactly. Use a range that ends on a whole group (/16, /32, /48, /64 and so on up to /112), or list the addresses one by one.`
  }
  if (value.endsWith('%')) {
    if (IPV4_PREFIX.test(value) && octetsOk(value.slice(0, -2).split('.'))) return null
    if (IPV6_PREFIX.test(value)) return null
    return `${value} is not a valid address prefix. Use something like 203.0.113.% or 2001:db8:1:%.`
  }
  if (isIpv4(value) || isIpv6(value)) return null
  return `${value} is not a valid IP address, prefix or range.`
}

/** Split typed text into entries (commas, spaces and new lines all separate). */
export function splitAddresses(text: string): string[] {
  return [...new Set(text.split(/[\s,;]+/).filter((entry) => entry !== ''))]
}

/** Turn the form into a request, or say in plain words what to fix. */
export function limitsFromDraft(draft: LoginLimitsDraft): LoginLimitsResult {
  const cap = draft.maxConnections.trim()
  let maxConnections: number | null = null
  if (cap !== '') {
    maxConnections = Number(cap)
    if (!/^\d+$/.test(cap) || maxConnections < 1 || maxConnections > MAX_CONNECTIONS_LIMIT) {
      return {
        ok: false,
        error: `Most connections at once must be a whole number from 1 to ${MAX_CONNECTIONS_LIMIT}, or empty for no limit.`,
      }
    }
  }
  if (!draft.limited) return { ok: true, payload: { allowedSources: null, maxConnections } }

  const typed = splitAddresses(draft.addresses)
  for (const entry of typed) {
    const problem = addressProblem(entry)
    if (problem) return { ok: false, error: problem }
  }
  const sources = [
    ...(draft.internal ? ['internal'] : []),
    ...draft.serverIds.map((id) => `server:${id}`),
    ...typed.map((entry) => `address:${entry}`),
  ]
  if (sources.length === 0) {
    return {
      ok: false,
      error: 'Choose at least one place, or choose Anywhere to remove the limit.',
    }
  }
  return { ok: true, payload: { allowedSources: sources, maxConnections } }
}

/** `true` when a stored list means a real limit (`any`, empty and missing all mean anywhere). */
export function isLimited(sources: readonly string[] | null | undefined): boolean {
  return (sources ?? []).some((source) => source !== 'any')
}

/** The form as it stands for a login's stored limits. */
export function draftFromStored(
  sources: readonly string[] | null | undefined,
  maxConnections: number | null | undefined,
): LoginLimitsDraft {
  const list = isLimited(sources) ? (sources ?? []) : []
  return {
    limited: list.length > 0,
    internal: list.includes('internal'),
    serverIds: list.filter((s) => s.startsWith('server:')).map((s) => s.slice('server:'.length)),
    addresses: list
      .filter((s) => s.startsWith('address:'))
      .map((s) => s.slice('address:'.length))
      .join('\n'),
    maxConnections: maxConnections ? String(maxConnections) : '',
  }
}

export type LimitServerName = { id: string; name: string | null; hostname: string | null }

export function serverLabel(server: Pick<LimitServerName, 'name' | 'hostname'> & { id: string }): string {
  return server.name?.trim() || server.hostname?.trim() || server.id
}

/** One place in words. Unknown servers show their id so nothing is hidden. */
export function describePlace(place: string, servers: readonly LimitServerName[]): string {
  if (place === 'internal') return 'this server and its containers'
  if (place.startsWith('server:')) {
    const id = place.slice('server:'.length)
    const found = servers.find((server) => server.id === id)
    return found ? `the server ${serverLabel(found)}` : `the server ${id}`
  }
  if (place.startsWith('address:')) return place.slice('address:'.length)
  return place
}

/** A sentence for the row and the confirm sheet. */
export function describeWhere(
  sources: readonly string[] | null | undefined,
  servers: readonly LimitServerName[],
): string {
  if (!isLimited(sources)) return 'Can connect from anywhere.'
  return `Limited to: ${(sources ?? []).map((place) => describePlace(place, servers)).join(', ')}.`
}

export function describeCap(maxConnections: number | null | undefined): string {
  return maxConnections
    ? `At most ${maxConnections} connections at once.`
    : 'No limit on connections at once.'
}

export function sameLimits(a: LoginLimitsPayload, b: LoginLimitsPayload): boolean {
  const left = [...(a.allowedSources ?? [])].sort((x, y) => x.localeCompare(y))
  const right = [...(b.allowedSources ?? [])].sort((x, y) => x.localeCompare(y))
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index]) &&
    (a.maxConnections ?? null) === (b.maxConnections ?? null)
  )
}

/** The stored limits of a login as a request, for comparing with an edit. */
export function payloadFromStored(
  sources: readonly string[] | null | undefined,
  maxConnections: number | null | undefined,
): LoginLimitsPayload {
  return {
    allowedSources: isLimited(sources) ? [...(sources ?? [])] : null,
    maxConnections: maxConnections ?? null,
  }
}
