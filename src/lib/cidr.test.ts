import { describe, expect, it } from 'vitest'
import {
  addressInCidr,
  inferSiteCidrFromAddress,
  isValidCidr,
} from './cidr'

describe('inferSiteCidrFromAddress', () => {
  it('aligns IPv4 hosts to a /24 LAN', () => {
    expect(inferSiteCidrFromAddress('10.0.0.5')).toBe('10.0.0.0/24')
    expect(inferSiteCidrFromAddress('192.168.1.40')).toBe('192.168.1.0/24')
    expect(inferSiteCidrFromAddress('203.0.113.10')).toBe('203.0.113.0/24')
  })

  it('aligns IPv6 hosts to a /64 LAN', () => {
    expect(inferSiteCidrFromAddress('fd00::1')).toBe('fd00::/64')
    expect(inferSiteCidrFromAddress('fd12:3456:789a:1:2::3')).toBe(
      'fd12:3456:789a:1::/64',
    )
  })

  it('rejects invalid addresses', () => {
    expect(inferSiteCidrFromAddress('')).toBeNull()
    expect(inferSiteCidrFromAddress('not-an-ip')).toBeNull()
    expect(inferSiteCidrFromAddress('10.0.0')).toBeNull()
  })
})

describe('addressInCidr', () => {
  it('validates IPv4 membership and rejects bad CIDRs', () => {
    expect(isValidCidr('10.0.0.0/24')).toBe(true)
    expect(isValidCidr('not-a-cidr')).toBe(false)
    expect(addressInCidr('10.0.0.50', '10.0.0.0/24')).toBe(true)
    expect(addressInCidr('10.0.1.50', '10.0.0.0/24')).toBe(false)
    expect(addressInCidr('203.0.113.10', '203.0.113.0/24')).toBe(true)
  })
})
