import { describe, expect, it } from 'vitest'
import type { TlsRecord } from '@/lib/instance-api'
import { tlsDateLines, tlsStoredCopyLines } from './tls-managed-dates'

function row(status: string, notAfter: string, acme?: Record<string, string>): TlsRecord {
  return {
    id: 't1',
    organizationId: 'o1',
    name: null,
    source: 'lets_encrypt',
    metadata: {
      dnsNames: ['a.example.com'],
      hasWildcard: false,
      notBefore: '1970-01-01T00:00:00.000Z',
      notAfter,
      fingerprintSha256: '',
      subject: '',
      issuer: '',
      status,
      ...(acme ? { acme } : {}),
    },
  } as TlsRecord
}

describe('tlsDateLines', () => {
  it('shows the expiry of an uploaded or ready certificate and nothing when it has none', () => {
    expect(tlsDateLines(row('ready', '2027-01-02T03:04:05.000Z'), 'en-US')[0]).toMatch(/^Expires /)
    expect(tlsDateLines(row('ready', ''), 'en-US')).toEqual([])
  })

  it('never shows the placeholder expiry of a managed certificate', () => {
    const lines = tlsDateLines(row('automatic', '1970-01-01T00:00:00.000Z'), 'en-US')
    expect(lines).toEqual(['Waiting for the first certificate from the host.'])
  })

  it('shows the dates the host reported for a managed certificate', () => {
    const lines = tlsDateLines(
      row('automatic', '1970-01-01T00:00:00.000Z', {
        notAfter: '2027-01-02T03:04:05.000Z',
        lastIssuedAt: '2026-10-19T10:00:00.000Z',
      }),
      'en-US',
    )
    expect(lines).toHaveLength(2)
    expect(lines[0]).toMatch(/^Expires .*2027/)
    expect(lines[1]).toMatch(/^Last issued .*2026/)
  })
})

describe('tlsStoredCopyLines', () => {
  it('says nothing for a certificate that is not from Let\'s Encrypt or is revoked', () => {
    const upload = { ...row('ready', '2027-01-02T03:04:05.000Z'), source: 'upload' } as TlsRecord
    expect(tlsStoredCopyLines(upload)).toEqual([])
    expect(tlsStoredCopyLines({ ...row('revoked', ''), certificatePem: 'x' } as TlsRecord)).toEqual([])
  })

  it('says a copy is still to come while only the host has reported dates', () => {
    const lines = tlsStoredCopyLines(
      row('automatic', '1970-01-01T00:00:00.000Z', { notAfter: '2027-01-02T03:04:05.000Z' })
    )
    expect(lines).toEqual(['No copy stored yet. The host sends one after its next check.'])
    expect(tlsStoredCopyLines(row('automatic', '1970-01-01T00:00:00.000Z'))).toEqual([])
  })

  it('shows the stored copy with its issuer and start date, and never a key', () => {
    const stored = {
      ...row('automatic', '2027-01-02T03:04:05.000Z'),
      certificatePem: '-----BEGIN CERTIFICATE-----',
    } as TlsRecord
    stored.metadata = { ...stored.metadata, issuer: 'R11', notBefore: '2026-10-19T10:00:00.000Z' }
    const lines = tlsStoredCopyLines(stored, 'en-US')
    expect(lines[0]).toBe('A copy of the certificate and its key is stored encrypted.')
    expect(lines).toContain('Issued by R11')
    expect(lines.some((l) => l.startsWith('Valid from '))).toBe(true)
    expect(lines.join(' ').toLowerCase()).not.toContain('private key pem')
  })
})
