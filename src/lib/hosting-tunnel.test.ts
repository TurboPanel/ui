import { describe, expect, it } from 'vitest'
import {
  INTERNAL_CERTIFICATE_LABEL,
  LETS_ENCRYPT_CERTIFICATE_LABEL,
  MIXED_CERTIFICATES_LABEL,
  ORIGIN_CERTIFICATE_LABEL,
  PINNED_CERTIFICATE_LABEL,
  tunnelOnlyCertificateSummary,
  tunnelOnlyCertificateView,
  tunnelOnlyOf,
} from '@/lib/hosting-tunnel'

const path = (hostname: string, tunnelOnly: boolean) => ({
  hostname,
  tunnelId: 't1',
  tunnelName: 'edge',
  provider: 'cloudflare',
  tunnelOnly,
  originVerified: false,
  status: 'live',
})

describe('tunnelOnlyOf', () => {
  it('is tunnel-only when every name is a tunnel-only path of the hosting', () => {
    expect(tunnelOnlyOf(['A.example'], new Map(), { tunnels: [path('a.example', true)] })).toEqual({
      tunnelNames: ['edge'],
    })
  })

  it('is not when a name is also served directly or unknown', () => {
    expect(
      tunnelOnlyOf(['a.example'], new Map(), { tunnels: [path('a.example', false)] })
    ).toBeNull()
    expect(
      tunnelOnlyOf(['a.example', 'b.example'], new Map(), { tunnels: [path('a.example', true)] })
    ).toBeNull()
    expect(tunnelOnlyOf([], new Map())).toBeNull()
  })

  it('reads names from the organization lookup', () => {
    expect(tunnelOnlyOf(['a.example'], new Map([['a.example', 'edge']]))).toEqual({
      tunnelNames: ['edge'],
    })
  })
})

describe('tunnelOnlyCertificateView', () => {
  it('requests nothing and does not spin or warn', () => {
    const view = tunnelOnlyCertificateView({ tunnelNames: ['edge'] })
    expect(view.label).toBe('Internal certificate')
    expect(view.actions).toEqual([])
    expect(view.spinner).toBe(false)
    expect(view.lines.join(' ')).not.toMatch(/warn|Let’s Encrypt/)
  })
})

describe('tunnelOnlyCertificateView follows the name’s certificate', () => {
  const tunnel = { tunnelNames: ['edge'] }
  const pick = (
    certificate:
      'cloudflare_origin' | 'letsencrypt_http' | 'letsencrypt_dns' | 'self_signed' | 'library',
    tlsId: string | null = null,
    extra: Record<string, unknown> = {}
  ) => ({ hostname: 'a.example', certificate, tlsId, ...extra })

  it('says internal for a self-signed name and when no choice is known', () => {
    expect(tunnelOnlyCertificateView(tunnel, [pick('self_signed')]).label).toBe(
      INTERNAL_CERTIFICATE_LABEL
    )
    expect(tunnelOnlyCertificateView(tunnel).label).toBe(INTERNAL_CERTIFICATE_LABEL)
  })

  it('says origin certificate once issued', () => {
    const view = tunnelOnlyCertificateView(tunnel, [pick('cloudflare_origin', 'tls-1')])
    expect(view.label).toBe(ORIGIN_CERTIFICATE_LABEL)
    expect(view.tone).toBe('good')
    expect(view.lines.join(' ')).toContain('Issued')
  })

  it('says origin certificate is waiting, with the reason', () => {
    const issue = {
      code: 'no_badge',
      message: 'm',
      failedAt: '2030-01-02T03:04:05.000Z',
      attempts: 2,
      nextTryAt: null,
    }
    const view = tunnelOnlyCertificateView(tunnel, [
      pick('cloudflare_origin', null, { originCertificateIssue: issue }),
    ])
    expect(view.label).toBe(ORIGIN_CERTIFICATE_LABEL)
    expect(view.tone).toBe('pending')
    expect(view.lines.join(' ')).toContain(
      'Waiting for the origin certificate. No Cloudflare token'
    )
    const plain = tunnelOnlyCertificateView(tunnel, [pick('cloudflare_origin')])
    expect(plain.lines.join(' ')).toContain('Waiting for the origin certificate to be issued')
  })

  it('says pinned for a library certificate and Let’s Encrypt for either challenge', () => {
    expect(tunnelOnlyCertificateView(tunnel, [pick('library', 'lib-1')]).label).toBe(
      PINNED_CERTIFICATE_LABEL
    )
    for (const kind of ['letsencrypt_http', 'letsencrypt_dns'] as const) {
      expect(tunnelOnlyCertificateView(tunnel, [pick(kind)]).label).toBe(
        LETS_ENCRYPT_CERTIFICATE_LABEL
      )
    }
  })

  it('lists the names one by one when they chose different certificates', () => {
    const view = tunnelOnlyCertificateView(tunnel, [
      pick('cloudflare_origin', 'tls-1'),
      { ...pick('letsencrypt_http'), hostname: 'b.example' },
    ])
    expect(view.label).toBe(MIXED_CERTIFICATES_LABEL)
    expect(view.lines.some((line) => line.startsWith('a.example: Issued'))).toBe(true)
    expect(view.lines.some((line) => line.startsWith('b.example: The tunnel reaches'))).toBe(true)
    expect(view.actions).toEqual([])
    expect(view.spinner).toBe(false)
  })

  it('does not show good while one origin name is issued and another waits', () => {
    const issue = {
      code: 'no_badge',
      message: 'm',
      failedAt: '2030-01-02T03:04:05.000Z',
      attempts: 1,
      nextTryAt: null,
    }
    const view = tunnelOnlyCertificateView(tunnel, [
      pick('cloudflare_origin', 'tls-1'),
      {
        ...pick('cloudflare_origin', null, { originCertificateIssue: issue }),
        hostname: 'b.example',
      },
    ])
    expect(view.label).toBe(ORIGIN_CERTIFICATE_LABEL)
    expect(view.tone).toBe('pending')
    expect(view.lines.some((line) => line.startsWith('a.example: Issued'))).toBe(true)
    expect(
      view.lines.some((line) =>
        line.startsWith('b.example: Waiting for the origin certificate. No Cloudflare token')
      )
    ).toBe(true)
  })

  it('summarises one name for a domain row', () => {
    expect(tunnelOnlyCertificateSummary(undefined)).toEqual({
      label: INTERNAL_CERTIFICATE_LABEL,
      tone: 'neutral',
    })
    expect(tunnelOnlyCertificateSummary(pick('cloudflare_origin', 'tls-1')).label).toBe(
      ORIGIN_CERTIFICATE_LABEL
    )
  })
})
