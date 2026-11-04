/**
 * Certificates TurboPanel ordered itself through a DNS challenge: the rules for
 * the order form, and the words for where a certificate stands. The control
 * plane no longer orders or renews them; those already issued keep working
 * until they expire. Pure; the transport lives in `instance-api.ts`.
 */
import type { BadgeTone } from '@/components/ui/badge'
import type { DnsCertificate, TunnelCarrier } from '@/lib/instance-api'
import { parseFailure } from '@/lib/tunnels'
import { realDate } from '@/lib/tls-managed-dates'

// The order-form rules below (names, wildcard choice, accounts) have no screen
// while ordering is turned off. They stay, with their tests, for the form that
// comes back when the server that runs the site orders these certificates.

export const MAX_NAMES = 10

/** Why Order A Certificate is turned off; the panel answers `certificate_ordering_off` with it. */
export const ORDERING_OFF_MESSAGE =
  'Ordering certificates from the control plane is turned off. Certificates will be ordered by the server that runs the site in a coming release.'

/** Said on every certificate the control plane ordered earlier. */
export const NO_RENEWAL_MESSAGE =
  'This certificate will not renew from the control plane. It keeps working until it expires.'

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

/** What the wording of a certificate's state depends on. */
type CertificateState = Pick<DnsCertificate, 'status' | 'renewAt' | 'nextAttemptAt'>

/**
 * True when the panel still orders and renews these certificates: an older
 * control plane sends a renewal or retry time, a current one never does.
 */
export function stillOrdered(c: Pick<DnsCertificate, 'renewAt' | 'nextAttemptAt'>): boolean {
  return c.renewAt !== null || c.nextAttemptAt !== null
}

/** The no-renewal line, only for a certificate in use that the control plane will not renew. */
export function noRenewalNote(c: CertificateState): string | null {
  return c.status === 'ready' && !stillOrdered(c) ? NO_RENEWAL_MESSAGE : null
}

/** Where a certificate stands, in a few words. An order left open never finishes now. */
export function stageLabel(c: CertificateState): string {
  if (c.status === 'failed') return 'Gave up after several tries.'
  if (c.status === 'ready' || c.status === 'expired') return 'Issued.'
  return stillOrdered(c) ? 'Ordering.' : 'This order was stopped and will not finish.'
}

export function statusLabel(c: CertificateState): string {
  switch (c.status) {
    case 'ready':
      return 'Ready'
    case 'pending':
      return stillOrdered(c) ? 'Ordering' : 'Stopped'
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
  if (c.status === 'pending') return 'muted'
  return 'danger'
}

export function expiryLabel(c: Pick<DnsCertificate, 'notAfter'>): string | null {
  const when = realDate(c.notAfter)
  return when ? `Expires ${when.toLocaleDateString()}` : null
}

/** The codes after the first can only come from an older control plane that still orders. */
const ERROR_COPY: Readonly<Record<string, string>> = {
  certificate_ordering_off: ORDERING_OFF_MESSAGE,
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
