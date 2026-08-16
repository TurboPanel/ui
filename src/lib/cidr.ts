/**
 * Minimal CIDR membership checks for UI validation (instance still enforces).
 * Supports IPv4 fully; IPv6 uses the same prefix-mask model with compressed forms.
 */

const IPV4_OCTET = String.raw`(?:25[0-5]|2[0-4]\d|1\d{2}|[1-9]?\d)`
const IPV4_ADDRESS_RE = new RegExp(
  String.raw`^${IPV4_OCTET}\.${IPV4_OCTET}\.${IPV4_OCTET}\.${IPV4_OCTET}$`,
)

function isIpv6Hextet(part: string): boolean {
  if (part.length === 0 || part.length > 4) return false
  return /^[0-9a-fA-F]+$/.test(part)
}

function expandIpv6Hextets(address: string): string[] | null {
  if (address.includes('::')) {
    const [left, right] = address.split('::')
    const leftParts = left === '' ? [] : left.split(':')
    const rightParts = right === '' ? [] : right.split(':')
    const missing = 8 - leftParts.length - rightParts.length
    if (missing < 0) return null
    if (![...leftParts, ...rightParts].every(isIpv6Hextet)) return null
    return [
      ...leftParts,
      ...Array.from({ length: missing }, () => '0'),
      ...rightParts,
    ]
  }
  const parts = address.split(':')
  if (parts.length !== 8) return null
  if (!parts.every(isIpv6Hextet)) return null
  return parts
}

function parseIpVersion(address: string): 4 | 6 | null {
  const trimmed = address.trim()
  if (trimmed.length === 0) return null
  if (IPV4_ADDRESS_RE.test(trimmed)) return 4
  if (trimmed.includes(':') && expandIpv6Hextets(trimmed)) return 6
  return null
}

function ipToBigInt(address: string): bigint | null {
  const trimmed = address.trim()
  const version = parseIpVersion(trimmed)
  if (version === 4) {
    const parts = trimmed.split('.')
    let value = 0n
    for (const part of parts) {
      value = (value << 8n) + BigInt(Number.parseInt(part, 10))
    }
    return value
  }
  if (version === 6) {
    const hextets = expandIpv6Hextets(trimmed)
    if (!hextets) return null
    let value = 0n
    for (const hextet of hextets) {
      value = (value << 16n) + BigInt(Number.parseInt(hextet, 16))
    }
    return value
  }
  return null
}

export type ParsedCidr = {
  version: 4 | 6
  base: bigint
  prefix: number
}

export function parseCidr(value: string): ParsedCidr | null {
  const trimmed = value.trim()
  const slash = trimmed.lastIndexOf('/')
  if (slash <= 0 || slash === trimmed.length - 1) return null
  const addressPart = trimmed.slice(0, slash)
  const prefixPart = trimmed.slice(slash + 1)
  const version = parseIpVersion(addressPart)
  if (version === null) return null
  if (!/^\d+$/.test(prefixPart)) return null
  const prefix = Number.parseInt(prefixPart, 10)
  const maxPrefix = version === 4 ? 32 : 128
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > maxPrefix) {
    return null
  }
  const base = ipToBigInt(addressPart)
  if (base === null) return null
  const hostBits = maxPrefix - prefix
  const aligned =
    hostBits === 0 ? base : (base >> BigInt(hostBits)) << BigInt(hostBits)
  return { version, base: aligned, prefix }
}

export function isValidCidr(value: string): boolean {
  return parseCidr(value) !== null
}

function bigIntToIpv4(value: bigint): string {
  const n = value & 0xff_ff_ff_ffn
  return [
    Number((n >> 24n) & 0xffn),
    Number((n >> 16n) & 0xffn),
    Number((n >> 8n) & 0xffn),
    Number(n & 0xffn),
  ].join('.')
}

function ipv6HextetsFromBigInt(value: bigint): number[] {
  const hextets: number[] = []
  let remaining = value & ((1n << 128n) - 1n)
  for (let i = 0; i < 8; i++) {
    hextets.unshift(Number(remaining & 0xffffn))
    remaining >>= 16n
  }
  return hextets
}

/** Longest run of zero hextets (RFC 5952 prefers the leftmost on ties). */
function longestIpv6ZeroRun(
  hextets: readonly number[],
): { start: number; length: number } {
  let bestStart = -1
  let bestLen = 0
  let runStart = -1
  let runLen = 0
  for (let i = 0; i <= hextets.length; i++) {
    if (i < hextets.length && hextets[i] === 0) {
      if (runStart === -1) runStart = i
      runLen += 1
      continue
    }
    if (runStart !== -1 && runLen > bestLen) {
      bestStart = runStart
      bestLen = runLen
    }
    runStart = -1
    runLen = 0
  }
  return { start: bestStart, length: bestLen }
}

function formatHexHextets(hextets: readonly number[]): string {
  return hextets.map((h) => h.toString(16)).join(':')
}

function bigIntToIpv6(value: bigint): string {
  const hextets = ipv6HextetsFromBigInt(value)
  const { start: bestStart, length: bestLen } = longestIpv6ZeroRun(hextets)
  if (bestLen < 2) return formatHexHextets(hextets)
  const left = formatHexHextets(hextets.slice(0, bestStart))
  const right = formatHexHextets(hextets.slice(bestStart + bestLen))
  if (bestStart === 0 && bestStart + bestLen === 8) return '::'
  if (bestStart === 0) return `::${right}`
  if (bestStart + bestLen === 8) return `${left}::`
  return `${left}::${right}`
}

export function formatCidr(parsed: ParsedCidr): string {
  const address =
    parsed.version === 4
      ? bigIntToIpv4(parsed.base)
      : bigIntToIpv6(parsed.base)
  return `${address}/${parsed.prefix}`
}

/** Typical LAN prefixes used when seeding a datacenter from one host IP. */
export const SITE_LAN_PREFIX_V4 = 24
export const SITE_LAN_PREFIX_V6 = 64

/**
 * Infer the site CIDR from a host address: IPv4 /24, IPv6 /64, aligned to
 * the network address.
 */
export function inferSiteCidrFromAddress(address: string): string | null {
  const version = parseIpVersion(address)
  if (version === null) return null
  const prefix = version === 4 ? SITE_LAN_PREFIX_V4 : SITE_LAN_PREFIX_V6
  const parsed = parseCidr(`${address.trim()}/${prefix}`)
  if (!parsed) return null
  return formatCidr(parsed)
}

/** True when `address` falls inside `cidr` (same address family). */
export function addressInCidr(address: string, cidr: string): boolean {
  const parsed = parseCidr(cidr)
  const value = ipToBigInt(address)
  if (!parsed || value === null) return false
  if (parseIpVersion(address.trim()) !== parsed.version) return false
  const bitWidth = parsed.version === 4 ? 32 : 128
  const hostBits = bitWidth - parsed.prefix
  if (hostBits === 0) return value === parsed.base
  const hostMask = (1n << BigInt(hostBits)) - 1n
  return (value & ~hostMask) === parsed.base
}
