import type { TlsRecord } from '@/lib/instance-api'

/**
 * A real date from a stored value, or null. A certificate that is not issued
 * yet carries an empty or zero date, which reads as 12/31/1969 in many
 * time zones; anything before 1971 counts as "no date".
 */
export function realDate(value: string | number | null | undefined): Date | null {
  if (value === null || value === undefined || value === '') return null
  const when = new Date(value)
  return Number.isNaN(when.getTime()) || when.getTime() < Date.UTC(1971, 0, 1) ? null : when
}

/**
 * What the certificate list says about dates. A Let's Encrypt certificate that
 * Caddy manages keeps its real dates in the host's report (`metadata.acme`);
 * the row's own expiry is only a placeholder until then, so it is never shown.
 */
export function tlsDateLines(row: TlsRecord, locale?: string): string[] {
  const { metadata } = row
  if (metadata.status !== 'automatic') {
    const expires = realDate(metadata.notAfter)
    return expires ? [`Expires ${expires.toLocaleString(locale)}`] : []
  }
  const lines: string[] = []
  const notAfter = realDate(metadata.acme?.notAfter)
  const issued = realDate(metadata.acme?.lastIssuedAt)
  if (notAfter) lines.push(`Expires ${notAfter.toLocaleString(locale)}`)
  if (issued) lines.push(`Last issued ${issued.toLocaleString(locale)}`)
  if (lines.length === 0) lines.push('Waiting for the first certificate from the host.')
  return lines
}

/**
 * What the certificate list says about the copy the panel keeps of a
 * Let's Encrypt certificate. The host that serves the site gets the
 * certificate from Let's Encrypt and sends the panel a copy, kept encrypted;
 * the key itself is never shown or returned. Other sources say nothing here.
 */
export function tlsStoredCopyLines(row: TlsRecord, locale?: string): string[] {
  if (row.source !== 'lets_encrypt' || row.metadata.status === 'revoked') return []
  if (!row.certificatePem) {
    return row.metadata.acme?.notAfter
      ? ['No copy stored yet. The host sends one after its next check.']
      : []
  }
  const lines = ['A copy of the certificate and its key is stored encrypted.']
  const { issuer, notBefore } = row.metadata
  if (issuer) lines.push(`Issued by ${issuer}`)
  const started = notBefore ? Date.parse(notBefore) : Number.NaN
  if (Number.isFinite(started) && started > 0) {
    lines.push(`Valid from ${new Date(started).toLocaleString(locale)}`)
  }
  return lines
}
