/**
 * Names only a tunnel reaches. The daemon serves them with its own internal
 * certificate and answers only to the tunnel and loopback; visitors get the
 * tunnel edge's trusted certificate. So the Hosting tab and the new-project
 * form never ask for, promise or warn about a public certificate for them.
 */
import type { CertificateView } from '@/lib/hosting-certificate'
import type { HostingRecord } from '@/lib/instance-api'

export type TunnelOnly = Readonly<{ tunnelNames: string[] }>

/** The words a tunnel-only name wears in the Hosting tab summary and the Bind box. */
export const TUNNEL_ONLY_LABEL = 'Tunnel only'
export const INTERNAL_CERTIFICATE_LABEL = 'Internal certificate'

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

/** The Certificate box for a tunnel-only name: no request, no spinner, no actions. */
export function tunnelOnlyCertificateView(tunnel: TunnelOnly): CertificateView {
  return {
    label: INTERNAL_CERTIFICATE_LABEL,
    tone: 'neutral',
    lines: [
      `Tunnel only · ${tunnel.tunnelNames.join(', ')}.`,
      'Trusted at the tunnel’s edge. The tunnel reaches the server with the server’s own certificate.',
    ],
    reason: null,
    actions: [],
    spinner: false,
  }
}
