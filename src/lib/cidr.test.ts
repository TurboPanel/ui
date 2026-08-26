import { describe, expect, it } from 'vitest'
import {
  addressFamilyLabel,
  addressInCidr,
  cidrsOverlap,
  formatCidr,
  inferSiteCidrFromAddress,
  ipVersionOf,
  isValidCidr,
  normalizeCidr,
  parseCidr,
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

  it('rejects invalid CIDRs and treats equal /32 hosts as overlapping', () => {
    expect(cidrsOverlap('not-a-cidr', '10.0.0.0/24')).toBe(false)
    expect(cidrsOverlap('203.0.113.10/32', '203.0.113.10/32')).toBe(true)
    expect(cidrsOverlap('203.0.113.10/32', '203.0.113.11/32')).toBe(false)
  })
})

describe('parseCidr and formatCidr', () => {
  it('parses fully expanded IPv6 without compression', () => {
    const parsed = parseCidr('2001:0db8:0000:0000:0000:0000:0000:0001/128')
    expect(parsed).not.toBeNull()
    expect(parsed?.version).toBe(6)
    expect(parsed?.prefix).toBe(128)
    expect(formatCidr(parsed!)).toBe('2001:db8::1/128')
  })

  it('rejects malformed IPv6 hextets and overlong expansions', () => {
    expect(ipVersionOf('gggg::1')).toBeNull()
    expect(ipVersionOf('1:2:3:4:5:6:7:8:9')).toBeNull()
    expect(ipVersionOf('1:2:3:4:5:6:7::8:9')).toBeNull()
    expect(parseCidr('2001:db8::/abc')).toBeNull()
    expect(parseCidr('203.0.113.0/33')).toBeNull()
    expect(parseCidr('2001:db8::/129')).toBeNull()
    expect(parseCidr('/24')).toBeNull()
    expect(parseCidr('203.0.113.0/')).toBeNull()
  })

  it('formats IPv6 with zero runs at start, middle, and end', () => {
    expect(formatCidr(parseCidr('0:0:0:0:0:0:0:1/128')!)).toBe('::1/128')
    expect(formatCidr(parseCidr('2001:db8:0:0:1:0:0:1/128')!)).toBe(
      '2001:db8::1:0:0:1/128',
    )
    expect(formatCidr(parseCidr('2001:db8:1:2:3:4:0:0/128')!)).toBe(
      '2001:db8:1:2:3:4::/128',
    )
    expect(formatCidr(parseCidr('0:0:0:0:0:0:0:0/128')!)).toBe('::/128')
  })

  it('checks hostBits=0 membership and rejects cross-family addresses', () => {
    expect(addressInCidr('203.0.113.10', '203.0.113.10/32')).toBe(true)
    expect(addressInCidr('203.0.113.11', '203.0.113.10/32')).toBe(false)
    expect(addressInCidr('2001:db8::1', '203.0.113.0/24')).toBe(false)
    expect(addressInCidr('not-an-ip', '203.0.113.0/24')).toBe(false)
  })
})
