import { describe, expect, it } from 'vitest'
import {
  CONNECTING_ADDRESS_MAX_CHARS,
  DIRECT_ATTACH_SENTINEL,
  LOCAL_SOCKET_LABEL,
  normalizePeerAddress,
  serverConnectingAddress,
  truncateMiddle,
} from '@/lib/server-connecting-address'

const base = {
  remoteAddress: null,
  address: null,
  addressSource: null,
  colocatedWithInstance: false,
} as const

describe('normalizePeerAddress', () => {
  it('returns empty for missing or blank input', () => {
    expect(normalizePeerAddress(undefined)).toBe('')
    expect(normalizePeerAddress(null)).toBe('')
    expect(normalizePeerAddress('   ')).toBe('')
  })

  it('keeps a plain IPv4 or IPv6 address', () => {
    expect(normalizePeerAddress(' 203.0.113.7 ')).toBe('203.0.113.7')
    expect(normalizePeerAddress('2001:db8::1')).toBe('2001:db8::1')
  })

  it('strips a port, brackets, a zone id and the IPv4-mapped prefix', () => {
    expect(normalizePeerAddress('203.0.113.7:51234')).toBe('203.0.113.7')
    expect(normalizePeerAddress('[2001:db8::1]:443')).toBe('2001:db8::1')
    expect(normalizePeerAddress('[2001:db8::1]')).toBe('2001:db8::1')
    expect(normalizePeerAddress('fe80::1%eth0')).toBe('fe80::1')
    expect(normalizePeerAddress('::ffff:198.51.100.4')).toBe('198.51.100.4')
  })
})

describe('truncateMiddle', () => {
  it('leaves short values alone', () => {
    expect(truncateMiddle('203.0.113.7')).toBe('203.0.113.7')
  })

  it('keeps both ends of a long value within the limit', () => {
    const long = '2001:0db8:85a3:0000:0000:8a2e:0370:7334'
    const out = truncateMiddle(long)
    expect(out).toHaveLength(CONNECTING_ADDRESS_MAX_CHARS)
    expect(out.startsWith('2001:0db8:85a')).toBe(true)
    expect(out.endsWith('0370:7334')).toBe(true)
    expect(out).toContain('…')
  })

  it('honours a custom limit', () => {
    expect(truncateMiddle('abcdefghij', 5)).toBe('ab…ij')
  })
})

describe('serverConnectingAddress', () => {
  it('prefers the observed remote address', () => {
    expect(
      serverConnectingAddress({
        ...base,
        remoteAddress: '203.0.113.7',
        address: '10.0.0.5',
        addressSource: 'interface',
      })
    ).toEqual({ kind: 'ip', text: '203.0.113.7', full: '203.0.113.7' })
  })

  it('falls back to address only when it was observed on the wire', () => {
    expect(
      serverConnectingAddress({ ...base, address: '198.51.100.9', addressSource: 'observed' })
    ).toEqual({ kind: 'ip', text: '198.51.100.9', full: '198.51.100.9' })
    expect(
      serverConnectingAddress({ ...base, address: '10.0.0.5', addressSource: 'interface' })
    ).toBeNull()
  })

  it('shows the local socket for a co-located daemon', () => {
    for (const server of [
      { ...base, remoteAddress: DIRECT_ATTACH_SENTINEL },
      { ...base, addressSource: 'local' as const },
      { ...base, colocatedWithInstance: true },
    ]) {
      const out = serverConnectingAddress(server)
      expect(out?.kind).toBe('local')
      expect(out?.text).toBe(LOCAL_SOCKET_LABEL)
      expect(out?.full).toMatch(/local socket/)
    }
  })

  it('middle-truncates a long IPv6 address but keeps the full value', () => {
    const v6 = '2001:0db8:85a3:0000:0000:8a2e:0370:7334'
    const out = serverConnectingAddress({ ...base, remoteAddress: `[${v6}]:443` })
    expect(out?.kind).toBe('ip')
    expect(out?.full).toBe(v6)
    expect(out?.text).toHaveLength(CONNECTING_ADDRESS_MAX_CHARS)
  })

  it('is null when nothing is known', () => {
    expect(serverConnectingAddress(base)).toBeNull()
    expect(serverConnectingAddress({ ...base, remoteAddress: '  ' })).toBeNull()
  })
})
