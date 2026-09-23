import { describe, expect, it } from 'vitest'
import {
  certificateSourceEligibility,
  hostnameStatusPresentation,
  http01PreflightPresentation,
  INSTANCE_HOSTNAME_SOURCE_LABELS,
  lockoutWarning,
  requiresPlatformCaConfirm,
} from '@/lib/instance-certificates'

const CAPABLE = { 'instance-cert-sources-per-hostname': true }

describe('INSTANCE_HOSTNAME_SOURCE_LABELS', () => {
  it('names Platform CA, Uploaded, and Let\'s Encrypt', () => {
    expect(INSTANCE_HOSTNAME_SOURCE_LABELS['platform-ca']).toBe('Platform CA')
    expect(INSTANCE_HOSTNAME_SOURCE_LABELS.uploaded).toBe('Uploaded')
    expect(INSTANCE_HOSTNAME_SOURCE_LABELS['lets-encrypt']).toBe("Let's Encrypt")
  })
})

describe('hostnameStatusPresentation', () => {
  it('pairs a tone with a label and an expiry line', () => {
    expect(
      hostnameStatusPresentation({
        status: 'ready',
        notAfter: '2026-12-01T00:00:00.000Z',
      }),
    ).toEqual({
      dot: 'online',
      badge: 'ok',
      label: 'Ready',
      expiry: '2026-12-01',
    })
    expect(
      hostnameStatusPresentation({ status: 'pending', notAfter: null }).label,
    ).toBe('Pending')
    expect(
      hostnameStatusPresentation({ status: 'failed', notAfter: null }).dot,
    ).toBe('failed')
    expect(
      hostnameStatusPresentation({ status: 'expired', notAfter: null }).label,
    ).toBe('Expired')
    expect(
      hostnameStatusPresentation({ status: 'ready', notAfter: null }).expiry,
    ).toBe('No expiry')
  })
})

describe('certificateSourceEligibility', () => {
  it('refuses uploaded and Let\'s Encrypt when the daemon cannot render them', () => {
    const refused = certificateSourceEligibility('panel.example.com', {
      certificates: [{ dnsNames: ['panel.example.com'] }],
      capabilities: { 'instance-cert-sources-per-hostname': false },
    })
    expect(refused.uploaded).toContain('too old')
    expect(refused['lets-encrypt']).toContain('too old')
  })

  it('refuses Let\'s Encrypt for private and wildcard names', () => {
    const privateName = certificateSourceEligibility('panel.lan', {
      certificates: [],
      capabilities: CAPABLE,
    })
    expect(privateName['lets-encrypt']).toContain('private')
    const wildcard = certificateSourceEligibility('*.example.com', {
      certificates: [{ dnsNames: ['*.example.com'] }],
      capabilities: CAPABLE,
    })
    expect(wildcard['lets-encrypt']).toContain('wildcard')
    expect(wildcard.uploaded).toBeUndefined()
  })

  it('refuses an uploaded source nothing covers', () => {
    const refused = certificateSourceEligibility('panel.example.com', {
      certificates: [{ dnsNames: ['other.example.com'] }],
      capabilities: CAPABLE,
    })
    expect(refused.uploaded).toContain('No uploaded certificate')
    expect(refused['lets-encrypt']).toBeUndefined()
  })
})

describe('lockoutWarning', () => {
  const current = [{ host: 'panel.example.com', source: 'platform-ca' as const }]

  it('is quiet when nothing changes', () => {
    expect(lockoutWarning(current, current)).toBeNull()
  })

  it('names the Platform CA recovery address on :8443', () => {
    const warning = lockoutWarning(current, [
      { host: 'panel.example.com', source: 'lets-encrypt' },
    ])
    expect(warning).toContain('https://panel.example.com:8443')
    expect(warning).toContain('Platform CA')
  })
})

describe('requiresPlatformCaConfirm', () => {
  it('confirms when the last Platform CA hostname is removed', () => {
    expect(
      requiresPlatformCaConfirm(
        [{ host: 'panel.example.com', source: 'platform-ca' }],
        [],
      ),
    ).toBe(true)
  })

  it('confirms when the only routable name leaves the Platform CA', () => {
    expect(
      requiresPlatformCaConfirm(
        [
          { host: 'panel.lan', source: 'platform-ca' },
          { host: 'panel.example.com', source: 'platform-ca' },
        ],
        [
          { host: 'panel.lan', source: 'platform-ca' },
          { host: 'panel.example.com', source: 'lets-encrypt' },
        ],
      ),
    ).toBe(true)
  })

  it('stays quiet when a Platform CA name remains', () => {
    expect(
      requiresPlatformCaConfirm(
        [
          { host: 'a.example.com', source: 'platform-ca' },
          { host: 'b.example.com', source: 'platform-ca' },
        ],
        [{ host: 'a.example.com', source: 'platform-ca' }],
      ),
    ).toBe(false)
  })
})

describe('http01PreflightPresentation', () => {
  it('reports a failed nonce check separately from later issuance', () => {
    const failed = http01PreflightPresentation({
      source: 'lets-encrypt',
      acmeLastError:
        'Let\'s Encrypt HTTP-01 preflight failed for panel.example.com: http://panel.example.com/.well-known/acme-challenge/abc did not reach 127.0.0.1:8880 (HTTP 404)',
      acmeLastAttemptAt: '2026-09-22T00:00:00.000Z',
    })
    expect(failed?.kind).toBe('failed')
    expect(failed?.text.includes('127.0.0.1:8880')).toBe(true)

    const issued = http01PreflightPresentation({
      source: 'lets-encrypt',
      acmeLastError: 'rate limited',
      acmeLastAttemptAt: '2026-09-22T00:00:00.000Z',
    })
    expect(issued).toEqual({
      kind: 'passed',
      text: 'HTTP-01 preflight passed before issuance was attempted.',
    })
  })

  it('stays unrecorded until an attempt exists and ignores other sources', () => {
    expect(http01PreflightPresentation({
      source: 'lets-encrypt',
      acmeLastError: null,
      acmeLastAttemptAt: null,
    })?.kind).toBe('unrecorded')
    expect(http01PreflightPresentation({
      source: 'platform-ca',
      acmeLastError: null,
      acmeLastAttemptAt: null,
    })).toBeNull()
  })
})
