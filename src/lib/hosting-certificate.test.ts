import { describe, expect, it, vi } from 'vitest'
import {
  CERTIFICATE_DNS_POLL_MS,
  CERTIFICATE_ISSUING_POLL_MS,
  certificatePollInterval,
  hostingSaveNote,
  describeCertificate,
  dnsResultHeadline,
  dnsSummaryLines,
  formatDaysLeft,
  certificateAfterSave,
  letsEncryptRefusal,
  withCertificateRefusal,
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
    www: 'off',
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
  it('self-signed certificate warns, and offers Let’s Encrypt only when available', () => {
    const off = describeCertificate(cert({}))
    expect(off.label).toBe('Self-signed certificate')
    expect(off.lines).toEqual(['Browsers will warn visitors.'])
    expect(off.actions).toEqual([])
    expect(describeCertificate(cert({ letsEncryptAvailable: true })).actions).toEqual([
      'use_lets_encrypt',
    ])
  })

  it('uploaded says who renews and warns near expiry', () => {
    const calm = describeCertificate(
      cert({ state: 'uploaded', source: 'uploaded', expiresInDays: 90 })
    )
    expect(calm.tone).toBe('neutral')
    expect(calm.lines).toEqual(['expires in 90 days', 'You renew this one.'])
    const soon = describeCertificate(
      cert({ state: 'uploaded', expiresInDays: 3, uploadedExpiryWarning: '3d' })
    )
    expect(soon.tone).toBe('warning')
    expect(soon.lines.at(-1)).toContain('three days')
    const gone = describeCertificate(
      cert({ state: 'uploaded', expiresInDays: -1, uploadedExpiryWarning: 'expired' })
    )
    expect(gone.lines.at(-1)).toContain('run out')
  })

  it('secure says it renews by itself', () => {
    const view = describeCertificate(
      cert({ state: 'secure', source: 'lets_encrypt', expiresInDays: 61 })
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
    expect(view.lines).toContain(
      'shop.example.com doesn’t point at this server yet: no DNS record found.'
    )
    expect(view.lines).toContain(
      'www.shop.example.com doesn’t point at this server yet: it points to 198.51.100.4.'
    )
    expect(view.lines).toContain('Point them at 203.0.113.7.')
    expect(view.lines.join(' ')).not.toContain('ok.example.com')
  })

  it('issuing spins, or asks for a redeploy when one is due', () => {
    const working = describeCertificate(cert({ state: 'issuing' }))
    expect(working.spinner).toBe(true)
    const deploy = describeCertificate(cert({ state: 'issuing', needsDeploy: true }))
    expect(deploy.spinner).toBe(false)
    expect(deploy.lines).toEqual([
      'Deploy this environment to start it. The certificate is requested during the deploy.',
    ])
    expect(deploy.actions).toEqual(['deploy'])
    expect(working.actions).toEqual([])
  })

  it('renewal failed is loud, shows the reason and both actions', () => {
    const renewal = describeCertificate(
      cert({
        state: 'renewal_failed',
        lastError: 'HTTP 404 on challenge',
        lastIssuedAt: '2026-09-01T00:00:00.000Z',
      })
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
    const oneWrong = { ...DNS_NOT_READY, hostnames: [DNS_NOT_READY.hostnames[0]!] }
    expect(dnsSummaryLines(oneWrong).at(-1)).toBe('Point it at 203.0.113.7.')
  })
})

describe('letsEncryptRefusal', () => {
  const refused = (status: number, code: string, message?: string) =>
    new Error(
      `/hostings/h/use-letsencrypt failed: HTTP ${status}: ${code}${message ? ` \u2014 ${message}` : ''}`
    )

  it('says Let’s Encrypt is off for the organization and offers its settings', () => {
    expect(letsEncryptRefusal(refused(403, 'lets_encrypt_not_enabled'))).toEqual({
      message:
        'Let’s Encrypt is turned off for this organization. An owner can turn it on in Organization settings › Domains & certificates.',
      openSettings: true,
    })
  })

  it.each([
    ['hosting_not_http', 'web domains'],
    ['hosting_has_no_hostnames', 'Add a domain name'],
    ['acme_requires_public_bind', 'reachable from the internet'],
    ['letsencrypt_hostname_unsupported', 'wildcard'],
  ])('puts %s in plain words, with no settings link', (code, fragment) => {
    const refusal = letsEncryptRefusal(refused(400, code))
    expect(refusal.message).toContain(fragment)
    expect(refusal.message).not.toContain(code)
    expect(refusal.openSettings).toBe(false)
  })

  it('keeps the server’s sentence for a www clash, which names the hosts', () => {
    const message = 'www.shop.example.com is already a domain in this environment.'
    expect(letsEncryptRefusal(refused(400, 'www_redirect_conflict', message)).message).toBe(message)
    expect(letsEncryptRefusal(refused(400, 'www_redirect_conflict')).message).toContain(
      'www version'
    )
  })

  it('says a plain permission refusal in words, not the raw request line', () => {
    expect(
      letsEncryptRefusal(new Error('/hostings/h/use-letsencrypt failed: HTTP 403: Forbidden'))
    ).toEqual({ message: 'Could not start Let’s Encrypt.', openSettings: false })
  })

  it('falls back to a plain sentence for anything else', () => {
    expect(letsEncryptRefusal(undefined).message).toBe('Could not start Let’s Encrypt.')
  })
})

describe('withCertificateRefusal', () => {
  it('replaces a hosting’s refusal and clears it after a success', () => {
    const refusal = { message: 'Off', openSettings: true }
    const one = withCertificateRefusal({}, 'h1', refusal)
    expect(one).toEqual({ h1: refusal })
    expect(withCertificateRefusal(one, 'h2', refusal)).toEqual({ h1: refusal, h2: refusal })
    expect(withCertificateRefusal(one, 'h1', null)).toEqual({})
  })
})

describe('certificateAfterSave', () => {
  const off = new Error('/hostings/h1/use-letsencrypt failed: HTTP 403: lets_encrypt_not_enabled')

  it('asks for the certificate when the box was ticked and keeps the refusal', async () => {
    const request = vi.fn(() => Promise.resolve({ ok: false as const, cause: off }))
    const step = await certificateAfterSave({ hostingId: 'h1', wantsCertificate: true, request })
    expect(request).toHaveBeenCalledWith('h1')
    expect(step?.hostingId).toBe('h1')
    expect(step?.refusal?.openSettings).toBe(true)
  })

  it('clears an old refusal on a save without the box, without asking again', async () => {
    const request = vi.fn()
    const step = await certificateAfterSave({ hostingId: 'h1', wantsCertificate: false, request })
    expect(request).not.toHaveBeenCalled()
    expect(step).toEqual({ hostingId: 'h1', refusal: null })
    const before = withCertificateRefusal({}, 'h1', letsEncryptRefusal(off))
    expect(withCertificateRefusal(before, 'h1', step?.refusal ?? null)).toEqual({})
  })

  it('clears it after a request that went through, and skips a hosting with no id', async () => {
    const ok = vi.fn(() => Promise.resolve({ ok: true as const }))
    expect(
      await certificateAfterSave({ hostingId: 'h1', wantsCertificate: true, request: ok })
    ).toEqual({ hostingId: 'h1', refusal: null })
    expect(
      await certificateAfterSave({ hostingId: null, wantsCertificate: true, request: ok })
    ).toBeNull()
  })
})

describe('certificatePollInterval', () => {
  it('follows a certificate the server is still issuing or waiting on', () => {
    expect(certificatePollInterval(cert({ state: 'issuing' }))).toBe(CERTIFICATE_ISSUING_POLL_MS)
    expect(certificatePollInterval(cert({ state: 'waiting_for_dns' }))).toBe(
      CERTIFICATE_DNS_POLL_MS
    )
  })

  it('does not poll one that waits for a deploy, has settled, or is not loaded', () => {
    expect(certificatePollInterval(cert({ state: 'issuing', needsDeploy: true }))).toBe(false)
    expect(certificatePollInterval(cert({ state: 'secure' }))).toBe(false)
    expect(certificatePollInterval(cert({}))).toBe(false)
    expect(certificatePollInterval(null)).toBe(false)
    expect(certificatePollInterval(undefined)).toBe(false)
  })
})

describe('hostingSaveNote', () => {
  it('says the save went through, and that Let\u2019s Encrypt was asked', () => {
    expect(hostingSaveNote(false, null)).toEqual({ tone: 'ok', message: 'Saved.' })
    expect(hostingSaveNote(true, null)).toEqual({
      tone: 'ok',
      message: 'Saved. Let\u2019s Encrypt was asked for a certificate.',
    })
  })

  it('says the hostname saved but the certificate did not start, with the reason', () => {
    const note = hostingSaveNote(true, { message: 'DNS is not ready yet.', openSettings: false })
    expect(note.tone).toBe('error')
    expect(note.message).toContain('Saved the hostname')
    expect(note.message).toContain('DNS is not ready yet.')
  })
})
