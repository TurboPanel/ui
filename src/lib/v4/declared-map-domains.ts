import type { ConfigViewSide } from '@/lib/instance-api'
import type { MapDomain, MapInput } from './map-layout'
import { statusInfo } from './status-vocab'

/** "example.com/api" names the host "example.com". */
function hostOf(value: string): string {
  const slash = value.indexOf('/')
  return (slash < 0 ? value : value.slice(0, slash)).trim()
}

/**
 * The map with every hostname the environment's configuration declares,
 * not only the ones a deploy has turned into hosting rows.
 *
 * Saved without deploying, a hostname lives only in the configuration: the
 * Hosting tab lists it, but there is no hosting row yet, so the map would say
 * "No hostnames yet". Each such hostname is added once, marked not deployed
 * yet, on the service that answers it. The Base view draws no hostnames.
 */
export function withDeclaredDomains(input: MapInput, side: ConfigViewSide): MapInput {
  if (input.mode === 'base') return input
  const seen = new Set(input.domains.map((domain) => domain.host.toLowerCase()))
  const status = { key: 'never', label: statusInfo('never').label }
  const declared: MapDomain[] = []
  for (const service of side.services) {
    for (const row of service.rows) {
      if (row.area !== 'domain' || !row.value) continue
      const host = hostOf(row.value)
      const key = host.toLowerCase()
      if (host === '' || seen.has(key)) continue
      seen.add(key)
      declared.push({ host, status, serviceId: service.name })
    }
  }
  return declared.length === 0 ? input : { ...input, domains: [...input.domains, ...declared] }
}
