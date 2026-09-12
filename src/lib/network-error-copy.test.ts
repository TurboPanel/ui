import { describe, expect, it } from 'vitest'
import {
  CIDR_OVERLAPS_DOCKER_NETWORK_ERROR,
  CIDR_OVERLAPS_FABRIC_ERROR,
  CIDR_OVERLAPS_FABRIC_POOL_ERROR,
  CIDR_OVERLAPS_GATEWAY_ADVERTISED_ERROR,
  CIDR_OVERLAPS_RESERVED_ERROR,
  CidrCollisionError,
  DOCKER_NETWORK_MTU_INVALID_ERROR,
  FAILOVER_REQUIRES_TRUSTED_DATACENTER_ERROR,
  NETWORK_CIDR_REQUIRED_ERROR,
  SUBNET_OVERLAPS_ERROR,
} from '@/lib/instance-api'
import {
  FAILOVER_REQUIRES_TRUSTED_DATACENTER_COPY,
  managedErrorMessage,
} from '@/lib/managed-services'
import { TURBOFABRIC_PRODUCT_NAME } from '@/lib/platform-copy'
import {
  CIDR_COLLISION_CODES,
  describeNetworkError,
  isCidrCollisionCode,
  NETWORK_ERROR_COPY,
  networkErrorCode,
  networkErrorMessage,
  SUBNET_OVERLAPS_COPY,
} from './network-error-copy'

function httpError(status: number, code: string): Error {
  return new Error(`/api/client/v1/networks failed: HTTP ${status}: ${code}`)
}

describe('network-error-copy', () => {
  it('has a sentence for every collision code and names TurboFabric by product name', () => {
    for (const code of CIDR_COLLISION_CODES) {
      expect(NETWORK_ERROR_COPY[code]).toBeTruthy()
      expect(isCidrCollisionCode(code)).toBe(true)
    }
    expect(NETWORK_ERROR_COPY[CIDR_OVERLAPS_FABRIC_ERROR]).toContain(TURBOFABRIC_PRODUCT_NAME)
    expect(NETWORK_ERROR_COPY[CIDR_OVERLAPS_FABRIC_ERROR]).toContain('tp0')
    expect(NETWORK_ERROR_COPY[CIDR_OVERLAPS_FABRIC_POOL_ERROR]).toContain('container pool')
    expect(NETWORK_ERROR_COPY[CIDR_OVERLAPS_RESERVED_ERROR]).toContain('reserved range')
    expect(NETWORK_ERROR_COPY[CIDR_OVERLAPS_DOCKER_NETWORK_ERROR]).toContain('Docker')
    expect(NETWORK_ERROR_COPY[CIDR_OVERLAPS_GATEWAY_ADVERTISED_ERROR]).toContain('gateway')
    for (const copy of Object.values(NETWORK_ERROR_COPY)) {
      expect(copy).not.toMatch(/tp0 fabric|WireGuard mesh/i)
    }
    expect(isCidrCollisionCode('address_in_use')).toBe(false)
    expect(isCidrCollisionCode(null)).toBe(false)
  })

  it('keeps the existing subnet_overlaps wording', () => {
    expect(NETWORK_ERROR_COPY[SUBNET_OVERLAPS_ERROR]).toBe(SUBNET_OVERLAPS_COPY)
    expect(SUBNET_OVERLAPS_COPY).toBe(
      'That range overlaps an existing subnet in this organization.',
    )
  })

  it('reuses the managed failover-trust sentence instead of forking it', () => {
    expect(NETWORK_ERROR_COPY[FAILOVER_REQUIRES_TRUSTED_DATACENTER_ERROR]).toBe(
      FAILOVER_REQUIRES_TRUSTED_DATACENTER_COPY,
    )
    expect(
      managedErrorMessage(httpError(422, FAILOVER_REQUIRES_TRUSTED_DATACENTER_ERROR), 'x'),
    ).toBe(FAILOVER_REQUIRES_TRUSTED_DATACENTER_COPY)
  })

  it('extracts a known code from an apiFetch message and ignores human text', () => {
    expect(networkErrorCode(httpError(409, CIDR_OVERLAPS_RESERVED_ERROR))).toBe(
      CIDR_OVERLAPS_RESERVED_ERROR,
    )
    expect(networkErrorCode(httpError(400, NETWORK_CIDR_REQUIRED_ERROR))).toBe(
      NETWORK_CIDR_REQUIRED_ERROR,
    )
    expect(
      networkErrorCode(new Error('x failed: HTTP 400: Invalid addressPools base (entry 0)')),
    ).toBeNull()
    expect(networkErrorCode(new Error('offline'))).toBeNull()
    expect(networkErrorCode('nope')).toBeNull()
  })

  it('describes a typed collision with the conflicting range kept separate', () => {
    const err = new CidrCollisionError('/api/client/v1/networks', 409, {
      error: CIDR_OVERLAPS_DOCKER_NETWORK_ERROR,
      cidr: '10.200.0.0/16',
      conflictingCidr: '10.200.5.0/24',
      networkId: 'net-1',
    })
    expect(err.message).toContain(`HTTP 409: ${CIDR_OVERLAPS_DOCKER_NETWORK_ERROR}`)
    expect(err.cidr).toBe('10.200.0.0/16')
    expect(err.networkId).toBe('net-1')
    expect(err.datacenterId).toBeNull()
    expect(networkErrorCode(err)).toBe(CIDR_OVERLAPS_DOCKER_NETWORK_ERROR)

    const described = describeNetworkError(err, 'Failed')
    expect(described).toEqual({
      message: NETWORK_ERROR_COPY[CIDR_OVERLAPS_DOCKER_NETWORK_ERROR],
      code: CIDR_OVERLAPS_DOCKER_NETWORK_ERROR,
      conflictingCidr: '10.200.5.0/24',
    })
    expect(networkErrorMessage(err, 'Failed')).toBe(
      `${NETWORK_ERROR_COPY[CIDR_OVERLAPS_DOCKER_NETWORK_ERROR]} (10.200.5.0/24)`,
    )
  })

  it('falls back to the raw message, then the fallback, for unknown errors', () => {
    expect(describeNetworkError(new Error('boom'), 'Failed')).toEqual({
      message: 'boom',
      code: null,
      conflictingCidr: null,
    })
    expect(describeNetworkError(undefined, 'Failed')).toEqual({
      message: 'Failed',
      code: null,
      conflictingCidr: null,
    })
    expect(networkErrorMessage(httpError(400, DOCKER_NETWORK_MTU_INVALID_ERROR), 'x')).toBe(
      NETWORK_ERROR_COPY[DOCKER_NETWORK_MTU_INVALID_ERROR],
    )
  })
})
