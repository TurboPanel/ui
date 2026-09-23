import { isLoopbackOrPrivateHostname } from '@/lib/install-tls'
import { parsePublicUrlEntry } from '@/lib/public-url-entry'
import { coversHostname } from '@/lib/tls-match'

export const INSTANCE_HOSTNAME_SOURCE_LABELS = {
  'platform-ca': 'Platform CA',
  uploaded: 'Uploaded',
  'lets-encrypt': "Let's Encrypt",
} as const

export type InstanceHostnameSource = keyof typeof INSTANCE_HOSTNAME_SOURCE_LABELS

export type HostnameStatusPresentation = Readonly<{
  dot: 'online' | 'pending' | 'offline' | 'failed'
  badge: 'ok' | 'pending' | 'danger' | 'muted'
  label: string
  expiry: string
}>

const STATUS_PRESENTATION: Record<
  'ready' | 'pending' | 'failed' | 'expired',
  Omit<HostnameStatusPresentation, 'expiry'>
> = {
  ready: { dot: 'online', badge: 'ok', label: 'Ready' },
  pending: { dot: 'pending', badge: 'pending', label: 'Pending' },
  failed: { dot: 'failed', badge: 'danger', label: 'Failed' },
  expired: { dot: 'offline', badge: 'danger', label: 'Expired' },
}

const OLD_DAEMON_REASON =
  "this host's daemon is too old to render per-hostname certificate sources"

export function hostnameStatusPresentation(record: Readonly<{
  status: keyof typeof STATUS_PRESENTATION
  notAfter: string | null
}>): HostnameStatusPresentation {
  const presentation = STATUS_PRESENTATION[record.status]
  return {
    ...presentation,
    expiry: expiryLine(record.notAfter),
  }
}

const HTTP01_PREFLIGHT_REACHED = 'did not reach 127.0.0.1:8880'

export type Http01PreflightKind = 'failed' | 'passed' | 'unrecorded'

/**
 * The HTTP-01 preflight is the apply-time nonce check. A later certificate
 * error is issuance and stays on `acmeLastError` only when it is not that
 * preflight.
 */
export function http01PreflightPresentation(record: Readonly<{
  source: string
  acmeLastError: string | null
  acmeLastAttemptAt: string | null
}>): { kind: Http01PreflightKind; text: string } | null {
  if (record.source !== 'lets-encrypt') return null
  const error = record.acmeLastError?.trim() ?? ''
  if (error.includes(HTTP01_PREFLIGHT_REACHED)) {
    return { kind: 'failed', text: error }
  }
  if (record.acmeLastAttemptAt) {
    return {
      kind: 'passed',
      text: 'HTTP-01 preflight passed before issuance was attempted.',
    }
  }
  return {
    kind: 'unrecorded',
    text: 'HTTP-01 preflight has not been recorded for this hostname.',
  }
}

function expiryLine(notAfter: string | null): string {
  if (!notAfter) return 'No expiry'
  const parsed = new Date(notAfter)
  if (Number.isNaN(parsed.getTime())) return notAfter
  return parsed.toISOString().slice(0, 10)
}

export type CertificateCoverage = Readonly<{
  dnsNames: readonly string[]
}>

export type CertificateSourceContext = Readonly<{
  certificates: readonly CertificateCoverage[]
  capabilities: Readonly<Record<string, boolean>> | null | undefined
}>

/**
 * Client-side mirror of `validateHostnameSource`. Each refusal is a sentence
 * the picker shows beside a disabled option.
 */
export function certificateSourceEligibility(
  host: string,
  options: CertificateSourceContext,
): Partial<Record<'uploaded' | 'lets-encrypt', string>> {
  if (options.capabilities?.['instance-cert-sources-per-hostname'] !== true) {
    return {
      uploaded: OLD_DAEMON_REASON,
      'lets-encrypt': OLD_DAEMON_REASON,
    }
  }
  const refused: Partial<Record<'uploaded' | 'lets-encrypt', string>> = {}
  const hostname = hostnameOf(host)
  if (hostname.startsWith('*.')) {
    refused['lets-encrypt'] =
      "Let's Encrypt cannot issue a certificate for a wildcard name."
  } else if (isLoopbackOrPrivateHostname(hostname)) {
    refused['lets-encrypt'] =
      "Let's Encrypt cannot issue a certificate for a loopback or private name."
  }
  const covered = options.certificates.some((certificate) =>
    coversHostname([...certificate.dnsNames], hostname),
  )
  if (!covered) {
    refused.uploaded = 'No uploaded certificate covers this hostname.'
  }
  return refused
}

export type HostnameSourceDraft = Readonly<{
  host: string
  source: InstanceHostnameSource
}>

/**
 * Sentence shown before an apply that changes a source or removes a hostname.
 * Names `https://<host>:8443`, the Platform CA address that stays bound.
 */
export function lockoutWarning(
  current: readonly HostnameSourceDraft[],
  next: readonly HostnameSourceDraft[],
): string | null {
  const changed = changedHosts(current, next)
  const host = changed[0]
  if (!host) return null
  const address = `https://${hostnameOf(host)}:8443`
  return (
    `This apply changes a hostname or its certificate. ${address} with the ` +
    'Platform CA leaf stays reachable if the new certificate does not.'
  )
}

/**
 * Confirm before an apply that removes the last Platform CA hostname or moves
 * the only routable name off the Platform CA.
 */
export function requiresPlatformCaConfirm(
  current: readonly HostnameSourceDraft[],
  next: readonly HostnameSourceDraft[],
): boolean {
  const currentCa = current.filter((entry) => entry.source === 'platform-ca')
  const nextCa = next.filter((entry) => entry.source === 'platform-ca')
  if (currentCa.length > 0 && nextCa.length === 0) return true
  const routable = currentCa.filter(
    (entry) => !isLoopbackOrPrivateHostname(hostnameOf(entry.host)),
  )
  if (routable.length !== 1) return false
  const only = routable[0]
  if (!only) return false
  return !next.some(
    (entry) => entry.host === only.host && entry.source === 'platform-ca',
  )
}

function hostnameOf(entry: string): string {
  return parsePublicUrlEntry(entry)?.host ?? entry.trim().toLowerCase()
}

function sourceKey(entry: HostnameSourceDraft): string {
  return `${entry.host}\0${entry.source}`
}

function changedHosts(
  current: readonly HostnameSourceDraft[],
  next: readonly HostnameSourceDraft[],
): string[] {
  const nextKeys = new Set(next.map(sourceKey))
  const changed: string[] = []
  for (const entry of current) {
    if (!nextKeys.has(sourceKey(entry))) changed.push(entry.host)
  }
  const currentHosts = new Set(current.map((entry) => entry.host))
  for (const entry of next) {
    if (!currentHosts.has(entry.host)) changed.push(entry.host)
  }
  return changed
}
