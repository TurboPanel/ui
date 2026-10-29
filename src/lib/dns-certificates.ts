/**
 * Certificates TurboPanel orders itself through a DNS challenge: the rules for
 * the order form, and the words for where an order stands. Pure; the transport
 * lives in `instance-api.ts`.
 */
import type { BadgeTone } from '@/components/ui/badge'
import type { DnsCertificate, TunnelCarrier } from '@/lib/instance-api'
import { parseFailure } from '@/lib/tunnels'

export const MAX_NAMES = 10

/** How the names are chosen: exact ones, or one wildcard that has to be asked for. */
export type OrderMode = 'exact' | 'wildcard'

export type OrderDraft = Readonly<{
  mode: OrderMode
  /** Exact names, separated by commas, spaces or new lines. */
  namesText: string
  /** The domain a wildcard covers, such as example.com. */
  domain: string
  carrierId: string | null
}>

export const EMPTY_ORDER_DRAFT: OrderDraft = {
  mode: 'exact',
  namesText: '',
  domain: '',
  carrierId: null,
}

const LABEL = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/

/** Names typed in a box: lowercase, no trailing dot, no repeats. */
export function parseNames(text: string): string[] {
  const names: string[] = []
  for (const part of text.split(/[\s,]+/)) {
    const name = part.trim().toLowerCase().replace(/\.$/, '')
    if (name.length > 0 && !names.includes(name)) names.push(name)
  }
  return names
}

function nameProblem(name: string): string | null {
  const labels = name.split('.')
  if (name.includes('*')) {
    return `${name} has a * in it. Use "Use A Wildcard Certificate" to cover every name under a domain.`
  }
  if (labels.length < 2 || name.length > 253 || !labels.every((l) => LABEL.test(l))) {
    return `${name} does not look like a domain name, for example app.example.com.`
  }
  return null
}

/** The names an order asks for: the typed ones, or the domain and everything under it. */
export function orderNames(draft: OrderDraft): string[] {
  if (draft.mode === 'wildcard') {
    const domain = draft.domain.trim().toLowerCase().replace(/\.$/, '')
    return domain.length > 0 ? [domain, `*.${domain}`] : []
  }
  return parseNames(draft.namesText)
}

/** What is wrong with the draft, in plain words, or null when it can be sent. */
export function orderProblem(draft: OrderDraft): string | null {
  if (draft.carrierId === null) return 'Choose the Cloudflare account that hosts the DNS.'
  const names = orderNames(draft)
  if (names.length === 0) {
    return draft.mode === 'wildcard'
      ? 'Enter the domain the wildcard should cover, for example example.com.'
      : 'Enter the names the certificate should cover.'
  }
  if (names.length > MAX_NAMES) return `A certificate can cover up to ${MAX_NAMES} names.`
  const base = draft.mode === 'wildcard' ? [names[0] ?? ''] : names
  for (const name of base) {
    const problem = nameProblem(name)
    if (problem) return problem
  }
  return null
}

/** Accounts with an active API Token that can edit DNS for at least one zone. */
export function dnsCapableCarriers(carriers: readonly TunnelCarrier[]): TunnelCarrier[] {
  return carriers.filter((c) =>
    c.badges.some((b) => b.status === 'active' && b.capabilities.dns.length > 0)
  )
}

const STAGE_STEP: Readonly<Record<string, number>> = {
  queued: 1,
  presented: 2,
  validating: 3,
  finalizing: 4,
}
const STEPS = 4

/** Where an order stands, in a few words. */
export function stageLabel(c: Pick<DnsCertificate, 'status' | 'stage'>): string {
  if (c.status === 'failed') return 'Gave up after several tries.'
  if (c.status === 'ready' || c.status === 'expired') return 'Issued.'
  switch (c.stage) {
    case 'queued':
      return 'Starting the order.'
    case 'presented':
      return 'Validation records published. Giving them a moment to spread.'
    case 'validating':
      return 'Waiting for Let’s Encrypt to check the records.'
    case 'finalizing':
      return 'Collecting the certificate.'
    case 'backoff':
      return 'The last try did not work. Waiting before trying again.'
    default:
      return 'Working.'
  }
}

/** "Step 2 of 4" while an order runs; null otherwise. */
export function progressLabel(c: Pick<DnsCertificate, 'status' | 'stage'>): string | null {
  if (c.status !== 'pending') return null
  const step = STAGE_STEP[c.stage]
  return step ? `Step ${step} of ${STEPS}` : null
}

export function statusLabel(c: Pick<DnsCertificate, 'status'>): string {
  switch (c.status) {
    case 'ready':
      return 'Ready'
    case 'pending':
      return 'Ordering'
    case 'failed':
      return 'Gave Up'
    case 'expired':
      return 'Expired'
    default:
      return c.status
  }
}

export function statusTone(c: Pick<DnsCertificate, 'status'>): BadgeTone {
  if (c.status === 'ready') return 'ok'
  if (c.status === 'pending') return 'pending'
  return 'danger'
}

/** An order still running (the screen refreshes while any is). */
export function isOrdering(c: Pick<DnsCertificate, 'status'>): boolean {
  return c.status === 'pending'
}

/** "Renews around 3 Dec 2026", when a time is known. */
export function renewalLabel(c: Pick<DnsCertificate, 'status' | 'renewAt'>): string | null {
  if (c.status !== 'ready' || !c.renewAt) return null
  const when = new Date(c.renewAt)
  return Number.isNaN(when.getTime()) ? null : `Renews around ${when.toLocaleDateString()}`
}

export function expiryLabel(c: Pick<DnsCertificate, 'notAfter'>): string | null {
  if (!c.notAfter) return null
  const when = new Date(c.notAfter)
  return Number.isNaN(when.getTime()) ? null : `Expires ${when.toLocaleDateString()}`
}

/** When a failed order will be tried again by itself, if it will. */
export function nextTryLabel(c: Pick<DnsCertificate, 'status' | 'nextAttemptAt'>): string | null {
  if (c.status !== 'pending' || !c.nextAttemptAt) return null
  const when = new Date(c.nextAttemptAt)
  return Number.isNaN(when.getTime()) ? null : `Next try ${when.toLocaleString()}`
}

const ERROR_COPY: Readonly<Record<string, string>> = {
  names_invalid: 'Check the names. Each one needs to look like app.example.com.',
  carrier_invalid: 'Choose the Cloudflare account that hosts the DNS.',
  provider_unsupported: 'That account cannot be used to prove a name yet.',
  no_dns_token:
    'No API Token on this account can edit DNS records. Add one under Cloudflare Accounts.',
  zone_not_found:
    'Cloudflare could not find the zone for these names among the zones this account’s API Tokens can edit.',
  badge_rejected: 'Cloudflare did not accept the API Token. Check it under Cloudflare Accounts.',
  lets_encrypt_not_enabled: 'Turn on “Allow Let’s Encrypt certificates” above first.',
  dns_certificate_limit: 'You can order up to 10 new certificates a day. Try again tomorrow.',
  secrets_unavailable: 'TurboPanel cannot store keys on this instance yet.',
  not_failed: 'This certificate has not given up, so there is nothing to retry.',
  retry_too_soon: 'It gave up a moment ago. Wait a few minutes, then try again.',
}

/** Calm wording for a failed order call. */
export function dnsCertificateErrorMessage(err: unknown, fallback: string): string {
  const raw = err instanceof Error ? err.message : ''
  const { code } = parseFailure(raw)
  if (code && ERROR_COPY[code]) return ERROR_COPY[code]
  if (code === 'provider_unavailable') {
    return 'Cloudflare could not be reached just now. Try again in a moment.'
  }
  return fallback
}
