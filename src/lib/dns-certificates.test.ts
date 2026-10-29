import { describe, expect, it } from 'vitest'
import type { DnsCertificate, TunnelCarrier } from '@/lib/instance-api'
import {
  dnsCapableCarriers,
  dnsCertificateErrorMessage,
  EMPTY_ORDER_DRAFT,
  isOrdering,
  nextTryLabel,
  orderNames,
  orderProblem,
  parseNames,
  progressLabel,
  renewalLabel,
  stageLabel,
  statusLabel,
  statusTone,
} from './dns-certificates'

const cert = (extra: Partial<DnsCertificate> = {}): DnsCertificate => ({
  id: 'c1',
  names: ['example.com'],
  wildcard: false,
  status: 'pending',
  stage: 'queued',
  staging: false,
  lastError: null,
  warning: null,
  attempts: 0,
  nextAttemptAt: null,
  renewAt: null,
  notAfter: null,
  issuer: null,
  createdAt: '2026-10-28T00:00:00Z',
  updatedAt: '2026-10-28T00:00:00Z',
  ...extra,
})

describe('names', () => {
  it('splits on commas, spaces and new lines, lowercases and drops repeats', () => {
    expect(parseNames(' Example.COM,\nshop.example.com.  example.com ')).toEqual([
      'example.com',
      'shop.example.com',
    ])
  })
  it('a wildcard order covers the domain and everything directly under it', () => {
    const draft = { ...EMPTY_ORDER_DRAFT, mode: 'wildcard' as const, domain: ' Example.com. ' }
    expect(orderNames(draft)).toEqual(['example.com', '*.example.com'])
  })
  it('exact names never become a wildcard on their own', () => {
    const draft = { ...EMPTY_ORDER_DRAFT, namesText: 'example.com shop.example.com' }
    expect(orderNames(draft)).toEqual(['example.com', 'shop.example.com'])
  })
})

describe('orderProblem', () => {
  const base = { ...EMPTY_ORDER_DRAFT, carrierId: 'k1' }
  it('needs an account and a name', () => {
    expect(orderProblem(EMPTY_ORDER_DRAFT)).toMatch(/Choose the Cloudflare account/)
    expect(orderProblem(base)).toMatch(/Enter the names/)
    expect(orderProblem({ ...base, mode: 'wildcard' })).toMatch(/Enter the domain/)
  })
  it('points a typed star at the wildcard choice', () => {
    expect(orderProblem({ ...base, namesText: '*.example.com' })).toMatch(
      /Use A Wildcard Certificate/
    )
  })
  it('refuses what is not a domain name', () => {
    expect(orderProblem({ ...base, namesText: 'localhost' })).toMatch(/does not look like a domain/)
    expect(orderProblem({ ...base, namesText: 'bad_name.example.com' })).toMatch(/does not look/)
    expect(orderProblem({ ...base, mode: 'wildcard', domain: 'nodot' })).toMatch(/does not look/)
  })
  it('caps the number of names', () => {
    const many = Array.from({ length: 11 }, (_, i) => `n${i}.example.com`).join(' ')
    expect(orderProblem({ ...base, namesText: many })).toMatch(/up to 10/)
  })
  it('accepts good input', () => {
    expect(orderProblem({ ...base, namesText: 'app.example.com' })).toBeNull()
    expect(orderProblem({ ...base, mode: 'wildcard', domain: 'example.com' })).toBeNull()
  })
})

describe('accounts', () => {
  const carrier = (id: string, dns: number, status = 'active'): TunnelCarrier =>
    ({
      id,
      name: id,
      badges: [
        {
          status,
          capabilities: {
            tunnels: false,
            dns: Array.from({ length: dns }, (_, i) => ({ id: `z${i}`, name: `z${i}.com` })),
            certificates: [],
          },
        },
      ],
    }) as unknown as TunnelCarrier
  it('lists only accounts with a working token that can edit DNS', () => {
    const list = dnsCapableCarriers([
      carrier('a', 1),
      carrier('b', 0),
      carrier('c', 2, 'attention'),
    ])
    expect(list.map((c) => c.id)).toEqual(['a'])
  })
})

describe('where an order stands', () => {
  it('says the stage in words and counts the steps while ordering', () => {
    expect(stageLabel(cert({ stage: 'validating' }))).toMatch(/Waiting for Let’s Encrypt/)
    expect(progressLabel(cert({ stage: 'validating' }))).toBe('Step 3 of 4')
    expect(progressLabel(cert({ status: 'ready', stage: 'issued' }))).toBeNull()
    expect(stageLabel(cert({ status: 'failed', stage: 'failed' }))).toMatch(/Gave up/)
    expect(isOrdering(cert())).toBe(true)
    expect(isOrdering(cert({ status: 'ready' }))).toBe(false)
  })
  it('labels and tones follow the status', () => {
    expect([statusLabel(cert()), statusTone(cert())]).toEqual(['Ordering', 'pending'])
    expect([statusLabel(cert({ status: 'ready' })), statusTone(cert({ status: 'ready' }))]).toEqual(
      ['Ready', 'ok']
    )
    expect([
      statusLabel(cert({ status: 'failed' })),
      statusTone(cert({ status: 'failed' })),
    ]).toEqual(['Gave Up', 'danger'])
  })
  it('shows renewal and next-try times only when they apply', () => {
    expect(renewalLabel(cert({ status: 'ready', renewAt: '2026-12-01T00:00:00Z' }))).toMatch(
      /Renews around/
    )
    expect(renewalLabel(cert({ renewAt: '2026-12-01T00:00:00Z' }))).toBeNull()
    expect(nextTryLabel(cert({ nextAttemptAt: '2026-10-29T10:00:00Z' }))).toMatch(/Next try/)
    expect(
      nextTryLabel(cert({ status: 'ready', nextAttemptAt: '2026-10-29T10:00:00Z' }))
    ).toBeNull()
  })
})

describe('dnsCertificateErrorMessage', () => {
  const failed = (code: string) => new Error(`/x failed: HTTP 400: ${code}`)
  it('speaks plainly about the codes the panel returns', () => {
    expect(dnsCertificateErrorMessage(failed('no_dns_token'), 'x')).toMatch(/Cloudflare Accounts/)
    expect(dnsCertificateErrorMessage(failed('zone_not_found'), 'x')).toMatch(
      /could not find the zone/
    )
    expect(dnsCertificateErrorMessage(failed('lets_encrypt_not_enabled'), 'x')).toMatch(
      /Allow Let’s Encrypt/
    )
    expect(dnsCertificateErrorMessage(failed('dns_certificate_limit'), 'x')).toMatch(
      /10 new certificates/
    )
  })
  it('falls back for anything else', () => {
    expect(dnsCertificateErrorMessage(new Error('boom'), 'Failed to order')).toBe('Failed to order')
  })
})
