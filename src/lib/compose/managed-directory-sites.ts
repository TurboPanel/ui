/**
 * Which uploaded-directory sites have nobody to own them.
 *
 * A `sourceKind: 'managed-directory'` site is "a directory **and an account**":
 * the webroot belongs to a project principal, and without one there is nobody
 * to upload as. Deploy-prepare refuses that combination
 * (`site_managed_directory_unowned`), which is correct but late — the operator
 * finds out when they press Deploy, not when they can still fix it.
 *
 * So this answers the same question on the project screen, where the fix is one
 * control away. Pure on purpose: the section owns the queries, this owns the
 * rule, and only this half is worth testing.
 */

import type { ComposeDocument } from '@/lib/compose'
import { readServiceTurbopanelExtension } from '@/lib/compose/service-kind'

/** Compose service names declaring an uploaded-directory site. */
export function managedDirectorySiteNames(
  document: ComposeDocument | null | undefined,
): string[] {
  const services = document?.data?.services
  if (typeof services !== 'object' || services === null) return []

  const names: string[] = []
  for (const [name, raw] of Object.entries(services as Record<string, unknown>)) {
    if (typeof raw !== 'object' || raw === null) continue
    const extension = readServiceTurbopanelExtension(raw as Record<string, unknown>)
    if (
      extension?.serviceKind === 'site' &&
      extension.sourceKind === 'managed-directory'
    ) {
      names.push(name)
    }
  }
  return names.sort((a, b) => a.localeCompare(b))
}

/**
 * Of those, the ones no principal stewards.
 *
 * A compose service with **no service row at all** counts as unowned, and that
 * is the common case rather than an edge one: service rows are written only by
 * `reconcileServicesFromCompose` at deploy-prepare, so before the first deploy
 * every site is in exactly this state. Reporting it is the point — that is the
 * moment the operator still has time to add the account.
 */
export function unownedManagedDirectorySites(params: {
  document: ComposeDocument | null | undefined
  /** Every service row known for this project's environments. */
  services: readonly { id: string; composeServiceName: string | null }[]
  principals: readonly { serviceIds: readonly string[] }[]
}): string[] {
  const declared = managedDirectorySiteNames(params.document)
  if (declared.length === 0) return []

  const stewarded = new Set<string>()
  for (const principal of params.principals) {
    for (const serviceId of principal.serviceIds) stewarded.add(serviceId)
  }

  const ownedNames = new Set<string>()
  for (const service of params.services) {
    if (service.composeServiceName && stewarded.has(service.id)) {
      ownedNames.add(service.composeServiceName)
    }
  }
  return declared.filter((name) => !ownedNames.has(name))
}
