/**
 * Which compose services cannot deploy without a project principal.
 *
 * A native (non-Railpack) release publishes a filesystem tree into
 * `<principalHome>/sites/<serviceId>/releases/`, so with no Unix account there
 * is no home to publish into. The daemon answers that by *silently skipping*
 * the release ("release skipped for <name>: no project principal assigned" in
 * the transcript), which is far too late and far too quiet — the deploy
 * "succeeds" with the service never released. Uploaded-directory sites have the
 * same need (deploy-prepare hard-refuses those as
 * `site_managed_directory_unowned`).
 *
 * So this answers the question on the project screen, where the fix is one
 * control away, and lets the lifecycle bar require a principal *before* the
 * operator presses Deploy. Pure on purpose: the callers own the queries, this
 * owns the rule, and only this half is worth testing.
 */

import type { ComposeDocument } from '@/lib/compose'
import { principalAliasesInComposeData } from '@/lib/compose/root-extension'
import { readServiceTurbopanelExtension } from '@/lib/compose/service-kind'

/**
 * Compose service names that need a principal to release: a Git source built
 * on the native lane (`buildKind` omitted or `native` — Railpack publishes an
 * image, not a tree), or an uploaded-directory site (a directory *and* an
 * account).
 */
export function principalRequiredServiceNames(
  document: ComposeDocument | null | undefined,
): string[] {
  const services = document?.data?.services
  if (typeof services !== 'object' || services === null) return []

  const names: string[] = []
  for (const [name, raw] of Object.entries(services as Record<string, unknown>)) {
    if (typeof raw !== 'object' || raw === null) continue
    const extension = readServiceTurbopanelExtension(raw as Record<string, unknown>)
    if (!extension) continue
    const nativeRelease =
      extension.source != null && extension.source.buildKind !== 'railpack'
    const uploadedDirectory =
      extension.serviceKind === 'site' &&
      extension.sourceKind === 'managed-directory'
    if (nativeRelease || uploadedDirectory) names.push(name)
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
export function unownedPrincipalRequiredServices(params: {
  document: ComposeDocument | null | undefined
  /** Every service row known for the scope being deployed. */
  services: readonly { id: string; composeServiceName: string | null }[]
  principals: readonly { serviceIds: readonly string[] }[]
}): string[] {
  const declared = principalRequiredServiceNames(params.document)
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
