import type { ComposeDocument } from '@/lib/compose/types'
import { readServiceTurbopanelExtension } from '@/lib/compose/service-kind'
import { declaredHostingByService } from '@/lib/hosting-compose-move'
import type {
  DeployPreviewNativeAppVariable,
  DeployPreviewResponse,
  DeployPreviewServiceVariable,
  DeployPreviewSource,
} from '@/lib/instance-api'

/** One hostname a service is reached at; `tunnel` when the name rides a tunnel. */
export type DeploySummaryHostname = Readonly<{ name: string; tunnel: boolean }>

/** One row of "What Runs Where": a service, where it runs and how it is reached. */
export type DeploySummaryService = Readonly<{
  name: string
  /** Plain words: Node app, PHP site, container … */
  kind: string
  /** Server names it runs on; empty until a server is chosen. */
  servers: readonly string[]
  /** Where the code comes from (repo @ branch, image, files), when it is known. */
  origin: string | null
  hostnames: readonly DeploySummaryHostname[]
}>

/** One variable TurboPanel sets itself, with what it means. Never a secret value. */
export type DeploySummaryVariable = Readonly<{
  name: string
  /** `null` for a secret, or when the answer sent no value. */
  value: string | null
  meaning: string
}>

export type DeploySummaryVariableGroup = Readonly<{
  service: string
  variables: readonly DeploySummaryVariable[]
}>

/** One variable a person set, by its own name. A secret has no value. */
export type DeploySummaryUserVariable = Readonly<{
  name: string
  value: string | null
  secret: boolean
}>

/** A service's own variables, split by when they are used (one can be in both). */
export type DeploySummaryServiceVariables = Readonly<{
  service: string
  building: readonly DeploySummaryUserVariable[]
  running: readonly DeploySummaryUserVariable[]
}>

export type DeploySummary = Readonly<{
  services: readonly DeploySummaryService[]
  variableGroups: readonly DeploySummaryVariableGroup[]
  serviceVariables: readonly DeploySummaryServiceVariables[]
}>

/** What each variable TurboPanel sets on a Node app means, in one line. */
const PLATFORM_VARIABLE_MEANINGS: Readonly<Record<string, string>> = {
  HOST: 'listen address, not the public name',
  HOSTNAME: 'listen address, not the public name',
  PORT: 'port the app listens on',
  NODE_ENV: 'application mode',
  PATH: 'where the app finds its tools',
  HOME: 'the app’s writable home folder',
  TMPDIR: 'the app’s temporary folder',
  XDG_CACHE_HOME: 'the app’s cache folder',
  COREPACK_HOME: 'where package manager downloads are kept',
  COREPACK_ENABLE_DOWNLOAD_PROMPT: 'stops the package manager asking before it downloads',
}

const GENERIC_VARIABLE_MEANING = 'set by TurboPanel for every app'

export function platformVariableMeaning(name: string): string {
  return PLATFORM_VARIABLE_MEANINGS[name] ?? GENERIC_VARIABLE_MEANING
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** `acme/app` from `https://host/acme/app.git` or `git@host:acme/app.git`. */
function repositoryLabel(cloneUrl: string): string {
  const bare = cloneUrl.replace(/\.git$/, '')
  const scp = /^[^@/]+@[^:/]+:(.+)$/.exec(bare)
  if (scp?.[1]) return scp[1]
  try {
    const path = new URL(bare).pathname.replace(/^\/+|\/+$/g, '')
    return path.length > 0 ? path : bare
  } catch {
    return bare
  }
}

function sourceOrigin(source: DeployPreviewSource): string {
  const where = source.subdirectory ? ` (${source.subdirectory})` : ''
  return `${repositoryLabel(source.cloneUrl)} @ ${source.ref}${where}`
}

function serviceKindLabel(service: Record<string, unknown>): string {
  const extension = readServiceTurbopanelExtension(service)
  if (extension?.serviceKind === 'node') {
    return extension.runtime === 'deno' ? 'Deno app' : 'Node app'
  }
  if (extension?.serviceKind === 'site') {
    return extension.php ? 'PHP site' : 'Website'
  }
  return 'Container'
}

function serviceOrigin(
  service: Record<string, unknown>,
  source: DeployPreviewSource | undefined
): string | null {
  if (source) return sourceOrigin(source)
  const extension = readServiceTurbopanelExtension(service)
  if (extension?.source?.branch) return `Git source @ ${extension.source.branch}`
  if (extension?.serviceKind === 'site' && extension.sourceKind === 'managed-directory') {
    return 'Files in the site’s own folder'
  }
  if (typeof service.image === 'string' && service.image.trim() !== '') {
    return `Image ${service.image.trim()}`
  }
  return null
}

function serversFor(
  name: string,
  preview: DeployPreviewResponse | null,
  placementLabel: string | null
): string[] {
  const split = preview?.servers
  if (split && split.length > 1) {
    return split
      .filter((server) => server.services?.includes(name))
      .map((server) => server.name?.trim() || server.serverId)
  }
  return placementLabel ? [placementLabel] : []
}

function hostnamesFor(
  name: string,
  declared: ReadonlyMap<string, readonly string[]>,
  rows: Readonly<Record<string, readonly string[]>>,
  tunnelHostnames: ReadonlySet<string>
): DeploySummaryHostname[] {
  const seen = new Set<string>()
  const out: DeploySummaryHostname[] = []
  for (const hostname of [...(declared.get(name) ?? []), ...(rows[name] ?? [])]) {
    const key = hostname.trim().toLowerCase()
    if (key === '' || seen.has(key)) continue
    seen.add(key)
    out.push({ name: key, tunnel: tunnelHostnames.has(key) })
  }
  return out
}

function platformVariables(
  entries: readonly DeployPreviewNativeAppVariable[]
): DeploySummaryVariable[] {
  return entries
    .filter((entry) => entry.source === 'platform' && entry.delivered)
    .map((entry) => ({
      name: entry.name,
      value: entry.isSecret ? null : entry.value,
      meaning: platformVariableMeaning(entry.name),
    }))
}

function userVariable(entry: DeployPreviewServiceVariable): DeploySummaryUserVariable {
  return {
    name: entry.name,
    value: entry.isSecret ? null : entry.value,
    secret: entry.isSecret,
  }
}

function serviceVariableGroups(
  preview: DeployPreviewResponse | null
): DeploySummaryServiceVariables[] {
  return (preview?.serviceVariables ?? [])
    .map((group) => ({
      service: group.composeServiceName,
      building: group.variables.filter((v) => v.forBuild).map(userVariable),
      running: group.variables.filter((v) => v.forRuntime).map(userVariable),
    }))
    .filter((group) => group.building.length > 0 || group.running.length > 0)
}

export type DeploySummaryInput = Readonly<{
  /** The compose as it will deploy: the project's with this environment's changes. */
  document: ComposeDocument
  /** The prepared deploy; `null` until it loads (or when it cannot). */
  preview: DeployPreviewResponse | null
  /** Display name of the pinned server, or `null` when none is chosen. */
  placementLabel: string | null
  /** Hostnames saved as hostings, by compose service name. */
  savedHostnames?: Readonly<Record<string, readonly string[]>>
  /** Lower-case hostnames a tunnel carries. */
  tunnelHostnames?: ReadonlySet<string>
}>

/**
 * The plain-words picture of a deploy: which service runs where, where its code
 * comes from, which names reach it, and the variables TurboPanel sets. Pure;
 * a secret's value is never read into the result.
 */
export function buildDeploySummary(input: DeploySummaryInput): DeploySummary {
  const { document, preview, placementLabel } = input
  const servicesNode = document.data.services
  const declared = new Map(
    declaredHostingByService(document).map((entry) => [
      entry.composeServiceName,
      entry.entries.map((hosting) => hosting.hostname),
    ])
  )
  const sources = new Map((preview?.sources ?? []).map((s) => [s.composeServiceName, s]))
  const services: DeploySummaryService[] = isRecord(servicesNode)
    ? Object.entries(servicesNode)
        .filter((pair): pair is [string, Record<string, unknown>] => isRecord(pair[1]))
        .map(([name, service]) => ({
          name,
          kind: serviceKindLabel(service),
          servers: serversFor(name, preview, placementLabel),
          origin: serviceOrigin(service, sources.get(name)),
          hostnames: hostnamesFor(
            name,
            declared,
            input.savedHostnames ?? {},
            input.tunnelHostnames ?? new Set()
          ),
        }))
    : []
  const variableGroups = (preview?.nativeAppVariables ?? [])
    .map((app) => ({
      service: app.composeServiceName,
      variables: platformVariables(app.variables ?? []),
    }))
    .filter((group) => group.variables.length > 0)
  return { services, variableGroups, serviceVariables: serviceVariableGroups(preview) }
}
