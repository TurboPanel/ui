import type { TlsRecord } from '@/lib/instance-api'

/**
 * What the certificate list says about dates. A Let's Encrypt certificate that
 * Caddy manages keeps its real dates in the host's report (`metadata.acme`);
 * the row's own expiry is only a placeholder until then, so it is never shown.
 */
export function tlsDateLines(row: TlsRecord, locale?: string): string[] {
  const { metadata } = row
  if (metadata.status !== 'managed') {
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
