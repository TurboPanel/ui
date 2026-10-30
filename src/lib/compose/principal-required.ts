/**
 * Which compose services cannot deploy without a project principal.
 *
 * A native (non-image) release publishes a filesystem tree into
 * `/srv/users/<owner>/<environment>/services/<service>/releases/`, so with no Unix account there
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
import {
  isImageBuildKind,
  patchServiceTurbopanelExtension,
  readServiceTurbopanelExtension,
} from '@/lib/compose/service-kind'
import {
  nextPrincipalAlias,
  readComposePrincipals,
  writeComposePrincipals,
} from '@/lib/compose/principals-document'

/**
 * Compose service names that need a principal to release: a Git source built
 * on the native lane (`buildKind` omitted or `native` — an image build publishes an
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
      extension.source != null && !isImageBuildKind(extension.source.buildKind)
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

/** Point the named services at `alias`, leaving any that already name one. */
function attachAlias(
  document: ComposeDocument,
  alias: string,
  names: readonly string[]
): ComposeDocument {
  const services = document.data?.services
  if (typeof services !== 'object' || services === null) return document
  const next: Record<string, unknown> = { ...(services as Record<string, unknown>) }
  let changed = false
  for (const name of names) {
    const raw = next[name]
    if (typeof raw !== 'object' || raw === null) continue
    const service = raw as Record<string, unknown>
    if (readServiceTurbopanelExtension(service)?.principal) continue
    next[name] = patchServiceTurbopanelExtension(service, { principal: alias })
    changed = true
  }
  return changed ? { ...document, data: { ...document.data, services: next } } : document
}

/**
 * Declare an account in a document and, when it is the only account the whole
 * project has (`sole`), attach the apps that have nobody to run as to it.
 *
 * With more than one account the choice is ambiguous, so nothing is attached
 * and the Run as chooser decides.
 */
export function declareAccountAndAttach(
  document: ComposeDocument,
  alias: string,
  unownedNames: readonly string[],
  sole: boolean
): ComposeDocument {
  const declared = readComposePrincipals(document)
  const withAlias =
    alias in declared ? document : writeComposePrincipals(document, { ...declared, [alias]: {} })
  return sole ? attachAlias(withAlias, alias, unownedNames) : withAlias
}

/** One compose document the account change has to be saved into. */
export type AccountWrite = {
  target: { kind: 'base' } | { kind: 'environment'; environmentId: string }
  document: ComposeDocument
}

/** An account row as the panel lists it for the project. */
export type AccountRow = {
  username: string
  metadata?: { composeAlias?: string } | null
}

/**
 * Every account the project has, by lowercase name: the aliases any document
 * declares, plus the accounts made by hand on Bindings (rows with no alias,
 * counted by their typed name; rows that came from an alias count under it).
 * "The project has exactly one account" must be judged on this set, not on one
 * document, or a second account hides in another document or in a hand-made row.
 */
export function knownAccountNames(
  documents: readonly (ComposeDocument | null | undefined)[],
  rows: readonly AccountRow[]
): Set<string> {
  const names = new Set<string>()
  for (const document of documents) {
    for (const alias of Object.keys(readComposePrincipals(document))) {
      names.add(alias.toLowerCase())
    }
  }
  for (const row of rows) {
    names.add((row.metadata?.composeAlias ?? row.username).toLowerCase())
  }
  return names
}

/**
 * What "Add system user" has to write while apps are waiting for an account.
 *
 * Apps wait in whichever document declares them: the Base, or an
 * environment's own compose (a project created from a repository keeps its
 * app in the first environment). Each such document gets the account declared,
 * and the account is attached when it is the project's only one. Returns
 * `null` when no app is waiting, so the caller falls back to adding a plain
 * account row.
 */
export function planAccountDeclaration(params: {
  username: string
  base: ComposeDocument | null | undefined
  environments: readonly {
    id: string
    document: ComposeDocument | null | undefined
    services: readonly { id: string; composeServiceName: string | null }[]
  }[]
  principals: readonly ({ serviceIds: readonly string[] } & AccountRow)[]
}): { alias: string; writes: AccountWrite[] } | null {
  const allServices = params.environments.flatMap((env) => env.services)
  const targets: {
    target: AccountWrite['target']
    document: ComposeDocument
    unowned: string[]
  }[] = []
  const consider = (
    target: AccountWrite['target'],
    document: ComposeDocument | null | undefined,
    services: readonly { id: string; composeServiceName: string | null }[]
  ) => {
    if (!document) return
    const unowned = unownedPrincipalRequiredServices({
      document,
      services,
      principals: params.principals,
    })
    if (unowned.length > 0) targets.push({ target, document, unowned })
  }
  consider({ kind: 'base' }, params.base, allServices)
  for (const env of params.environments) {
    consider({ kind: 'environment', environmentId: env.id }, env.document, env.services)
  }
  if (targets.length === 0) return null

  const alias = nextPrincipalAlias([], params.username)
  // A typed name equal to an existing account is that account (the panel binds
  // the alias to the hand-made row of the same name instead of making a second),
  // so it does not count twice.
  const known = knownAccountNames(
    [params.base, ...params.environments.map((env) => env.document)],
    params.principals
  )
  known.add(alias.toLowerCase())
  const sole = known.size === 1
  return {
    alias,
    writes: targets.map(({ target, document, unowned }) => ({
      target,
      document: declareAccountAndAttach(document, alias, unowned, sole),
    })),
  }
}

/**
 * After an edit: a project with exactly one account gives it to every app that
 * this edit just turned into one needing an account, so a new app is deployable
 * without visiting the chooser. Apps that already name an account, and every
 * app that was already waiting before the edit, are left alone.
 */
export function attachSoleAccountToNewApps(
  before: ComposeDocument | null | undefined,
  after: ComposeDocument,
  /** Names of the project's other accounts (see `knownAccountNames`). */
  projectAccounts: ReadonlySet<string> = new Set()
): ComposeDocument {
  const aliases = Object.keys(readComposePrincipals(after))
  if (aliases.length !== 1) return after
  const all = new Set([...projectAccounts, aliases[0].toLowerCase()])
  if (all.size !== 1) return after
  const existing = new Set(principalRequiredServiceNames(before))
  const added = principalRequiredServiceNames(after).filter((name) => !existing.has(name))
  return added.length === 0 ? after : attachAlias(after, aliases[0], added)
}
