import type { TlsRecord } from '@/lib/instance-api'

/**
 * What the certificate list says about dates. A Let's Encrypt certificate that
 * Caddy manages keeps its real dates in the host's report (`metadata.acme`);
 * the row's own expiry is only a placeholder until then, so it is never shown.
 */
export function tlsDateLines(row: TlsRecord, locale?: string): string[] {
  const { metadata } = row
  if (metadata.status !== 'automatic') {
    return metadata.notAfter ? [`Expires ${new Date(metadata.notAfter).toLocaleString(locale)}`] : []
  }
  const lines: string[] = []
  const notAfter = metadata.acme?.notAfter
  const issued = metadata.acme?.lastIssuedAt
  if (notAfter) lines.push(`Expires ${new Date(notAfter).toLocaleString(locale)}`)
  if (issued) lines.push(`Last issued ${new Date(issued).toLocaleString(locale)}`)
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
