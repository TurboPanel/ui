import type { ProjectRecord } from '@/lib/instance-api'
import {
  SYSTEM_PROJECT_METADATA_TYPE,
  TURBOPANEL_WORKSPACE_BADGE_LABEL,
} from '@/lib/system-inventory'

/** True when the project has not yet chosen compose / template / managed. */
export function projectNeedsSetup(project: ProjectRecord): boolean {
  const type = project.metadata?.type
  return type == null || type === 'empty'
}

export function isManagedProject(project: ProjectRecord): boolean {
  return project.metadata?.type === 'managed'
}

export function isComposeOrTemplateProject(project: ProjectRecord): boolean {
  const type = project.metadata?.type
  return type === 'docker-compose' || type === 'template' || type == null
}

export function isComposeProject(project: ProjectRecord): boolean {
  const type = project.metadata?.type
  return type === 'docker-compose' || type === 'template'
}

/**
 * Display classifier only — true when `metadata.type` is the platform `system`
 * stamp. `isTurbopanelProject` / `workspaceKind` remain the authoritative
 * read-only gate.
 */
export function isSystemProject(project: ProjectRecord): boolean {
  return project.metadata?.type === SYSTEM_PROJECT_METADATA_TYPE
}

export function projectTypeLabel(project: ProjectRecord): string {
  const type = project.metadata?.type
  if (type === SYSTEM_PROJECT_METADATA_TYPE) {
    return TURBOPANEL_WORKSPACE_BADGE_LABEL
  }
  if (type === 'managed') return 'Managed'
  if (type === 'template') return 'Template'
  if (type === 'docker-compose') return 'Compose'
  return 'Setup'
}

/**
 * Compose project section tabs inside the editor chrome. Project · environment
 * scope chips stay in the header; switching scope keeps the active tab.
 * `overview` (topology diagram), `compose` (YAML), and `services` (service
 * cards) are **lenses** on one artifact; the surface nav bar shows them plus
 * `bindings` (system users and bound databases) and `hosting` (server
 * placement and exposure). Storage / Settings are configuration routes reached from a
 * service row or the scope-strip gear. `servers` is retired — placement lives
 * on the Hosting tab and `/servers` paths redirect there. `/map` is the
 * retired Overview path and redirects to `/overview`.
 */
export const COMPOSE_PROJECT_TAB_IDS = [
  'overview',
  'compose',
  'services',
  'bindings',
  'hosting',
  'storage',
  'settings',
] as const

export type ComposeProjectTabId = (typeof COMPOSE_PROJECT_TAB_IDS)[number]

/** Create-wizard draft has no environments and no row to configure — lenses only. */
export const DRAFT_COMPOSE_PROJECT_TAB_IDS = [
  'overview',
  'compose',
  'services',
] as const

/**
 * Repository **app** drafts synthesize their whole compose document from the
 * repository binding — there is no YAML or service card worth editing before
 * create, so the topology diagram is the only lens the draft *enables*. The
 * surface nav still renders the full tab bar with the rest dimmed.
 */
export const DRAFT_REPOSITORY_APP_TAB_IDS = ['overview'] as const

/** Platform projects never accept mutations from the UI. */
export function systemProjectAllowsMutations(): boolean {
  return false
}

export const COMPOSE_PROJECT_TAB_LABELS: Record<ComposeProjectTabId, string> = {
  overview: 'Overview',
  compose: 'Compose',
  services: 'Services',
  hosting: 'Hosting',
  bindings: 'Bindings',
  storage: 'Storage',
  settings: 'Settings',
}

/** The three lenses on the compose artifact, in lens-bar order. */
export const COMPOSE_PROJECT_LENS_IDS = [
  'overview',
  'compose',
  'services',
] as const

/**
 * Tabs on the surface nav bar, in order: the three lenses plus Bindings
 * (system users and bound databases — what a service deploys *as* and
 * connects *to*) and Hosting (server placement and hostnames / proxying).
 */
export const COMPOSE_PROJECT_SURFACE_TAB_IDS = [
  'overview',
  'compose',
  'services',
  'bindings',
  'hosting',
] as const

export function isComposeProjectLens(
  tabId: ComposeProjectTabId,
): boolean {
  return (COMPOSE_PROJECT_LENS_IDS as readonly string[]).includes(tabId)
}

/**
 * Scope configuration routes, reached from the document's scope-strip gear.
 * Not lenses, and deliberately not a nav list.
 */
export const COMPOSE_PROJECT_CONFIG_TAB_IDS: readonly ComposeProjectTabId[] = [
  'storage',
  'settings',
]

export const MANAGED_PROJECT_TAB_IDS = [
  'overview',
  'connect',
  'data',
  'backups',
  'environments',
] as const

export type ManagedProjectTabId = (typeof MANAGED_PROJECT_TAB_IDS)[number]

export const MANAGED_PROJECT_TAB_LABELS: Record<ManagedProjectTabId, string> = {
  overview: 'Overview',
  connect: 'Connect',
  environments: 'Environments',
  data: 'Data',
  backups: 'Backups',
}

export type ProjectTabId = ComposeProjectTabId | ManagedProjectTabId

export function projectHref(
  orgId: string,
  projectId: string,
): `/${string}/projects/${string}` {
  return `/${orgId}/projects/${projectId}`
}

export function projectSetupHref(
  orgId: string,
  projectId: string,
): string {
  return `${projectHref(orgId, projectId)}/setup`
}

export function projectTabHref(
  orgId: string,
  projectId: string,
  tabId: ProjectTabId,
): string {
  return `${projectHref(orgId, projectId)}/${tabId}`
}

/**
 * The project's Environments tab (one row per environment) — no environment
 * segment, no query. Path: `/projects/:projectId/overview`
 */
export function projectOverviewHref(orgId: string, projectId: string): string {
  return projectTabHref(orgId, projectId, 'overview')
}

/**
 * Compose YAML editor for Project scope (the Base tab).
 * Path: `/projects/:projectId/base/compose`
 */
export function projectComposeHref(orgId: string, projectId: string): string {
  return `${projectBaseHref(orgId, projectId)}/compose`
}

/**
 * Services (visual) editor for Project scope (the Base tab).
 * Path: `/projects/:projectId/base/services` (not `/services/:serviceId`).
 */
export function projectServicesEditHref(
  orgId: string,
  projectId: string,
): string {
  return `${projectBaseHref(orgId, projectId)}/services`
}

/**
 * Hosting (server placement + hostnames / ports / TLS) for Project scope.
 * Path: `/projects/:projectId/base/hosting`
 */
export function projectHostingHref(orgId: string, projectId: string): string {
  return `${projectBaseHref(orgId, projectId)}/hosting`
}

/**
 * Bindings (system users + bound databases) for Project scope.
 * Path: `/projects/:projectId/base/bindings`
 */
export function projectBindingsHref(orgId: string, projectId: string): string {
  return `${projectBaseHref(orgId, projectId)}/bindings`
}

/**
 * Storage (persistent volumes) for Project scope.
 * Path: `/projects/:projectId/base/storage`
 */
export function projectStorageHref(orgId: string, projectId: string): string {
  return `${projectBaseHref(orgId, projectId)}/storage`
}

/**
 * Project Settings tab (variables, system users, workspace, naming, danger).
 * Path: `/projects/:projectId/settings`
 */
export function projectSettingsHref(orgId: string, projectId: string): string {
  return `${projectHref(orgId, projectId)}/settings`
}

/**
 * The Base tab: the shared compose every environment starts from. Its default
 * lens is the topology diagram.
 * Path: `/projects/:projectId/base`
 */
export function projectBaseHref(orgId: string, projectId: string): string {
  return `${projectHref(orgId, projectId)}/base`
}

/**
 * Environment Overview tab (topology diagram, services, latest deploys).
 * Path: `/projects/:projectId/environments/:environmentId`
 */
export function projectEnvironmentHref(
  orgId: string,
  projectId: string,
  environmentId: string,
): string {
  return `${projectHref(orgId, projectId)}/environments/${encodeURIComponent(environmentId)}`
}

/** Environment Deployments tab. */
export function projectEnvironmentDeploymentsHref(
  orgId: string,
  projectId: string,
  environmentId: string,
): string {
  return `${projectEnvironmentHref(orgId, projectId, environmentId)}/deployments`
}

/**
 * Environment Configuration tab. Its default lens is the Services list.
 * Path: `/projects/:projectId/environments/:environmentId/configuration`
 */
export function projectEnvironmentConfigurationHref(
  orgId: string,
  projectId: string,
  environmentId: string,
): string {
  return `${projectEnvironmentHref(orgId, projectId, environmentId)}/configuration`
}

/** Compose YAML editor for an environment's own changes. */
export function projectEnvironmentComposeHref(
  orgId: string,
  projectId: string,
  environmentId: string,
): string {
  return `${projectEnvironmentConfigurationHref(orgId, projectId, environmentId)}/compose`
}

/** Services (visual) editor for an environment's own changes. */
export function projectEnvironmentServicesHref(
  orgId: string,
  projectId: string,
  environmentId: string,
): string {
  return projectEnvironmentConfigurationHref(orgId, projectId, environmentId)
}

/** Hosting editor for an environment. */
export function projectEnvironmentHostingHref(
  orgId: string,
  projectId: string,
  environmentId: string,
): string {
  return `${projectEnvironmentConfigurationHref(orgId, projectId, environmentId)}/hosting`
}

/** Bindings for an environment. */
export function projectEnvironmentBindingsHref(
  orgId: string,
  projectId: string,
  environmentId: string,
): string {
  return `${projectEnvironmentConfigurationHref(orgId, projectId, environmentId)}/bindings`
}

/** Storage for an environment. */
export function projectEnvironmentStorageHref(
  orgId: string,
  projectId: string,
  environmentId: string,
): string {
  return `${projectEnvironmentConfigurationHref(orgId, projectId, environmentId)}/storage`
}

/** Environment Settings tab. */
export function projectEnvironmentSettingsHref(
  orgId: string,
  projectId: string,
  environmentId: string,
): string {
  return `${projectEnvironmentHref(orgId, projectId, environmentId)}/settings`
}

export function projectServiceHref(
  orgId: string,
  projectId: string,
  serviceId: string,
): string {
  return `${projectHref(orgId, projectId)}/services/${serviceId}`
}

/** Editor view encoded in the path (`compose` = YAML, `services` = visual forms). */
export type ComposeEditView = 'editor' | 'visual'

/**
 * Where a pathname sits inside a project: the environment it names (null at
 * project scope) and the path segments after the project, or after the
 * environment. Query and hash are dropped. Null when the path is not under
 * this project at all.
 */
type ProjectPathParts = Readonly<{
  environmentId: string | null
  segments: readonly string[]
}>

function splitProjectPath(
  pathname: string,
  projectId: string,
): ProjectPathParts | null {
  const marker = `/projects/${projectId}`
  const idx = pathname.indexOf(marker)
  if (idx < 0) return null
  const after = pathname.slice(idx + marker.length)
  if (after !== '' && !/^[/?#]/.test(after)) return null
  const segments = after.split(/[?#]/)[0]!.split('/').filter(Boolean)
  const environmentId = parseProjectEnvironmentId(pathname, projectId)
  if (environmentId == null) return { environmentId: null, segments }
  return { environmentId, segments: segments.slice(2) }
}

/** Lens routes that sit under a tab (`base/…`, `configuration/…`). */
const LENS_SUBROUTES: ReadonlyMap<string, ComposeProjectTabId> = new Map([
  ['compose', 'compose'],
  ['services', 'services'],
  ['hosting', 'hosting'],
  ['bindings', 'bindings'],
  ['storage', 'storage'],
])

/** Retired section routes that now redirect to a tab, mapped to their lens. */
const LEGACY_SECTION_LENS: ReadonlyMap<string, ComposeProjectTabId> = new Map([
  ...LENS_SUBROUTES,
  ['servers', 'hosting'],
  ['map', 'overview'],
])

function lensFromSegments(
  segments: readonly string[],
  tabSegment: 'base' | 'configuration',
  defaultLens: ComposeProjectTabId,
): ComposeProjectTabId | null {
  if (segments[0] === tabSegment) {
    return LENS_SUBROUTES.get(segments[1] ?? '') ?? defaultLens
  }
  return null
}

/**
 * Resolve the Compose / Services section from the pathname.
 * Returns null on Overview / environment index / service detail paths.
 */
export function parseComposeEditView(
  pathname: string,
  projectId: string,
): ComposeEditView | null {
  const parts = splitProjectPath(pathname, projectId)
  if (!parts) return null
  const { environmentId, segments } = parts
  const tabSegment = environmentId ? 'configuration' : 'base'
  if (segments[0] === tabSegment) {
    if (segments[1] === 'compose') return 'editor'
    if (segments[1] === 'services') return 'visual'
    // The Configuration tab opens on the Services list; the Base tab on the map.
    return environmentId && segments.length === 1 ? 'visual' : null
  }
  // Retired paths keep their view while a redirect resolves.
  if (segments[0] === 'compose') return 'editor'
  // Bare `/services` only — `/services/:id` is service detail.
  if (segments[0] === 'services' && segments.length === 1) return 'visual'
  return null
}

/** Active compose section tab for the path (Overview when not a named section). */
export function parseComposeProjectTab(
  pathname: string,
  projectId: string,
): ComposeProjectTabId {
  const parts = splitProjectPath(pathname, projectId)
  if (!parts) return 'overview'
  const { environmentId, segments } = parts
  const tabbed = environmentId
    ? lensFromSegments(segments, 'configuration', 'services')
    : lensFromSegments(segments, 'base', 'overview')
  if (tabbed) return tabbed
  const first = segments[0] ?? ''
  if (first === 'settings') return 'settings'
  // `/services/:serviceId` detail keeps the Services lens lit.
  return LEGACY_SECTION_LENS.get(first) ?? 'overview'
}

/**
 * The two builders behind one compose section tab: the environment-scoped path
 * and the Project-scoped one. Keyed by tab so the pair can never drift apart.
 */
const COMPOSE_SECTION_HREFS: Readonly<
  Record<
    ComposeProjectTabId,
    Readonly<{
      environment: (
        orgId: string,
        projectId: string,
        environmentId: string,
      ) => string
      project: (orgId: string, projectId: string) => string
    }>
  >
> = {
  overview: {
    environment: projectEnvironmentHref,
    project: projectBaseHref,
  },
  services: {
    environment: projectEnvironmentServicesHref,
    project: projectServicesEditHref,
  },
  compose: {
    environment: projectEnvironmentComposeHref,
    project: projectComposeHref,
  },
  hosting: {
    environment: projectEnvironmentHostingHref,
    project: projectHostingHref,
  },
  bindings: {
    environment: projectEnvironmentBindingsHref,
    project: projectBindingsHref,
  },
  storage: {
    environment: projectEnvironmentStorageHref,
    project: projectStorageHref,
  },
  settings: {
    environment: projectEnvironmentSettingsHref,
    project: projectSettingsHref,
  },
}

/**
 * Href for a compose section tab on the current Project / environment scope.
 * Scope chips keep the active tab when switching Project ↔ environment.
 */
export function projectComposeSectionHref(
  orgId: string,
  projectId: string,
  tab: ComposeProjectTabId,
  environmentId?: string | null,
): string {
  const href = COMPOSE_SECTION_HREFS[tab]
  return environmentId
    ? href.environment(orgId, projectId, environmentId)
    : href.project(orgId, projectId)
}

/** Compose or Services path for the active scope (view → section tab). */
export function projectComposeEditHref(
  orgId: string,
  projectId: string,
  options: Readonly<{
    environmentId?: string | null
    view?: ComposeEditView
  }> = {},
): string {
  const view = options.view ?? 'editor'
  const tab: ComposeProjectTabId = view === 'visual' ? 'services' : 'compose'
  return projectComposeSectionHref(
    orgId,
    projectId,
    tab,
    options.environmentId,
  )
}



/**
 * Sticky Project vs environment scope. Project overview clears the flag;
 * `/environments/:id` sets it; other paths keep the previous value so a cold
 * load never invents environment scope from the first-env fallback.
 */
export function resolveEnvironmentScopeActive(
  baseSelected: boolean,
  pathEnvironmentId: string | null,
  previousActive: boolean,
): boolean {
  if (baseSelected) return false
  if (pathEnvironmentId != null) return true
  return previousActive
}

/**
 * Environment id from `/projects/:projectId/environments/:environmentId`.
 * Returns null for the Environments tab index (`…/environments`) and all other tabs.
 * Compose no longer exposes an Environments section tab (bare `/environments` redirects
 * to Overview); managed still uses the index route.
 */
export function parseProjectEnvironmentId(
  pathname: string,
  projectId: string,
): string | null {
  const marker = `/projects/${projectId}/environments/`
  const idx = pathname.indexOf(marker)
  if (idx < 0) return null
  const rest = pathname.slice(idx + marker.length)
  const segment = rest.split(/[/?#]/)[0] ?? ''
  if (!segment) return null
  try {
    return decodeURIComponent(segment)
  } catch {
    return segment
  }
}

/**
 * True at project scope: the Environments tab (`…/overview`), the Base tab and
 * its lens routes (`/base`, `/base/compose`, …), Settings, the retired
 * section paths that redirect there, and the bare index.
 */
export function isProjectOverviewBasePath(
  pathname: string,
  projectId: string,
): boolean {
  const parts = splitProjectPath(pathname, projectId)
  if (!parts || parts.environmentId) return false
  // The managed Environments index (`/environments`) is not project scope.
  const first = parts.segments[0]
  return first === undefined || PROJECT_SCOPE_SEGMENTS.has(first)
}

/** Project-scope first segments (tabs, lens routes and retired paths). */
const PROJECT_SCOPE_SEGMENTS: ReadonlySet<string> = new Set([
  'overview',
  'base',
  'settings',
  'compose',
  'services',
  'hosting',
  'bindings',
  'servers',
  'map',
  'storage',
])

/**
 * Overview edits shared Base compose when on the Overview Base path.
 * `/environments/:id` selects that environment (not Base).
 */
export function resolveBaseComposeSelected(
  pathname: string,
  projectId: string,
): boolean {
  return isProjectOverviewBasePath(pathname, projectId)
}

export function resolveSelectedEnvironmentId(
  preferred: string | null | undefined,
  environments: readonly { id: string }[],
): string | null {
  if (environments.length === 0) return null
  if (preferred && environments.some((env) => env.id === preferred)) {
    return preferred
  }
  return environments[0]?.id ?? null
}

/**
 * Where a "Recent projects" entry opens: the environment itself for a Compose
 * project with exactly one, otherwise the project. `environments` is
 * `undefined` until they have loaded (the project opens meanwhile).
 */
export function recentProjectHref(
  orgId: string,
  project: ProjectRecord,
  environments: readonly Readonly<{ id: string }>[] | undefined,
): string {
  const only = environments?.length === 1 ? environments[0] : undefined
  if (only && isComposeProject(project)) {
    return projectEnvironmentHref(orgId, project.id, only.id)
  }
  return projectHref(orgId, project.id)
}

/** Tabs on a compose project page, in bar order. */
export const PROJECT_PAGE_TAB_IDS = ['overview', 'base', 'settings'] as const

export type ProjectPageTabId = (typeof PROJECT_PAGE_TAB_IDS)[number]

/** `overview` is the Environments tab: the environments are what it lists. */
export const PROJECT_PAGE_TAB_LABELS: Record<ProjectPageTabId, string> = {
  overview: 'Environments',
  base: 'Base',
  settings: 'Settings',
}

/** Tabs on an environment page, in bar order. */
export const ENVIRONMENT_PAGE_TAB_IDS = [
  'overview',
  'deployments',
  'configuration',
  'settings',
] as const

export type EnvironmentPageTabId = (typeof ENVIRONMENT_PAGE_TAB_IDS)[number]

export const ENVIRONMENT_PAGE_TAB_LABELS: Record<EnvironmentPageTabId, string> = {
  overview: 'Overview',
  deployments: 'Deployments',
  configuration: 'Configuration',
  settings: 'Settings',
}

export function projectPageTabHref(
  orgId: string,
  projectId: string,
  tabId: ProjectPageTabId,
): string {
  return `${projectHref(orgId, projectId)}/${tabId}`
}

export function environmentPageTabHref(
  orgId: string,
  projectId: string,
  environmentId: string,
  tabId: EnvironmentPageTabId,
): string {
  const root = projectEnvironmentHref(orgId, projectId, environmentId)
  return tabId === 'overview' ? root : `${root}/${tabId}`
}

/**
 * Which project tab a path belongs to. Null outside project scope (an
 * environment page, managed tabs, setup). Retired section paths belong to the
 * tab they redirect to.
 */
export function parseProjectPageTab(
  pathname: string,
  projectId: string,
): ProjectPageTabId | null {
  const parts = splitProjectPath(pathname, projectId)
  if (!parts || parts.environmentId) return null
  const first = parts.segments[0]
  if (first === undefined || first === 'overview' || first === 'map') {
    return 'overview'
  }
  if (first === 'settings') return 'settings'
  if (first === 'base' || LEGACY_SECTION_LENS.has(first)) return 'base'
  return null
}

/**
 * Which environment tab a path belongs to. Null outside an environment.
 * Retired lens paths belong to Configuration, where they now live.
 */
export function parseEnvironmentPageTab(
  pathname: string,
  projectId: string,
): EnvironmentPageTabId | null {
  const parts = splitProjectPath(pathname, projectId)
  if (!parts?.environmentId) return null
  const first = parts.segments[0]
  if (first === undefined || first === 'map') return 'overview'
  if (first === 'deployments' || first === 'settings') return first
  if (first === 'configuration' || LEGACY_SECTION_LENS.has(first)) {
    return 'configuration'
  }
  return null
}

/** Retired project-scope section → where it lives now. */
function legacyProjectHrefFor(
  orgId: string,
  projectId: string,
  segment: string,
): string | null {
  if (segment === 'map') return projectOverviewHref(orgId, projectId)
  const lens = LEGACY_SECTION_LENS.get(segment)
  if (!lens || lens === 'overview') return null
  return projectComposeSectionHref(orgId, projectId, lens)
}

/** Retired environment-scope section → where it lives now. */
function legacyEnvironmentHrefFor(
  orgId: string,
  projectId: string,
  environmentId: string,
  segment: string,
): string | null {
  if (segment === 'map') {
    return projectEnvironmentHref(orgId, projectId, environmentId)
  }
  const lens = LEGACY_SECTION_LENS.get(segment)
  if (!lens || lens === 'overview') return null
  return projectComposeSectionHref(orgId, projectId, lens, environmentId)
}

/**
 * New home of a retired route, or null when the segment is not retired. Pass
 * the environment id for `/environments/:id/<segment>` routes.
 */
export function legacyProjectRedirectHref(
  orgId: string,
  projectId: string,
  segment: string,
  environmentId?: string | null,
): string | null {
  return environmentId
    ? legacyEnvironmentHrefFor(orgId, projectId, environmentId, segment)
    : legacyProjectHrefFor(orgId, projectId, segment)
}

/** Retired segments, one redirect route file each. */
export const LEGACY_PROJECT_SEGMENTS = [
  'compose',
  'services',
  'bindings',
  'hosting',
  'storage',
  'servers',
  'map',
] as const

export type LegacyProjectSegment = (typeof LEGACY_PROJECT_SEGMENTS)[number]

/**
 * Append the query a retired deep link carried (`?hostingId=…`) to its new
 * home. `omit` drops the router's path params, which `useLocalSearchParams`
 * mixes in with the query.
 */
export function withCarriedQuery(
  href: string,
  params: Readonly<Record<string, string | readonly string[] | undefined>>,
  omit: readonly string[],
): string {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (omit.includes(key) || value === undefined) continue
    for (const entry of typeof value === 'string' ? [value] : value) {
      query.append(key, entry)
    }
  }
  const text = query.toString()
  return text ? `${href}?${text}` : href
}
