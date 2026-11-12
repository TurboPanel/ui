import { parsePublicUrlEntry } from '@/lib/public-url-entry'
import { coversHostname } from '@/lib/tls-match'

export type HostnameCoverage = { host: string; covered: boolean }

/**
 * Whether an uploaded pair covers each control plane hostname, with the same
 * rule the control plane uses (`uploadedCertificateCoversHost`): an exact name,
 * or a wildcard that stands for exactly one label. Entries may carry a scheme
 * and port; only the host is compared.
 */
export function certificateCoverage(
  dnsNames: readonly string[],
  hostnames: readonly string[]
): HostnameCoverage[] {
  return hostnames.map((entry) => {
    const host = parsePublicUrlEntry(entry)?.host ?? entry.trim().toLowerCase()
    return { host: entry, covered: coversHostname([...dnsNames], host) }
  })
}
