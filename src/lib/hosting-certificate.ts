/**
 * Words for a hosting's certificate. The server decides the state; this only
 * turns it into plain sentences, a tone and the actions to offer.
 */
import type { HostingCertificate, HostingDnsReport } from '@/lib/instance-api'
import { isForbiddenError } from '@/lib/fetch-error-detail'
import { userErrorMessage } from '@/lib/user-error'

export type CertificateTone = 'neutral' | 'good' | 'warning' | 'bad' | 'pending'

export type CertificateAction = 'use_lets_encrypt' | 'check_dns' | 'try_again' | 'deploy'

export type CertificateView = {
  label: string
  tone: CertificateTone
  /** Lines under the label, in reading order. */
  lines: string[]
  /** The reason a certificate could not be issued or renewed, when there is one. */
  reason: string | null
  actions: CertificateAction[]
  spinner: boolean
}

export function formatDaysLeft(days: number | null): string | null {
  if (days === null) return null
  if (days < 0) return 'expired'
  if (days === 0) return 'expires today'
  return days === 1 ? 'expires in 1 day' : `expires in ${days} days`
}

const UPLOADED_WARNINGS: Record<HostingCertificate['uploadedExpiryWarning'], string | null> = {
  none: null,
  '14d': 'Renew it soon: it runs out in two weeks or less.',
  '3d': 'Renew it now: it runs out in three days or less.',
  '1d': 'Renew it today: it runs out within a day.',
  expired: 'It has run out. Upload a new one.',
}

function letsEncryptAction(cert: HostingCertificate): CertificateAction[] {
  return cert.letsEncryptAvailable ? ['use_lets_encrypt'] : []
}

function testView(cert: HostingCertificate): CertificateView {
  return {
    label: 'Self-signed certificate',
    tone: 'neutral',
    lines: ['Browsers will warn visitors.'],
    reason: null,
    actions: letsEncryptAction(cert),
    spinner: false,
  }
}

function uploadedView(cert: HostingCertificate): CertificateView {
  const warning = UPLOADED_WARNINGS[cert.uploadedExpiryWarning]
  const lines = [formatDaysLeft(cert.expiresInDays), 'You renew this one.', warning]
  return {
    label: 'Uploaded certificate',
    tone: warning === null ? 'neutral' : 'warning',
    lines: lines.filter((line): line is string => line !== null),
    reason: null,
    actions: letsEncryptAction(cert),
    spinner: false,
  }
}

function secureView(cert: HostingCertificate): CertificateView {
  const lines = ['Let’s Encrypt, renews automatically.', formatDaysLeft(cert.expiresInDays)]
  return {
    label: 'Secure',
    tone: 'good',
    lines: lines.filter((line): line is string => line !== null),
    reason: null,
    actions: [],
    spinner: false,
  }
}

function waitingView(cert: HostingCertificate): CertificateView {
  const lines = ['Let’s Encrypt starts as soon as this domain points at your server.']
  if (cert.dns && !cert.dns.ready) lines.push(...dnsSummaryLines(cert.dns))
  return {
    label: 'Waiting for DNS',
    tone: 'pending',
    lines,
    reason: null,
    actions: ['check_dns'],
    spinner: false,
  }
}

function issuingView(cert: HostingCertificate): CertificateView {
  const lines = cert.needsDeploy
    ? ['Deploy this environment to start it. The certificate is requested during the deploy.']
    : ['This usually takes a minute or two.']
  return {
    label: 'Getting a certificate',
    tone: 'pending',
    lines,
    reason: null,
    actions: cert.needsDeploy ? ['deploy'] : [],
    spinner: !cert.needsDeploy,
  }
}

function failedView(cert: HostingCertificate): CertificateView {
  const neverIssued = cert.lastIssuedAt === null
  return {
    label: neverIssued ? 'Couldn’t get a certificate' : 'Renewal failed',
    tone: 'bad',
    lines: neverIssued
      ? ['Let’s Encrypt could not issue this one.']
      : ['Visitors will see a warning when the current certificate runs out.'],
    reason: cert.lastError,
    actions: ['check_dns', 'try_again'],
    spinner: false,
  }
}

const BUILDERS: Record<HostingCertificate['state'], (cert: HostingCertificate) => CertificateView> =
  {
    test_certificate: testView,
    uploaded: uploadedView,
    secure: secureView,
    waiting_for_dns: waitingView,
    issuing: issuingView,
    renewal_failed: failedView,
  }

export function describeCertificate(cert: HostingCertificate): CertificateView {
  return BUILDERS[cert.state](cert)
}

/** Why Let's Encrypt was refused, in plain words, and whether Organization settings can fix it. */
export type LetsEncryptRefusal = Readonly<{
  message: string
  /** The organization has Let's Encrypt turned off: link to Domains & certificates. */
  openSettings: boolean
}>

/**
 * The server's own sentence after the code (`HTTP 400: code — sentence`), for
 * refusals whose message names the clashing hostnames.
 */
function serverExplanation(err: unknown, code: string): string | null {
  if (!(err instanceof Error)) return null
  const at = err.message.indexOf(`${code} \u2014 `)
  if (at === -1) return null
  const text = err.message.slice(at + code.length + 3).trim()
  return text === '' ? null : text
}

/**
 * A refused `PUT /hostings/:id/use-letsencrypt` as one plain sentence. The
 * documented codes (Let's Encrypt off, not a web domain, no names, not
 * reachable from the internet, a name it cannot issue for, a www clash) map to
 * fixed copy; a www clash keeps the server's sentence, which names the hosts.
 */
export function letsEncryptRefusal(err: unknown): LetsEncryptRefusal {
  const www = serverExplanation(err, 'www_redirect_conflict')
  // A plain permission 403 carries only "HTTP 403: Forbidden": say it in words instead.
  const fallback = 'Could not start Let\u2019s Encrypt.'
  return {
    message: www ?? (isForbiddenError(err) ? fallback : userErrorMessage(err, fallback)),
    openSettings: err instanceof Error && err.message.includes('lets_encrypt_not_enabled'),
  }
}

/**
 * After a hosting saved: ask for the certificate when the box was ticked. Any
 * successful save replaces what an earlier answer said, so a save without the
 * box clears an old refusal. Null when the hosting has no id yet.
 */
export async function certificateAfterSave(
  input: Readonly<{
    hostingId: string | null
    wantsCertificate: boolean
    request: (hostingId: string) => Promise<{ ok: true } | { ok: false; cause?: unknown }>
  }>
): Promise<{ hostingId: string; refusal: LetsEncryptRefusal | null } | null> {
  const { hostingId } = input
  if (hostingId === null) return null
  if (!input.wantsCertificate) return { hostingId, refusal: null }
  const requested = await input.request(hostingId)
  return { hostingId, refusal: requested.ok ? null : letsEncryptRefusal(requested.cause) }
}

/** The refusals by hosting id after one save: a new refusal replaces the old, a success clears it. */
export function withCertificateRefusal(
  current: Readonly<Record<string, LetsEncryptRefusal>>,
  hostingId: string,
  refusal: LetsEncryptRefusal | null
): Record<string, LetsEncryptRefusal> {
  const next = { ...current }
  if (refusal === null) delete next[hostingId]
  else next[hostingId] = refusal
  return next
}

/**
 * One line per name that does not point here yet (including a www name the
 * hosting's www choice added), then where it should point.
 */
export function dnsSummaryLines(dns: HostingDnsReport): string[] {
  const lines = dns.hostnames
    .filter((entry) => !entry.resolves)
    .map((entry) =>
      entry.addresses.length === 0
        ? `${entry.hostname} doesn’t point at this server yet: no DNS record found.`
        : `${entry.hostname} doesn’t point at this server yet: it points to ${entry.addresses.join(', ')}.`
    )
  if (lines.length > 0 && dns.expectedAddresses.length > 0) {
    const them = lines.length === 1 ? 'it' : 'them'
    lines.push(`Point ${them} at ${dns.expectedAddresses.join(', ')}.`)
  }
  return lines
}

export function dnsResultHeadline(dns: HostingDnsReport): string {
  return dns.ready ? 'Every name points at this server.' : 'DNS is not ready yet.'
}
