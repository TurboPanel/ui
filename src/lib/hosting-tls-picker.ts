/**
 * Which library certificates the hosting editor offers for the typed
 * hostnames and www choice, and what it says about a pinned one that no
 * longer fits.
 *
 * Mirrors the control plane's `pinCoverageNames`: an uploaded (or other
 * library) certificate has to cover every typed name plus the names the www
 * choice adds, while a Let's Encrypt certificate only has to cover the typed
 * names, because Caddy issues each added www name its own certificate.
 */

import {
  type HostingWwwMode,
  effectiveWwwMode,
  wwwCertificateNames,
  wwwExtraNames,
  wwwHostnames,
} from './hosting-www'
import type { TlsSource, TlsStatus } from './instance-api'
import { coversHostname } from './tls-match'

/** The fields of a library certificate the picker reads. */
export type PickerCertificate = Readonly<{
  id: string
  source: TlsSource
  metadata: Readonly<{ status: TlsStatus; dnsNames: string[] }>
}>

function namesToCover(
  source: TlsSource,
  hostnames: readonly string[],
  mode: HostingWwwMode
): readonly string[] {
  return source === 'lets_encrypt' ? hostnames : wwwCertificateNames(hostnames, mode)
}

function uncoveredNames(
  row: PickerCertificate,
  hostnames: readonly string[],
  mode: HostingWwwMode
): string[] {
  return namesToCover(row.source, hostnames, mode).filter(
    (name) => !coversHostname(row.metadata.dnsNames, name)
  )
}

function isUsable(row: PickerCertificate): boolean {
  return row.metadata.status === 'ready' || row.metadata.status === 'managed'
}

/**
 * The ready certificates that cover the hostname field's text under the www
 * choice (see the module note for the Let's Encrypt rule). Hostnames are
 * matched lowercased. Nothing covers an empty field.
 */
export function coveringCertificates<T extends PickerCertificate>(
  rows: readonly T[],
  hostnamesText: string,
  wwwChoice: HostingWwwMode | null
): T[] {
  const hostnames = wwwHostnames(hostnamesText)
  if (hostnames.length === 0) return []
  const mode = effectiveWwwMode(wwwChoice, hostnames)
  return rows.filter((row) => isUsable(row) && uncoveredNames(row, hostnames, mode).length === 0)
}

export type PinnedCertificateGap<T extends PickerCertificate> = Readonly<{
  row: T
  /** The names the pinned certificate does not cover. */
  missing: string[]
  /** One plain sentence for under the picker. */
  note: string
}>

/**
 * The pinned certificate when it no longer covers the names, so the picker
 * can keep showing it as chosen and say the deploy will be refused, rather
 * than drop it from the list while the pin stays saved. Null when nothing is
 * pinned, the pin is not in the library, or it covers every name.
 */
export function pinnedCertificateGap<T extends PickerCertificate>(
  rows: readonly T[],
  tlsId: string | null,
  hostnamesText: string,
  wwwChoice: HostingWwwMode | null
): PinnedCertificateGap<T> | null {
  if (tlsId === null) return null
  const row = rows.find((candidate) => candidate.id === tlsId)
  const hostnames = wwwHostnames(hostnamesText)
  if (row === undefined || hostnames.length === 0) return null
  const mode = effectiveWwwMode(wwwChoice, hostnames)
  const missing = uncoveredNames(row, hostnames, mode)
  if (missing.length === 0) return null
  const added = new Set(wwwExtraNames(hostnames, mode))
  const fix = missing.every((name) => added.has(name))
    ? 'change the www choice'
    : 'change the hostnames'
  return {
    row,
    missing,
    note: `This certificate doesn’t cover ${missing.join(' and ')}, so the deploy will be refused. Pick another or ${fix}.`,
  }
}
