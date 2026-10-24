/**
 * "Set up production": pure rules for the screen a new Compose project opens
 * on. It fills in the first environment (created with the project): its name,
 * the server, the first hostname, the Hosting Account and the variables.
 *
 * Everything here reads the environment's own compose, because the create
 * call puts the drafted compose there (the Base starts empty). Pure: no
 * network, no React.
 */

import { composePrincipalAliases, renameComposePrincipal } from '@/lib/compose/principals-document'
import {
  readHostingHostname,
  wwwSiblingHostname,
  type ComposeHostingExtensionEntry,
} from '@/lib/compose/hosting-extension'
import {
  readComposeHostingEntries,
  readComposeServiceMap,
  writeComposeHostingEntries,
} from '@/lib/compose/hosting-service-context'
import { isPrincipalAlias, readServiceTurbopanelExtension } from '@/lib/compose/service-kind'
import type { ComposeDocument, CreateVariableBody, OrgServerRecord } from '@/lib/instance-api'
import { validateEnvironmentName } from '@/lib/environment-validation'
import { variableUseFlags, type VariableUse } from '@/lib/v4/config-edits'

// --- server -------------------------------------------------------------------

/**
 * The server to show first: the environment's own pin, else the project's
 * default server, else the only connected server when there is exactly one.
 * With several servers and no pin, nothing is guessed.
 */
export function initialSetupServerId(
  environmentServerId: string | null | undefined,
  projectDefaultServerId: string | null | undefined,
  servers: readonly Pick<OrgServerRecord, 'id' | 'connected'>[]
): string | null {
  if (environmentServerId) return environmentServerId
  if (projectDefaultServerId) return projectDefaultServerId
  const connected = servers.filter((server) => server.connected)
  return connected.length === 1 ? (connected[0]?.id ?? null) : null
}

// --- hostname -----------------------------------------------------------------

/**
 * Services a hostname can be put on, sites and apps first: a site or an app
 * built from a repository is what visitors reach, while a plain image is as
 * likely to be a database or a worker.
 */
export function hostnameServiceNames(compose: ComposeDocument | null | undefined): string[] {
  if (!compose) return []
  const services = Object.entries(readComposeServiceMap(compose))
  const nativeFirst = (service: Record<string, unknown>) => {
    const kind = readServiceTurbopanelExtension(service)?.serviceKind
    return kind === 'site' || kind === 'node' ? 0 : 1
  }
  return services
    .map(([name, service], index) => ({ name, rank: nativeFirst(service), index }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map((entry) => entry.name)
}

/** The first hostname a service already declares (a repository's own compose can). */
export function declaredHostname(
  compose: ComposeDocument | null | undefined,
  serviceName: string | null
): ComposeHostingExtensionEntry | null {
  if (!compose || !serviceName) return null
  return readComposeHostingEntries(compose, serviceName)[0] ?? null
}

/** Empty is fine (add one later); anything else must be a name the edge can route on. */
export function hostnameProblem(text: string): string | null {
  const trimmed = text.trim()
  if (trimmed === '') return null
  return readHostingHostname(trimmed) === trimmed.toLowerCase()
    ? null
    : 'Enter a domain name such as example.com, without https:// or a path.'
}

/** The www spelling of a hostname, or null when it has none (an IP, a one-word name). */
export function wwwChoiceFor(hostname: string): string | null {
  const name = readHostingHostname(hostname)
  return name ? wwwSiblingHostname(name) : null
}

/**
 * The compose with the first hostname set on one service. The entry the
 * service already declared (if any) is replaced; its other entries stay. An
 * empty hostname leaves the compose as it was.
 */
export function composeWithHostname(
  compose: ComposeDocument,
  input: Readonly<{ serviceName: string; hostname: string; alsoWww: boolean }>
): ComposeDocument {
  const hostname = readHostingHostname(input.hostname)
  if (!hostname) return compose
  const existing = readComposeHostingEntries(compose, input.serviceName)
  const [first, ...rest] = existing
  // The service's own first entry keeps its other settings; the www choice is this screen's.
  const entry: ComposeHostingExtensionEntry = { ...first, hostname }
  delete entry.www
  if (input.alsoWww && wwwChoiceFor(hostname)) entry.www = 'www-to-root'
  const others = rest.filter((item) => item.hostname !== hostname)
  return writeComposeHostingEntries(compose, input.serviceName, [entry, ...others])
}

// --- Hosting Account ----------------------------------------------------------

export type SetupAccount = Readonly<{ alias: string; services: readonly string[] }>

/**
 * The Hosting Accounts the compose declares, each with the services that run
 * as it. A repository project gets one named after the project; the account
 * itself is made on the first deploy.
 */
export function setupAccounts(compose: ComposeDocument | null | undefined): SetupAccount[] {
  if (!compose) return []
  const services = Object.entries(readComposeServiceMap(compose))
  return composePrincipalAliases(compose).map((alias) => ({
    alias,
    services: services
      .filter(([, service]) => readServiceTurbopanelExtension(service)?.principal === alias)
      .map(([name]) => name),
  }))
}

/** A new name for the Hosting Account, checked before the compose is changed. */
export function accountNameProblem(name: string, others: readonly string[]): string | null {
  const trimmed = name.trim()
  if (!isPrincipalAlias(trimmed)) {
    return 'Use lowercase letters, digits, hyphens and underscores, starting with a letter.'
  }
  if (others.includes(trimmed)) return `${trimmed} is already a Hosting Account in this project.`
  return null
}

// --- variables ----------------------------------------------------------------

/** The control plane's variable name rule. */
const VARIABLE_KEY_RE = /^[A-Za-z_]\w*$/

export type SetupVariable = Readonly<{
  key: string
  value: string
  secret: boolean
  use: VariableUse
}>

export function variableKeyProblem(key: string, taken: readonly string[]): string | null {
  const trimmed = key.trim()
  if (trimmed === '') return 'Enter a name.'
  if (!VARIABLE_KEY_RE.test(trimmed)) {
    return 'Use letters, digits and underscores, starting with a letter or underscore.'
  }
  if (taken.includes(trimmed)) return `${trimmed} is already in the list.`
  return null
}

export type SetupVariableBody = Pick<
  CreateVariableBody,
  'key' | 'value' | 'isSecret' | 'forBuild' | 'forRuntime'
>

/** One create call per variable (the caller adds the environment). */
export function setupVariableBodies(variables: readonly SetupVariable[]): SetupVariableBody[] {
  return variables.map((variable) => ({
    key: variable.key.trim(),
    value: variable.value,
    isSecret: variable.secret,
    ...variableUseFlags(variable.use),
  }))
}

// --- what Save sends ----------------------------------------------------------

/**
 * The one `PATCH /environments/:id` body Save sends, or null when nothing
 * changed. `options` replaces the stored options, so the primary hostname is
 * sent back as it was.
 */
export function setupEnvironmentPatch(
  input: Readonly<{
    savedName: string
    name: string
    savedServerId: string | null
    serverId: string | null
    savedCompose: ComposeDocument | null
    compose: ComposeDocument | null
    primaryHostname: string | null
  }>
): {
  name?: string
  serverId?: string
  options?: { compose: ComposeDocument; primaryHostname?: string | null }
} | null {
  const patch: {
    name?: string
    serverId?: string
    options?: { compose: ComposeDocument; primaryHostname?: string | null }
  } = {}
  const name = input.name.trim()
  if (name && name !== input.savedName) patch.name = name
  if (input.serverId && input.serverId !== input.savedServerId) patch.serverId = input.serverId
  if (input.compose && input.compose !== input.savedCompose) {
    patch.options = {
      compose: input.compose,
      ...(input.primaryHostname ? { primaryHostname: input.primaryHostname } : {}),
    }
  }
  return Object.keys(patch).length > 0 ? patch : null
}

// --- the form as a whole ------------------------------------------------------

/**
 * Field errors before Save, keyed `name`, `hostname` and `account:<alias>`.
 * Empty when everything can be saved.
 */
export function setupFormProblems(
  input: Readonly<{
    name: string
    hostname: string
    accounts: readonly SetupAccount[]
    accountNames: Readonly<Record<string, string>>
  }>
): Record<string, string> {
  const found: Record<string, string> = {}
  const nameError = validateEnvironmentName(input.name)
  if (nameError) found.name = nameError
  const hostError = hostnameProblem(input.hostname)
  if (hostError) found.hostname = hostError
  const finalNames = input.accounts.map(
    (account) => input.accountNames[account.alias] ?? account.alias
  )
  input.accounts.forEach((account, index) => {
    const others = finalNames.filter((_, other) => other !== index)
    const problem = accountNameProblem(finalNames[index] ?? '', others)
    if (problem) found[`account:${account.alias}`] = problem
  })
  return found
}

/** The environment compose with the renamed accounts and the first hostname applied. */
export function setupCompose(
  compose: ComposeDocument | null,
  input: Readonly<{
    accounts: readonly SetupAccount[]
    accountNames: Readonly<Record<string, string>>
    serviceName: string | null
    hostname: string
    alsoWww: boolean
  }>
): ComposeDocument | null {
  if (!compose) return null
  let next = compose
  for (const account of input.accounts) {
    const renamed = (input.accountNames[account.alias] ?? account.alias).trim()
    next = renameComposePrincipal(next, account.alias, renamed)
  }
  if (!input.serviceName) return next
  return composeWithHostname(next, {
    serviceName: input.serviceName,
    hostname: input.hostname,
    alsoWww: input.alsoWww,
  })
}
