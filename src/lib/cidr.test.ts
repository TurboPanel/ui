import { describe, expect, it } from 'vitest'
import {
  addressFamilyLabel,
  addressInCidr,
  cidrsOverlap,
  inferSiteCidrFromAddress,
  ipVersionOf,
  isValidCidr,
  normalizeCidr,
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

describe('ipVersionOf and addressFamilyLabel', () => {
  it('classifies IPv4, IPv6, and garbage', () => {
    expect(ipVersionOf('203.0.113.10')).toBe(4)
    expect(addressFamilyLabel('203.0.113.10')).toBe('IPv4')
    expect(ipVersionOf('2001:db8::5')).toBe(6)
    expect(addressFamilyLabel('2001:db8::5')).toBe('IPv6')
    expect(ipVersionOf('not-an-ip')).toBeNull()
    expect(addressFamilyLabel('not-an-ip')).toBeNull()
    expect(ipVersionOf('')).toBeNull()
    expect(addressFamilyLabel('')).toBeNull()
  })
})

describe('normalizeCidr', () => {
  it('aligns host addresses to the network form', () => {
    expect(normalizeCidr('10.0.0.5/24')).toBe('10.0.0.0/24')
    expect(normalizeCidr('2001:db8::5/64')).toBe('2001:db8::/64')
    expect(normalizeCidr('not-a-cidr')).toBeNull()
  })
})

describe('cidrsOverlap', () => {
  it('detects containment and rejects cross-family or disjoint ranges', () => {
    expect(cidrsOverlap('10.0.0.0/16', '10.0.0.0/24')).toBe(true)
    expect(cidrsOverlap('203.0.113.0/24', '203.0.113.128/25')).toBe(true)
    expect(cidrsOverlap('203.0.113.0/24', '2001:db8::/32')).toBe(false)
    expect(cidrsOverlap('203.0.113.0/24', '198.51.100.0/24')).toBe(false)
  })
})
