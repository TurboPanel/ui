import type { OrgServerRecord } from '@/lib/instance-api'

/**
 * The address a server's daemon connected to the control plane from, shown
 * muted under the hostname in the servers list.
 *
 * - `ip` — the observed peer address (`remoteAddress`, else `address` when it
 *   came from the wire). `text` is display-ready (middle-truncated when long);
 *   `full` carries the whole value for the accessible label.
 * - `local` — the daemon shares a host with the control plane and attached over
 *   the Unix socket, so there is no network peer to show.
 *
 * `null` when nothing is known: the line is hidden.
 */
export type ServerConnectingAddress =
  | { kind: 'ip'; text: string; full: string }
  | { kind: 'local'; text: string; full: string }

/** The control plane's placeholder `remoteAddress` for a socket-attached daemon. */
export const DIRECT_ATTACH_SENTINEL = '__direct__'

export const LOCAL_SOCKET_LABEL = 'local socket'

/** Longest address shown in full; longer (IPv6) addresses are middle-truncated. */
export const CONNECTING_ADDRESS_MAX_CHARS = 26

type ConnectingAddressFields = Pick<
  OrgServerRecord,
  'remoteAddress' | 'address' | 'addressSource' | 'colocatedWithInstance'
>

/**
 * Strip what the wire adds around an address: IPv6 brackets, a trailing port,
 * an IPv6 zone id, and the `::ffff:` prefix of an IPv4-mapped IPv6 address.
 */
export function normalizePeerAddress(raw: string | null | undefined): string {
  let value = (raw ?? '').trim()
  if (!value) return ''
  const bracketed = /^\[([^\]]+)\](?::\d+)?$/.exec(value)
  if (bracketed) value = bracketed[1]
  const v4WithPort = /^(\d{1,3}(?:\.\d{1,3}){3}):\d+$/.exec(value)
  if (v4WithPort) value = v4WithPort[1]
  const zone = value.indexOf('%')
  if (zone > 0 && value.includes(':')) value = value.slice(0, zone)
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(value)
  if (mapped) value = mapped[1]
  return value
}

/** Keep both ends of a long address: `2001:db8:85a3…8a2e:370:7334`. */
export function truncateMiddle(value: string, max = CONNECTING_ADDRESS_MAX_CHARS): string {
  if (value.length <= max) return value
  const keep = max - 1
  const head = Math.ceil(keep / 2)
  const tail = keep - head
  return `${value.slice(0, head)}…${value.slice(value.length - tail)}`
}

export function serverConnectingAddress(
  server: ConnectingAddressFields
): ServerConnectingAddress | null {
  const remote = server.remoteAddress?.trim() ?? ''
  if (
    server.addressSource === 'local' ||
    remote === DIRECT_ATTACH_SENTINEL ||
    server.colocatedWithInstance === true
  ) {
    return {
      kind: 'local',
      text: LOCAL_SOCKET_LABEL,
      full: 'Connected over the local socket (same host as the control plane)',
    }
  }
  const observed =
    normalizePeerAddress(remote) ||
    (server.addressSource === 'observed' ? normalizePeerAddress(server.address) : '')
  if (!observed) return null
  return { kind: 'ip', text: truncateMiddle(observed), full: observed }
}
