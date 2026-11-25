/**
 * Names only a tunnel reaches. The daemon serves them with its own internal
 * certificate and answers only to the tunnel and loopback; visitors get the
 * tunnel edge's trusted certificate. So the Hosting tab and the new-project
 * form never ask for, promise or warn about a public certificate for them.
 */
import type { CertificateTone, CertificateView } from '@/lib/hosting-certificate'
import type { HostingNameCertificate, HostingRecord } from '@/lib/instance-api'
import { ORIGIN_WAITING_LINE, originIssueText } from '@/lib/name-certificates'

export type TunnelOnly = Readonly<{ tunnelNames: string[] }>

/** The words a tunnel-only name wears in the Hosting tab summary and the Bind box. */
export const TUNNEL_ONLY_LABEL = 'Tunnel only'
export const INTERNAL_CERTIFICATE_LABEL = 'Internal certificate'
export const ORIGIN_CERTIFICATE_LABEL = 'Cloudflare origin certificate'
export const LETS_ENCRYPT_CERTIFICATE_LABEL = 'Let’s Encrypt certificate'
export const PINNED_CERTIFICATE_LABEL = 'Pinned certificate'
export const MIXED_CERTIFICATES_LABEL = 'Different certificates'

/** The part of a name's record the tunnel-only Certificate box reads. */
export type TunnelNameCertificate = Pick<
  HostingNameCertificate,
  'hostname' | 'certificate' | 'tlsId' | 'originCertificateIssue'
>

type NameWords = Readonly<{ label: string; tone: CertificateTone; line: string }>

const INTERNAL_LINE =
  'Trusted at the tunnel’s edge. The tunnel reaches the server with the server’s own certificate.'

/**
 * The certificate a tunnel-only name has by its own choice: an origin
 * certificate (issued, or waiting with the reason), one pinned from the
 * library, Let’s Encrypt, or the server’s internal one. A name the panel sends
 * no choice for (an older control plane) has the internal one.
 */
function nameWords(name: TunnelNameCertificate | undefined, locale?: string): NameWords {
  switch (name?.certificate) {
    case 'cloudflare_origin':
      return name.tlsId
        ? {
            label: ORIGIN_CERTIFICATE_LABEL,
            tone: 'good',
            line: 'Issued for this name. The tunnel checks it when it reaches the server.',
          }
        : {
            label: ORIGIN_CERTIFICATE_LABEL,
            tone: 'pending',
            line: name.originCertificateIssue
              ? `Waiting for the origin certificate. ${originIssueText(name.originCertificateIssue, locale)}`
              : ORIGIN_WAITING_LINE,
          }
    case 'library':
      return {
        label: PINNED_CERTIFICATE_LABEL,
        tone: 'neutral',
        line: 'The tunnel reaches the server with the certificate pinned from the library.',
      }
    case 'letsencrypt_http':
    case 'letsencrypt_dns':
      return {
        label: LETS_ENCRYPT_CERTIFICATE_LABEL,
        tone: 'neutral',
        line: 'The tunnel reaches the server with its Let’s Encrypt certificate.',
      }
    default:
      return { label: INTERNAL_CERTIFICATE_LABEL, tone: 'neutral', line: INTERNAL_LINE }
  }
}

/** The word and tone a domain row shows for a tunnel-only name. */
export function tunnelOnlyCertificateSummary(
  name: TunnelNameCertificate | undefined
): Readonly<{ label: string; tone: CertificateTone }> {
  const { label, tone } = nameWords(name)
  return { label, tone }
}

/** What the Bind box says in place of its choices for a tunnel-only name. */
export const TUNNEL_ONLY_BIND_TEXT =
  'Tunnel only: the server answers this name only to the tunnel and to this server itself.'

/** What the new-project form says under a name a tunnel already carries. */
export const TUNNEL_ONLY_SETUP_NOTE =
  'This name is reached only through a tunnel, so it uses the internal certificate and no certificate is requested. Visitors see the tunnel’s edge certificate.'

/**
 * `names` are all tunnel-only when each one is in `lookup` (name, lower case,
 * to tunnel name) or is a tunnel-only path of `hosting`. Null when there are
 * no names or any name is also served directly.
 */
export function tunnelOnlyOf(
  names: readonly string[],
  lookup: ReadonlyMap<string, string>,
  hosting?: Pick<HostingRecord, 'tunnels'> | null
): TunnelOnly | null {
  const own = new Map(
    (hosting?.tunnels ?? [])
      .filter((path) => path.tunnelOnly)
      .map((path) => [path.hostname.toLowerCase(), path.tunnelName] as const)
  )
  const tunnelNames: string[] = []
  for (const name of names) {
    const key = name.trim().toLowerCase()
    const tunnel = own.get(key) ?? lookup.get(key)
    if (tunnel === undefined) return null
    if (!tunnelNames.includes(tunnel)) tunnelNames.push(tunnel)
  }
  return tunnelNames.length === 0 ? null : { tunnelNames }
}

/**
 * The Certificate box for a tunnel-only name: no request, no spinner, no
 * actions. It follows the certificate each name chose; names that chose
 * different ones are listed one by one.
 */
export function tunnelOnlyCertificateView(
  tunnel: TunnelOnly,
  names: readonly TunnelNameCertificate[] = [],
  locale?: string
): CertificateView {
  const where = `Tunnel only · ${tunnel.tunnelNames.join(', ')}.`
  const words = names.map((name) => nameWords(name, locale))
  const first = words[0] ?? nameWords(undefined)
  const same = words.every(
    (item) => item.label === first.label && item.tone === first.tone && item.line === first.line
  )
  const sameLabel = words.every((item) => item.label === first.label)
  const lines = same
    ? [where, first.line]
    : [where, ...names.map((name, index) => `${name.hostname}: ${words[index]!.line}`)]
  const tone = words.some((item) => item.tone === 'pending') ? 'pending' : 'neutral'
  return {
    label: sameLabel ? first.label : MIXED_CERTIFICATES_LABEL,
    tone: same ? first.tone : tone,
    lines,
    reason: null,
    actions: [],
    spinner: false,
  }
}
