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
  if (issuer) lines.push(`Issued by ${plainIssuer(issuer)}`)
  const started = notBefore ? Date.parse(notBefore) : Number.NaN
  if (Number.isFinite(started) && started > 0) {
    lines.push(`Valid from ${new Date(started).toLocaleString(locale)}`)
  }
  return lines
}

/** A day for any date line; an empty or epoch date reads "No expiry" so the line is left out. */
export function formatDay(value: string | null): string {
  if (!value) return 'No expiry'
  const parsed = realDate(value)
  if (!parsed) return Number.isNaN(new Date(value).getTime()) ? value : 'No expiry'
  return parsed.toISOString().slice(0, 10)
}

/** The library's Expiry cell: "Pending" only for a row that has a placeholder date and is not issued yet. */
export function expiryCell(value: string | null): string {
  if (value && !realDate(value) && !Number.isNaN(new Date(value).getTime())) return 'Pending'
  return formatDay(value)
}

/** Attribute codes a certificate name may carry instead of their short names. */
const NAME_ATTRIBUTE_CODES: Readonly<Record<string, string>> = {
  '2.5.4.3': 'CN',
  '2.5.4.6': 'C',
  '2.5.4.10': 'O',
  '2.5.4.11': 'OU',
}

/**
 * A certificate's issuer in plain words: the organization with the issuer's
 * own name after it ("Let's Encrypt (YE1)"), read from a name such as
 * `2.5.4.6=US, O=Let's Encrypt, CN=YE1` or `C=US/O=Let's Encrypt/CN=YE1`.
 * Anything it cannot read comes back unchanged.
 */
export function plainIssuer(issuer: string): string {
  const parts = new Map<string, string>()
  for (const raw of issuer.split(/[,/]/)) {
    const at = raw.indexOf('=')
    if (at <= 0) continue
    const key = raw.slice(0, at).trim()
    parts.set(NAME_ATTRIBUTE_CODES[key] ?? key.toUpperCase(), raw.slice(at + 1).trim())
  }
  const organization = parts.get('O')
  const common = parts.get('CN')
  if (organization && common && common !== organization) return `${organization} (${common})`
  return organization ?? common ?? issuer
}
