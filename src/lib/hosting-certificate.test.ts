import { describe, expect, it } from 'vitest'
import {
  describeCertificate,
  dnsResultHeadline,
  dnsSummaryLines,
  formatDaysLeft,
} from './hosting-certificate'
import type { HostingCertificate, HostingDnsReport } from './instance-api'

function cert(overrides: Partial<HostingCertificate>): HostingCertificate {
  return {
    state: 'test_certificate',
    source: 'test',
    expiresAt: null,
    expiresInDays: null,
    renewsAutomatically: false,
    lastError: null,
    lastIssuedAt: null,
    uploadedExpiryWarning: 'none',
    dns: null,
    letsEncryptAvailable: false,
    wwwRedirect: false,
    needsDeploy: false,
    ...overrides,
  }
}

const DNS_NOT_READY: HostingDnsReport = {
  ready: false,
  checkedAt: '2026-10-04T12:00:00.000Z',
  hostnames: [
    { hostname: 'shop.example.com', resolves: false, addresses: [] },
    { hostname: 'www.shop.example.com', resolves: false, addresses: ['198.51.100.4'] },
    { hostname: 'ok.example.com', resolves: true, addresses: ['203.0.113.7'] },
  ],
  expectedAddresses: ['203.0.113.7'],
}

describe('formatDaysLeft', () => {
  it('words the days', () => {
    expect(formatDaysLeft(null)).toBeNull()
    expect(formatDaysLeft(-2)).toBe('expired')
    expect(formatDaysLeft(0)).toBe('expires today')
    expect(formatDaysLeft(1)).toBe('expires in 1 day')
    expect(formatDaysLeft(61)).toBe('expires in 61 days')
  })
})

describe('describeCertificate', () => {
  it('test certificate warns, and offers Let’s Encrypt only when available', () => {
    const off = describeCertificate(cert({}))
    expect(off.label).toBe('Test certificate')
    expect(off.lines).toEqual(['Browsers will warn visitors.'])
    expect(off.actions).toEqual([])
    expect(describeCertificate(cert({ letsEncryptAvailable: true })).actions).toEqual([
      'use_lets_encrypt',
    ])
  })

  it('uploaded says who renews and warns near expiry', () => {
    const calm = describeCertificate(
      cert({ state: 'uploaded', source: 'uploaded', expiresInDays: 90 }),
    )
    expect(calm.tone).toBe('neutral')
    expect(calm.lines).toEqual(['expires in 90 days', 'You renew this one.'])
    const soon = describeCertificate(
      cert({ state: 'uploaded', expiresInDays: 3, uploadedExpiryWarning: '3d' }),
    )
    expect(soon.tone).toBe('warning')
    expect(soon.lines.at(-1)).toContain('three days')
    const gone = describeCertificate(
      cert({ state: 'uploaded', expiresInDays: -1, uploadedExpiryWarning: 'expired' }),
    )
    expect(gone.lines.at(-1)).toContain('run out')
  })

  it('secure says it renews by itself', () => {
    const view = describeCertificate(
      cert({ state: 'secure', source: 'lets_encrypt', expiresInDays: 61 }),
    )
    expect(view.label).toBe('Secure')
    expect(view.tone).toBe('good')
    expect(view.lines).toEqual(['Let’s Encrypt, renews automatically.', 'expires in 61 days'])
    expect(view.actions).toEqual([])
  })

  it('waiting for DNS offers Check DNS and lists what is wrong', () => {
    const view = describeCertificate(cert({ state: 'waiting_for_dns', dns: DNS_NOT_READY }))
    expect(view.label).toBe('Waiting for DNS')
    expect(view.actions).toEqual(['check_dns'])
    expect(view.lines).toContain('shop.example.com: no DNS record found.')
    expect(view.lines).toContain('www.shop.example.com: points to 198.51.100.4.')
    expect(view.lines).toContain('Point it at 203.0.113.7.')
    expect(view.lines.join(' ')).not.toContain('ok.example.com')
  })

  it('issuing spins, or asks for a redeploy when one is due', () => {
    const working = describeCertificate(cert({ state: 'issuing' }))
    expect(working.spinner).toBe(true)
    const deploy = describeCertificate(cert({ state: 'issuing', needsDeploy: true }))
    expect(deploy.spinner).toBe(false)
    expect(deploy.lines).toEqual(['Redeploy this environment to start it.'])
  })

  it('renewal failed is loud, shows the reason and both actions', () => {
    const renewal = describeCertificate(
      cert({
        state: 'renewal_failed',
        lastError: 'HTTP 404 on challenge',
        lastIssuedAt: '2026-09-01T00:00:00.000Z',
      }),
    )
    expect(renewal.label).toBe('Renewal failed')
    expect(renewal.tone).toBe('bad')
    expect(renewal.reason).toBe('HTTP 404 on challenge')
    expect(renewal.actions).toEqual(['check_dns', 'try_again'])
    const first = describeCertificate(cert({ state: 'renewal_failed', lastError: 'DNS' }))
    expect(first.label).toBe('Couldn’t get a certificate')
  })
})

describe('dns wording', () => {
  it('headline and a clean report', () => {
    expect(dnsResultHeadline(DNS_NOT_READY)).toBe('DNS is not ready yet.')
    const ready = { ...DNS_NOT_READY, ready: true, hostnames: [DNS_NOT_READY.hostnames[2]!] }
    expect(dnsResultHeadline(ready)).toBe('Every name points at this server.')
    expect(dnsSummaryLines(ready)).toEqual([])
  })
})
