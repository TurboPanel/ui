/**
 * One code → sentence map for every network surface (datacenter subnets and
 * pins, reserved ranges, Docker registrations, Docker host address pools).
 *
 * The instance answers every CIDR write through a single collision authority
 * (`turbopanel/src/lib/net/cidr-collisions.ts`), so the same **409** can
 * surface on four different forms. Keeping the copy here means it never reads
 * two ways. Pure and unit-tested — rendering (monospace for the conflicting
 * range) stays with the surface.
 */

import {
  ADDRESS_IN_USE_ERROR,
  ADDRESS_NOT_IN_ANY_SUBNET_ERROR,
  CIDR_OVERLAPS_DOCKER_NETWORK_ERROR,
  CIDR_OVERLAPS_FABRIC_ERROR,
  CIDR_OVERLAPS_FABRIC_POOL_ERROR,
  CIDR_OVERLAPS_GATEWAY_ADVERTISED_ERROR,
  CIDR_OVERLAPS_RESERVED_ERROR,
  CidrCollisionError,
  DOCKER_ADDRESS_POOLS_MAX,
  DOCKER_NETWORK_GATEWAY_INVALID_ERROR,
  DOCKER_NETWORK_IP_RANGE_INVALID_ERROR,
  DOCKER_NETWORK_MTU_INVALID_ERROR,
  DOCKER_NETWORK_MTU_MAX,
  DOCKER_NETWORK_MTU_MIN,
  DOCKER_NETWORK_NAME_REQUIRED_ERROR,
  DOCKER_NETWORK_SUBNET_INVALID_ERROR,
  DOCKER_NETWORK_SUBNET_MISMATCH_ERROR,
  DOCKER_NETWORK_SUBNET_REQUIRED_ERROR,
  FAILOVER_REQUIRES_TRUSTED_DATACENTER_ERROR,
  INVALID_CIDR_ERROR,
  NETWORK_CIDR_REQUIRED_ERROR,
  SUBNET_HAS_MEMBERS_ERROR,
  SUBNET_OVERLAPS_ERROR,
} from '@/lib/instance-api'
import { FAILOVER_REQUIRES_TRUSTED_DATACENTER_COPY } from '@/lib/managed-services'
import { TURBOFABRIC_PRODUCT_NAME } from '@/lib/platform-copy'

/** Codes the collision authority answers a CIDR write with (**409**). */
export const CIDR_COLLISION_CODES = [
  CIDR_OVERLAPS_FABRIC_ERROR,
  CIDR_OVERLAPS_FABRIC_POOL_ERROR,
  CIDR_OVERLAPS_RESERVED_ERROR,
  CIDR_OVERLAPS_DOCKER_NETWORK_ERROR,
  CIDR_OVERLAPS_GATEWAY_ADVERTISED_ERROR,
  SUBNET_OVERLAPS_ERROR,
] as const

export type CidrCollisionCode = (typeof CIDR_COLLISION_CODES)[number]

const CIDR_COLLISION_CODE_SET: ReadonlySet<string> = new Set(CIDR_COLLISION_CODES)

/** Copy kept identical to the datacenter Subnets panel's existing wording. */
export const SUBNET_OVERLAPS_COPY =
  'That range overlaps an existing subnet in this organization.'

export const NETWORK_ERROR_COPY: Readonly<Record<string, string>> = {
  // --- CIDR collisions (409) ------------------------------------------------
  [CIDR_OVERLAPS_FABRIC_ERROR]: `That range overlaps the ${TURBOFABRIC_PRODUCT_NAME} range (tp0) for this organization.`,
  [CIDR_OVERLAPS_FABRIC_POOL_ERROR]: `That range overlaps the ${TURBOFABRIC_PRODUCT_NAME} container pool.`,
  [CIDR_OVERLAPS_RESERVED_ERROR]:
    'That range overlaps a reserved range — something outside TurboPanel routes it.',
  [CIDR_OVERLAPS_DOCKER_NETWORK_ERROR]:
    'That range overlaps a registered Docker network or a Docker address pool.',
  [CIDR_OVERLAPS_GATEWAY_ADVERTISED_ERROR]:
    'A gateway in another datacenter already advertises that range across the mesh.',
  [SUBNET_OVERLAPS_ERROR]: SUBNET_OVERLAPS_COPY,

  // --- Managed placement (422) -----------------------------------------------
  [FAILOVER_REQUIRES_TRUSTED_DATACENTER_ERROR]: FAILOVER_REQUIRES_TRUSTED_DATACENTER_COPY,

  // --- Field-level (400) ----------------------------------------------------
  [INVALID_CIDR_ERROR]: 'Enter a valid IPv4 or IPv6 CIDR.',
  [NETWORK_CIDR_REQUIRED_ERROR]:
    'This range exists because of its CIDR — enter a new CIDR instead of clearing it.',
  [DOCKER_NETWORK_NAME_REQUIRED_ERROR]:
    'Enter the Docker network name compose will reference under networks.*.name.',
  [DOCKER_NETWORK_SUBNET_REQUIRED_ERROR]:
    'IP range and gateway need a subnet — set the subnet first, or clear them.',
  [DOCKER_NETWORK_SUBNET_MISMATCH_ERROR]:
    'The subnet and the CIDR disagree — send one of them, or make them the same range.',
  [DOCKER_NETWORK_SUBNET_INVALID_ERROR]: 'Subnet must be a valid IPv4 or IPv6 CIDR.',
  [DOCKER_NETWORK_IP_RANGE_INVALID_ERROR]:
    'IP range must be a CIDR inside the subnet.',
  [DOCKER_NETWORK_GATEWAY_INVALID_ERROR]:
    'Gateway must be a bare address inside the subnet (no prefix).',
  [DOCKER_NETWORK_MTU_INVALID_ERROR]: `MTU must be a whole number from ${DOCKER_NETWORK_MTU_MIN} to ${DOCKER_NETWORK_MTU_MAX}.`,
  address_pools_invalid: 'Address pools must be a list of base + size rows.',
  address_pools_too_many: `At most ${DOCKER_ADDRESS_POOLS_MAX} address pools.`,
  address_pool_base_invalid: 'Each pool base must be a valid IPv4 or IPv6 CIDR.',
  address_pool_size_invalid:
    'Each pool size must be a prefix length between the base prefix and /30 (IPv4) or /126 (IPv6).',
  address_pools_overlap: 'Address pools overlap each other — dockerd would hand the same subnet to two networks.',
  default_bridge_cidr_invalid:
    'Default bridge must be the bridge host address with its prefix, e.g. 172.17.0.1/16 — not a network address.',

  // --- Datacenter pins / subnets --------------------------------------------
  [ADDRESS_IN_USE_ERROR]: 'That address is already pinned.',
  [ADDRESS_NOT_IN_ANY_SUBNET_ERROR]:
    'That address is not in any subnet of this datacenter.',
  [SUBNET_HAS_MEMBERS_ERROR]: 'Unassign the pinned servers first.',
  address_cidr_unreported: 'That server has not reported a private IP.',
  address_not_reported: 'Pick a private IP reported on that server.',
}

/** True when `code` is one of the collision authority's **409** codes. */
export function isCidrCollisionCode(code: string | null | undefined): code is CidrCollisionCode {
  return typeof code === 'string' && CIDR_COLLISION_CODE_SET.has(code)
}

/**
 * The instance error code inside an `apiFetch` message
 * (`… failed: HTTP 409: cidr_overlaps_reserved`), or `null`. Typed
 * {@link CidrCollisionError}s carry the code directly.
 */
export function networkErrorCode(err: unknown): string | null {
  if (err instanceof CidrCollisionError) return err.code || null
  if (!(err instanceof Error)) return null
  const match = /HTTP \d+:\s*([a-z0-9_]+)/i.exec(err.message)
  const code = match?.[1] ?? null
  if (!code) return null
  // A human message ("Invalid addressPools base") also matches the pattern;
  // only a known lower_snake code is a code.
  return code in NETWORK_ERROR_COPY ? code : null
}

export type NetworkErrorDescription = {
  /** Operator-facing sentence (mapped copy, or the raw message / fallback). */
  message: string
  /** Instance code when recognised. */
  code: string | null
  /** The existing range the write collided with — render in monospace. */
  conflictingCidr: string | null
}

/**
 * Map an instance error onto operator copy. Collision **409**s that carry
 * `conflictingCidr` keep it separate so the surface can render the range in
 * monospace next to the sentence.
 */
export function describeNetworkError(
  err: unknown,
  fallback: string,
): NetworkErrorDescription {
  const code = networkErrorCode(err)
  const conflictingCidr =
    err instanceof CidrCollisionError ? err.conflictingCidr : null
  if (code && NETWORK_ERROR_COPY[code]) {
    return { message: NETWORK_ERROR_COPY[code], code, conflictingCidr }
  }
  const raw = err instanceof Error ? err.message : ''
  return { message: raw || fallback, code, conflictingCidr }
}

/**
 * Flat string form of {@link describeNetworkError} for surfaces that render a
 * single error line: the conflicting range is appended in parentheses.
 */
export function networkErrorMessage(err: unknown, fallback: string): string {
  const described = describeNetworkError(err, fallback)
  if (described.conflictingCidr) {
    return `${described.message} (${described.conflictingCidr})`
  }
  return described.message
}
