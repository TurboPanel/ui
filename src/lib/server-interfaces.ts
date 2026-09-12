/**
 * Grouping for the server detail → Network → Interfaces panel.
 *
 * TurboPanel observes host interfaces, it does not configure them: these
 * helpers only arrange what the daemon reported and join each address to the
 * datacenter pin (if any) that names it. Nothing here implies an interface
 * can be brought up, addressed, or routed from the console.
 */

import type { IpRecord, ServerReportedIp } from '@/lib/instance-api'

export type InterfaceAddressGroup = {
  /** Interface name (`eth0`), or the public/private × family fallback label. */
  label: string
  /** True when this group's interface carries the host's default route. */
  defaultRoute: boolean
  addresses: ServerReportedIp[]
}

const FALLBACK_GROUPS: readonly {
  label: string
  scope: ServerReportedIp['scope']
  version: 4 | 6
}[] = [
  { label: 'Public IPv4', scope: 'public', version: 4 },
  { label: 'Public IPv6', scope: 'public', version: 6 },
  { label: 'Private IPv4', scope: 'private', version: 4 },
  { label: 'Private IPv6', scope: 'private', version: 6 },
]

const UNNAMED_INTERFACE_LABEL = 'Unnamed interface'

/**
 * Group by `interface` when the daemon reports interface names; otherwise
 * fall back to public/private × v4/v6. The default-route interface sorts
 * first, then names alphabetically; addresses keep daemon order.
 */
export function groupReportedAddresses(
  ips: readonly ServerReportedIp[],
): InterfaceAddressGroup[] {
  const named = ips.some((row) => typeof row.interface === 'string' && row.interface.trim().length > 0)
  if (!named) {
    return FALLBACK_GROUPS.map((group) => ({
      label: group.label,
      defaultRoute: false,
      addresses: ips.filter(
        (row) => row.scope === group.scope && row.version === group.version,
      ),
    })).filter((group) => group.addresses.length > 0)
  }
  const byInterface = new Map<string, InterfaceAddressGroup>()
  for (const row of ips) {
    const label = row.interface?.trim() || UNNAMED_INTERFACE_LABEL
    const group = byInterface.get(label) ?? {
      label,
      defaultRoute: false,
      addresses: [],
    }
    group.addresses.push(row)
    if (row.preferred) group.defaultRoute = true
    byInterface.set(label, group)
  }
  return [...byInterface.values()].sort((a, b) => {
    if (a.defaultRoute !== b.defaultRoute) return a.defaultRoute ? -1 : 1
    if (a.label === UNNAMED_INTERFACE_LABEL) return 1
    if (b.label === UNNAMED_INTERFACE_LABEL) return -1
    return a.label.localeCompare(b.label)
  })
}

/** Datacenter membership pins (`scope: 'datacenter'`, this server) keyed by address. */
export function indexPinsByAddress(
  pins: readonly IpRecord[],
): ReadonlyMap<string, IpRecord[]> {
  const map = new Map<string, IpRecord[]>()
  for (const pin of pins) {
    const key = pin.address.trim()
    const list = map.get(key) ?? []
    list.push(pin)
    map.set(key, list)
  }
  return map
}

/** `staleSince` as a short local timestamp, or `null` when absent / unparsable. */
export function formatStaleSince(staleSince: string | null | undefined): string | null {
  if (!staleSince) return null
  const date = new Date(staleSince)
  if (Number.isNaN(date.getTime())) return null
  return date.toLocaleString()
}
