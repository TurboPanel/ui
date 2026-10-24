import type { ProjectRecord } from '@/lib/instance-api'
import {
  SYSTEM_PROJECT_KIND,
  TURBOPANEL_WORKSPACE_BADGE_LABEL,
} from '@/lib/system-inventory'

/** True when the project has not yet chosen compose / template / managed. */
export function projectNeedsSetup(project: ProjectRecord): boolean {
  return project.kind == null
}

export function isManagedProject(project: ProjectRecord): boolean {
  return project.kind === 'managed'
}

export function isComposeOrTemplateProject(project: ProjectRecord): boolean {
  return project.kind === 'compose' || project.kind == null
}

export function isComposeProject(project: ProjectRecord): boolean {
  return project.kind === 'compose'
}

/** A template is a compose project that carries a catalog code. */
export function isTemplateProject(project: ProjectRecord): boolean {
  return project.kind === 'compose' && !!project.metadata?.code
}

/**
 * Display classifier only — true when `kind` is the platform `system` value.
 * `isTurbopanelProject` / `workspaceKind` remain the authoritative read-only
 * gate.
 */
export function isSystemProject(project: ProjectRecord): boolean {
  return project.kind === SYSTEM_PROJECT_KIND
}

/** What the project shows as: the stored kind with a template split out of compose. */
export type ProjectDisplayType = 'system' | 'managed' | 'template' | 'compose' | 'setup'

export function projectDisplayType(project: ProjectRecord): ProjectDisplayType {
  if (isSystemProject(project)) return 'system'
  if (isManagedProject(project)) return 'managed'
  if (isTemplateProject(project)) return 'template'
  if (isComposeProject(project)) return 'compose'
  return 'setup'
}

export function projectTypeLabel(project: ProjectRecord): string {
  const type = projectDisplayType(project)
  if (type === 'system') return TURBOPANEL_WORKSPACE_BADGE_LABEL
  if (type === 'managed') return 'Managed'
  if (type === 'template') return 'Template'
  if (type === 'compose') return 'Compose'
  return 'Setup'
}

/**
 * Compose sections of one scope (the Base or an environment). `overview`
 * (topology diagram), `compose` (YAML), and `services` (service cards) are
 * **lenses** on one compose document; `bindings` (system users and bound
 * databases) and `hosting` (server placement and exposure) are their own
 * pages. The project and environment tab bars link to them (see
 * `PROJECT_PAGE_TAB_IDS` / `ENVIRONMENT_PAGE_TAB_IDS`). Storage / Settings are
 * configuration routes reached from a service row or the scope-strip gear.
 * `servers` is retired — placement lives on the Hosting tab and `/servers`
 * paths redirect there. `/map` is the retired Overview path and redirects to
 * `/overview`.
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
 * create, so the topology diagram is the only lens the draft offers and the
 * draft shows no lens tabs at all.
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

export function isComposeProjectLens(tabId: ComposeProjectTabId): boolean {
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
  'settings',
] as const

export type ManagedProjectTabId = (typeof MANAGED_PROJECT_TAB_IDS)[number]

export const MANAGED_PROJECT_TAB_LABELS: Record<ManagedProjectTabId, string> = {
  overview: 'Overview',
  connect: 'Connect',
  environments: 'Environments',
  data: 'Data',
  backups: 'Backups',
  settings: 'Settings',
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

/** One deploy's log page, under the environment's Deployments tab. */
export function projectEnvironmentDeploymentHref(
  orgId: string,
  projectId: string,
  environmentId: string,
  deploymentId: string,
): string {
  return `${projectEnvironmentDeploymentsHref(orgId, projectId, environmentId)}/${encodeURIComponent(deploymentId)}`
}

/**
 * Environment Services tab (route id `configuration`): what the environment runs.
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

/**
 * Project-scope service path. It only redirects now: the service opens inside
 * the environment that runs it ({@link projectEnvironmentServiceHref}). Kept for
 * links that cannot know the environment (a database's connected services).
 */
export function projectServiceHref(
  orgId: string,
  projectId: string,
  serviceId: string,
): string {
  return `${projectHref(orgId, projectId)}/services/${serviceId}`
}

/**
 * A service inside its environment, under the Services tab: the environment
 * header, Deploy and the tab bar stay, and Services stays lit.
 * Path: `/projects/:projectId/environments/:environmentId/services/:serviceId`
 */
export function projectEnvironmentServiceHref(
  orgId: string,
  projectId: string,
  environmentId: string,
  serviceId: string
): string {
  return `${projectEnvironmentHref(orgId, projectId, environmentId)}/services/${encodeURIComponent(serviceId)}`
}

/**
 * Where the project-scope service path sends a service: the environment whose
 * service list holds it, else `fallbackEnvironmentId` (the page then says the
 * service was not found, with a way back). Null with neither.
 */
export function serviceEnvironmentHref(
  orgId: string,
  projectId: string,
  serviceId: string,
  servicesByEnvironment: Readonly<Record<string, readonly Readonly<{ id: string }>[]>>,
  fallbackEnvironmentId: string | null
): string | null {
  const environmentId =
    Object.keys(servicesByEnvironment).find((id) =>
      servicesByEnvironment[id]?.some((service) => service.id === serviceId)
    ) ?? fallbackEnvironmentId
  return environmentId
    ? projectEnvironmentServiceHref(orgId, projectId, environmentId, serviceId)
    : null
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

/**
 * Compose sections that are tabs of their own on both bars: the Compose file,
 * Bindings and Hosting. They live under `base/…` at project scope and under
 * `configuration/…` in an environment.
 */
const SECTION_PAGE_TAB_IDS = ['compose', 'bindings', 'hosting'] as const

type SectionPageTabId = (typeof SECTION_PAGE_TAB_IDS)[number]

function isSectionPageTab(tabId: string): tabId is SectionPageTabId {
  return (SECTION_PAGE_TAB_IDS as readonly string[]).includes(tabId)
}

/** The section tab a lens lights, or null when it lights the scope's main tab. */
function sectionPageTab(lens: ComposeProjectTabId | undefined): SectionPageTabId | null {
  return lens && isSectionPageTab(lens) ? lens : null
}

/**
 * Tabs on a compose project page, in bar order. The one bar on every project
 * screen: Environments, the Base (its map; Storage lights it too), the Base's
 * Compose file (its Services view lights it too), Bindings and Hosting, then
 * Settings.
 */
export const PROJECT_PAGE_TAB_IDS = [
  'overview',
  'base',
  'compose',
  'bindings',
  'hosting',
  'settings',
] as const

export type ProjectPageTabId = (typeof PROJECT_PAGE_TAB_IDS)[number]

/** `overview` is the Environments tab: the environments are what it lists. */
export const PROJECT_PAGE_TAB_LABELS: Record<ProjectPageTabId, string> = {
  overview: 'Environments',
  base: 'Base',
  compose: 'Compose',
  bindings: 'Bindings',
  hosting: 'Hosting',
  settings: 'Settings',
}

/**
 * Tabs on an environment page, in bar order. The one bar on every environment
 * screen. `configuration` keeps its id and route but reads **Services**: it
 * lists what the environment runs (Storage lights it too).
 */
export const ENVIRONMENT_PAGE_TAB_IDS = [
  'overview',
  'deployments',
  'configuration',
  'compose',
  'bindings',
  'hosting',
  'settings',
] as const

export type EnvironmentPageTabId = (typeof ENVIRONMENT_PAGE_TAB_IDS)[number]

export const ENVIRONMENT_PAGE_TAB_LABELS: Record<EnvironmentPageTabId, string> = {
  overview: 'Overview',
  deployments: 'Deployments',
  configuration: 'Services',
  compose: 'Compose',
  bindings: 'Bindings',
  hosting: 'Hosting',
  settings: 'Settings',
}

export function projectPageTabHref(
  orgId: string,
  projectId: string,
  tabId: ProjectPageTabId,
): string {
  if (isSectionPageTab(tabId)) return `${projectBaseHref(orgId, projectId)}/${tabId}`
  return `${projectHref(orgId, projectId)}/${tabId}`
}

export function environmentPageTabHref(
  orgId: string,
  projectId: string,
  environmentId: string,
  tabId: EnvironmentPageTabId,
): string {
  const root = projectEnvironmentHref(orgId, projectId, environmentId)
  if (tabId === 'overview') return root
  if (isSectionPageTab(tabId)) return `${root}/configuration/${tabId}`
  return `${root}/${tabId}`
}

/**
 * Which project tab a path belongs to. Null outside project scope (an
 * environment page, managed tabs, setup). The Base's Services view lights
 * Compose (the editor's toggle) and Storage lights Base; retired section paths
 * belong to the tab they redirect to.
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
  if (first === 'base') {
    // The Services view is the Compose editor's other half (its toggle), so
    // the bar stays on Compose while that toggle switches.
    if (parts.segments[1] === 'services') return 'compose'
    return sectionPageTab(LENS_SUBROUTES.get(parts.segments[1] ?? '')) ?? 'base'
  }
  if (LEGACY_SECTION_LENS.has(first)) {
    // Bare /services redirects to /base/services, which lights Compose.
    if (first === 'services' && parts.segments.length === 1) return 'compose'
    return sectionPageTab(LEGACY_SECTION_LENS.get(first)) ?? 'base'
  }
  return null
}

/**
 * Which environment tab a path belongs to. Null outside an environment.
 * Storage and the retired Services path light Services (`configuration`);
 * other retired lens paths light the tab they redirect to.
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
  if (first === 'configuration') {
    return sectionPageTab(LENS_SUBROUTES.get(parts.segments[1] ?? '')) ?? 'configuration'
  }
  if (LEGACY_SECTION_LENS.has(first)) {
    return sectionPageTab(LEGACY_SECTION_LENS.get(first)) ?? 'configuration'
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
