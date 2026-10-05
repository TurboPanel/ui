/**
 * Words for a hosting's certificate. The server decides the state; this only
 * turns it into plain sentences, a tone and the actions to offer.
 */
import type { HostingCertificate, HostingDnsReport } from '@/lib/instance-api'

export type CertificateTone = 'neutral' | 'good' | 'warning' | 'bad' | 'pending'

export type CertificateAction = 'use_lets_encrypt' | 'check_dns' | 'try_again'

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
    label: 'Test certificate',
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
    ? ['Redeploy this environment to start it.']
    : ['This usually takes a minute or two.']
  return {
    label: 'Getting a certificate',
    tone: 'pending',
    lines,
    reason: null,
    actions: [],
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

/** One line per name that does not point here yet, then where it should point. */
export function dnsSummaryLines(dns: HostingDnsReport): string[] {
  const lines = dns.hostnames
    .filter((entry) => !entry.resolves)
    .map((entry) =>
      entry.addresses.length === 0
        ? `${entry.hostname}: no DNS record found.`
        : `${entry.hostname}: points to ${entry.addresses.join(', ')}.`
    )
  if (lines.length > 0 && dns.expectedAddresses.length > 0) {
    lines.push(`Point it at ${dns.expectedAddresses.join(', ')}.`)
  }
  return lines
}

export function dnsResultHeadline(dns: HostingDnsReport): string {
  return dns.ready ? 'Every name points at this server.' : 'DNS is not ready yet.'
}
