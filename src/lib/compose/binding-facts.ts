import type { BindingRecord, ServiceRecord } from '@/lib/instance-api'

/** What an environment's database bindings say about one compose service. */
export type ServiceBindingFacts = {
  /** Variable names the control plane writes into the service's environment. */
  keys: string[]
  /** `host:port` the service reaches the database at, when the binding has one. */
  endpoint: string | null
}

/**
 * Group bindings by the compose service that consumes them. Only facts the
 * binding record itself carries — nothing is inferred about how an app reads
 * them.
 */
export function bindingFactsByService(
  bindings: readonly BindingRecord[],
  services: readonly Pick<ServiceRecord, 'id' | 'composeServiceName'>[]
): Record<string, ServiceBindingFacts> {
  const nameById = new Map<string, string>()
  for (const service of services) {
    if (service.composeServiceName) {
      nameById.set(service.id, service.composeServiceName)
    }
  }
  const out: Record<string, ServiceBindingFacts> = {}
  for (const binding of bindings) {
    const name = nameById.get(binding.serviceId)
    if (!name) continue
    const facts = out[name] ?? { keys: [], endpoint: null }
    facts.keys = [...new Set([...facts.keys, ...binding.keys])]
    facts.endpoint ??= binding.endpoint ? `${binding.endpoint.host}:${binding.endpoint.port}` : null
    out[name] = facts
  }
  return out
}

/**
 * The one-line tag on a service box. A container service gets its variables
 * named (`env: DB_URL`, or a count past one); a site is shown the endpoint it
 * would reach, because how a site reads that is up to its own code.
 */
export function bindingTagLabel(
  facts: ServiceBindingFacts | undefined,
  isSite: boolean
): string | null {
  if (!facts) return null
  if (isSite) return facts.endpoint ? `database ${facts.endpoint}` : null
  if (facts.keys.length === 0) return null
  const [only] = facts.keys
  return facts.keys.length === 1 ? `env: ${only}` : `env: ${facts.keys.length} variables`
}
