/**
 * Client-side validation for Docker addressing forms — the org-wide host
 * address pools (`PUT /organizations/:id/docker-networking`) and the
 * per-network `subnet` / `ipRange` / `gateway` / `mtu` keys on a
 * `kind: 'docker'` registration.
 *
 * Mirrors the instance rules (`docker-address-pools.ts`,
 * `docker-network-name.ts`) so the operator never learns a dependency from a
 * 400: `ipRange` and `gateway` need `subnet` and must sit inside it; a pool
 * `size` is a prefix length between the base prefix and `/30` / `/126`; the
 * default bridge is a **host** address with prefix, never a network address.
 * The instance still enforces everything.
 */

import { addressInCidr, cidrsOverlap, ipVersionOf, normalizeCidr, parseCidr } from '@/lib/cidr'
import {
  DOCKER_ADDRESS_POOL_MAX_SIZE_V4,
  DOCKER_ADDRESS_POOL_MAX_SIZE_V6,
  DOCKER_ADDRESS_POOLS_MAX,
  DOCKER_NETWORK_MTU_MAX,
  DOCKER_NETWORK_MTU_MIN,
  type DockerAddressPool,
} from '@/lib/instance-api'
import { NETWORK_ERROR_COPY } from '@/lib/network-error-copy'

export type DockerAddressPoolDraft = {
  base: string
  size: string
}

export type DockerAddressPoolDraftError = {
  index: number
  field: 'base' | 'size' | 'overlap'
  message: string
}

function maxPoolSize(version: 4 | 6): number {
  return version === 4 ? DOCKER_ADDRESS_POOL_MAX_SIZE_V4 : DOCKER_ADDRESS_POOL_MAX_SIZE_V6
}

type DockerAddressPoolDraftResult =
  { ok: true; pool: DockerAddressPool } | { ok: false; error: DockerAddressPoolDraftError }

/** One non-empty draft → a stored pool, checked against the pools kept so far. */
function parseDockerAddressPoolDraft(
  draft: DockerAddressPoolDraft,
  index: number,
  earlier: readonly DockerAddressPool[]
): DockerAddressPoolDraftResult {
  const parsed = parseCidr(draft.base)
  const base = normalizeCidr(draft.base)
  if (!parsed || !base) {
    return {
      ok: false,
      error: {
        index,
        field: 'base',
        message: NETWORK_ERROR_COPY.address_pool_base_invalid ?? 'Invalid pool base.',
      },
    }
  }
  const sizeText = draft.size.trim()
  const size = /^\d+$/.test(sizeText) ? Number.parseInt(sizeText, 10) : Number.NaN
  if (!Number.isInteger(size) || size < parsed.prefix || size > maxPoolSize(parsed.version)) {
    return {
      ok: false,
      error: {
        index,
        field: 'size',
        message: `Size must be a prefix length from /${parsed.prefix} to /${maxPoolSize(parsed.version)}.`,
      },
    }
  }
  if (earlier.some((pool) => cidrsOverlap(pool.base, base))) {
    return {
      ok: false,
      error: {
        index,
        field: 'overlap',
        message: NETWORK_ERROR_COPY.address_pools_overlap ?? 'Pools overlap.',
      },
    }
  }
  return { ok: true, pool: { base, size } }
}

/** `{ base, size }` drafts → stored pools; empty drafts (both fields blank) are skipped. */
export function parseDockerAddressPoolDrafts(
  drafts: readonly DockerAddressPoolDraft[]
): { ok: true; pools: DockerAddressPool[] } | { ok: false; error: DockerAddressPoolDraftError } {
  const pools: DockerAddressPool[] = []
  const kept: number[] = []
  drafts.forEach((draft, index) => {
    if (draft.base.trim().length === 0 && draft.size.trim().length === 0) return
    kept.push(index)
  })
  if (kept.length > DOCKER_ADDRESS_POOLS_MAX) {
    return {
      ok: false,
      error: {
        index: kept[DOCKER_ADDRESS_POOLS_MAX] ?? 0,
        field: 'base',
        message: NETWORK_ERROR_COPY.address_pools_too_many ?? 'Too many address pools.',
      },
    }
  }
  for (const index of kept) {
    const draft = drafts[index]
    if (!draft) continue
    const result = parseDockerAddressPoolDraft(draft, index, pools)
    if (!result.ok) return result
    pools.push(result.pool)
  }
  return { ok: true, pools }
}

/**
 * dockerd `bip` — the bridge's own address **with** prefix (`172.17.0.1/16`).
 * A network address (`172.17.0.0/16`) is refused, except for `/31`, `/32`
 * and the IPv6 equivalents, which have no distinct network address.
 */
export function isValidDefaultBridgeCidr(value: string): boolean {
  const trimmed = value.trim()
  const slash = trimmed.lastIndexOf('/')
  if (slash <= 0) return false
  const parsed = parseCidr(trimmed)
  if (!parsed) return false
  const bitWidth = parsed.version === 4 ? 32 : 128
  if (parsed.prefix >= bitWidth - 1) return true
  // `parseCidr` aligns `base` to the prefix; re-parsing the bare address at
  // full width yields the address itself, so equality means the draft named
  // the network address rather than a host on it.
  const host = parseCidr(`${trimmed.slice(0, slash)}/${bitWidth}`)
  if (!host) return false
  return host.base !== parsed.base
}

export type DockerNetworkAddressingDraft = {
  subnet: string
  ipRange: string
  gateway: string
  mtu: string
}

export type DockerNetworkAddressingField = keyof DockerNetworkAddressingDraft

export type DockerNetworkAddressing = {
  subnet?: string
  ipRange?: string
  gateway?: string
  mtu?: number
}

type DockerNetworkAddressingError = {
  ok: false
  field: DockerNetworkAddressingField
  message: string
}

type AddressingFieldResult<T> = { ok: true; value: T } | DockerNetworkAddressingError

/** `ipRange` needs a subnet and must be a CIDR nested inside it. */
function parseIpRangeField(
  text: string,
  subnet: string | undefined
): AddressingFieldResult<string> {
  if (!subnet) {
    return {
      ok: false,
      field: 'ipRange',
      message: NETWORK_ERROR_COPY.docker_network_subnet_required ?? 'Subnet required.',
    }
  }
  const ipRange = normalizeCidr(text)
  if (!ipRange || !cidrContains(subnet, ipRange)) {
    return {
      ok: false,
      field: 'ipRange',
      message: NETWORK_ERROR_COPY.docker_network_ip_range_invalid ?? 'Invalid IP range.',
    }
  }
  return { ok: true, value: ipRange }
}

/** `gateway` needs a subnet and must be a bare address inside it. */
function parseGatewayField(
  text: string,
  subnet: string | undefined
): AddressingFieldResult<string> {
  if (!subnet) {
    return {
      ok: false,
      field: 'gateway',
      message: NETWORK_ERROR_COPY.docker_network_subnet_required ?? 'Subnet required.',
    }
  }
  if (text.includes('/') || ipVersionOf(text) === null || !addressInCidr(text, subnet)) {
    return {
      ok: false,
      field: 'gateway',
      message: NETWORK_ERROR_COPY.docker_network_gateway_invalid ?? 'Invalid gateway.',
    }
  }
  return { ok: true, value: text }
}

/** `mtu` is an integer within the dockerd-accepted range. */
function parseMtuField(text: string): AddressingFieldResult<number> {
  const mtu = /^\d+$/.test(text) ? Number.parseInt(text, 10) : Number.NaN
  if (!Number.isInteger(mtu) || mtu < DOCKER_NETWORK_MTU_MIN || mtu > DOCKER_NETWORK_MTU_MAX) {
    return {
      ok: false,
      field: 'mtu',
      message: NETWORK_ERROR_COPY.docker_network_mtu_invalid ?? 'Invalid MTU.',
    }
  }
  return { ok: true, value: mtu }
}

/**
 * Validate the optional addressing fields of the register form. Blank fields
 * are absent (Docker picks). Returns the first field error so the form can
 * place it adjacent to the field, or the normalized options to send.
 */
export function parseDockerNetworkAddressingDraft(
  draft: DockerNetworkAddressingDraft
): { ok: true; addressing: DockerNetworkAddressing } | DockerNetworkAddressingError {
  const addressing: DockerNetworkAddressing = {}
  const subnetText = draft.subnet.trim()
  const ipRangeText = draft.ipRange.trim()
  const gatewayText = draft.gateway.trim()
  const mtuText = draft.mtu.trim()

  if (subnetText.length > 0) {
    const subnet = normalizeCidr(subnetText)
    if (!subnet) {
      return {
        ok: false,
        field: 'subnet',
        message: NETWORK_ERROR_COPY.docker_network_subnet_invalid ?? 'Invalid subnet.',
      }
    }
    addressing.subnet = subnet
  }

  if (ipRangeText.length > 0) {
    const ipRange = parseIpRangeField(ipRangeText, addressing.subnet)
    if (!ipRange.ok) return ipRange
    addressing.ipRange = ipRange.value
  }

  if (gatewayText.length > 0) {
    const gateway = parseGatewayField(gatewayText, addressing.subnet)
    if (!gateway.ok) return gateway
    addressing.gateway = gateway.value
  }

  if (mtuText.length > 0) {
    const mtu = parseMtuField(mtuText)
    if (!mtu.ok) return mtu
    addressing.mtu = mtu.value
  }

  return { ok: true, addressing }
}

/** True when `inner` is entirely inside `outer` (same family). */
function cidrContains(outer: string, inner: string): boolean {
  const o = parseCidr(outer)
  const i = parseCidr(inner)
  if (!o || !i || o.version !== i.version) return false
  if (i.prefix < o.prefix) return false
  return cidrsOverlap(outer, inner)
}

/** Monospace detail lines for a registered Docker network's addressing. */
export function dockerNetworkAddressingLines(
  options: Record<string, unknown> | null
): { label: string; value: string }[] {
  if (!options || typeof options !== 'object') return []
  const lines: { label: string; value: string }[] = []
  const text = (key: string): string | null => {
    const raw = options[key]
    return typeof raw === 'string' && raw.trim().length > 0 ? raw.trim() : null
  }
  const subnet = text('subnet')
  const ipRange = text('ipRange')
  const gateway = text('gateway')
  const mtu = options.mtu
  if (subnet) lines.push({ label: 'Subnet', value: subnet })
  if (ipRange) lines.push({ label: 'IP range', value: ipRange })
  if (gateway) lines.push({ label: 'Gateway', value: gateway })
  if (typeof mtu === 'number' && Number.isFinite(mtu)) {
    lines.push({ label: 'MTU', value: String(mtu) })
  }
  return lines
}
