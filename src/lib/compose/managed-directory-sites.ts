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
import { principalAliasesInComposeData } from '@/lib/compose/root-extension'
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
 * Compose service names whose declared `x-turbopanel.principal` resolves to an
 * alias the document's root actually declares.
 *
 * A dangling alias is deliberately **not** counted as owned: it names an
 * account that does not exist, which is the same standing as naming none. The
 * compose linter reports it separately, with the line number.
 */
function aliasOwnedServiceNames(
  document: ComposeDocument | null | undefined
): Set<string> {
  const services = document?.data?.services
  if (typeof services !== 'object' || services === null) return new Set()

  const declared = principalAliasesInComposeData(document?.data)
  const owned = new Set<string>()
  for (const [name, raw] of Object.entries(services as Record<string, unknown>)) {
    if (typeof raw !== 'object' || raw === null) continue
    const alias = readServiceTurbopanelExtension(raw as Record<string, unknown>)
      ?.principal
    if (alias && declared.has(alias)) owned.add(name)
  }
  return owned
}

/**
 * Of those, the ones with nobody to own them.
 *
 * **A declared alias is the answer.** A service whose `x-turbopanel.principal`
 * names an alias the document's root declares is owned, full stop — no service
 * row and no query needed, which matters because service rows are written only
 * by `reconcileServicesFromCompose` at deploy-prepare, so before the first
 * deploy every one of these services has no row at all. Reporting *that* as
 * unowned was correct but noisy; reporting it as unowned when the operator has
 * already written down which account it runs as would be wrong.
 *
 * The steward check stays as the **fallback**, mirroring the resolution
 * precedence deploy-prepare uses: a document that names no alias — everything
 * saved before the field existed — is still owned by whatever principal an
 * operator assigned in the UI.
 */
export function unownedManagedDirectorySites(params: {
  document: ComposeDocument | null | undefined
  /** Every service row known for this project's environments. */
  services: readonly { id: string; composeServiceName: string | null }[]
  principals: readonly { serviceIds: readonly string[] }[]
}): string[] {
  const declared = managedDirectorySiteNames(params.document)
  if (declared.length === 0) return []

  const aliasOwned = aliasOwnedServiceNames(params.document)
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
  return declared.filter(
    (name) => !aliasOwned.has(name) && !ownedNames.has(name),
  )
}
