/**
 * Pure site readiness for the Network area cards.
 *
 * Mirrors instance `assertDatacenterHasCidr` (private CIDR present) and the
 * per-server gap from `loadServerDatacenterAddress` — data only; copy lives
 * in the component.
 */

export type SiteReadinessInput = Readonly<{
  datacenter: { privateCidrs: readonly string[] }
  memberServers: readonly { id: string }[]
  /**
   * Full `scope: 'datacenter'` IP list for members (and free pool). Match by
   * `serverId` only — do not require `datacenterId` (server-owned rows often
   * leave it null; mirrors instance `loadServerDatacenterAddress`).
   */
  datacenterScopedIps: readonly {
    serverId: string | null
    scope?: string
    datacenterId?: string | null
  }[]
}>

export type SiteReadiness = {
  hasPrivateCidr: boolean
  /** Server ids that are members but lack a `scope: 'datacenter'` IP. */
  serversMissingPrivateAddress: string[]
}

export type SiteReadinessLabel =
  | 'ready'
  | 'no-private-network'
  | 'servers-missing-address'

export function resolveSiteReadiness(input: SiteReadinessInput): SiteReadiness {
  const hasPrivateCidr = input.datacenter.privateCidrs.length > 0
  const addressed = new Set<string>()
  for (const ip of input.datacenterScopedIps) {
    if (!ip.serverId) continue
    if (ip.scope != null && ip.scope !== 'datacenter') continue
    addressed.add(ip.serverId)
  }
  const serversMissingPrivateAddress = input.memberServers
    .filter((server) => !addressed.has(server.id))
    .map((server) => server.id)
    .sort((a, b) => a.localeCompare(b))
  return { hasPrivateCidr, serversMissingPrivateAddress }
}

export function siteReadinessLabel(
  readiness: SiteReadiness,
): SiteReadinessLabel {
  if (!readiness.hasPrivateCidr) return 'no-private-network'
  if (readiness.serversMissingPrivateAddress.length > 0) {
    return 'servers-missing-address'
  }
  return 'ready'
}
