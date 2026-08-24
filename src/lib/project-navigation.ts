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
 * `map` (Overview), `compose` (Compose), and `overview` (Services) are
 * **lenses** on one artifact and live in the surface lens bar, in that order.
 * Hosting / Servers / Storage / Settings are configuration routes reached from
 * a service row or the scope-strip gear — never a nav list.
 */
export const COMPOSE_PROJECT_TAB_IDS = [
  'map',
  'compose',
  'overview',
  'hosting',
  'servers',
  'storage',
  'settings',
] as const

export type ComposeProjectTabId = (typeof COMPOSE_PROJECT_TAB_IDS)[number]

/** Create-wizard draft has no environments and no row to configure — lenses only. */
export const DRAFT_COMPOSE_PROJECT_TAB_IDS = [
  'map',
  'compose',
  'overview',
] as const

/** Platform projects never accept mutations from the UI. */
export function systemProjectAllowsMutations(): boolean {
  return false
}

export const COMPOSE_PROJECT_TAB_LABELS: Record<ComposeProjectTabId, string> = {
  map: 'Overview',
  compose: 'Compose',
  overview: 'Services',
  hosting: 'Hosting',
  servers: 'Servers',
  storage: 'Storage',
  settings: 'Settings',
}

/** The three lenses on the compose artifact, in lens-bar order. */
export const COMPOSE_PROJECT_LENS_IDS = ['map', 'compose', 'overview'] as const

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
  'servers',
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

/** Overview Base compose — no environment segment, no query. */
export function projectOverviewHref(orgId: string, projectId: string): string {
  return projectTabHref(orgId, projectId, 'overview')
}

/**
 * Compose YAML editor for Project scope.
 * Path: `/projects/:projectId/compose`
 */
export function projectComposeHref(orgId: string, projectId: string): string {
  return `${projectHref(orgId, projectId)}/compose`
}

/**
 * Services (visual) editor for Project scope.
 * Path: `/projects/:projectId/services` (bare — not `/services/:serviceId`).
 */
export function projectServicesEditHref(
  orgId: string,
  projectId: string,
): string {
  return `${projectHref(orgId, projectId)}/services`
}

/**
 * Hosting (hostnames / ports / TLS) for Project scope.
 * Path: `/projects/:projectId/hosting`
 */
export function projectHostingHref(orgId: string, projectId: string): string {
  return `${projectHref(orgId, projectId)}/hosting`
}

/**
 * Server placement for Project scope (default project server).
 * Path: `/projects/:projectId/servers`
 */
export function projectServersHref(orgId: string, projectId: string): string {
  return `${projectHref(orgId, projectId)}/servers`
}

/**
 * Topology map lens for Project scope.
 * Path: `/projects/:projectId/map`
 */
export function projectMapHref(orgId: string, projectId: string): string {
  return `${projectHref(orgId, projectId)}/map`
}

/**
 * Topology map lens for an environment.
 * Path: `/projects/:projectId/environments/:environmentId/map`
 */
export function projectEnvironmentMapHref(
  orgId: string,
  projectId: string,
  environmentId: string,
): string {
  return `${projectEnvironmentHref(orgId, projectId, environmentId)}/map`
}

/**
 * Storage (persistent volumes) for Project scope.
 * Path: `/projects/:projectId/storage`
 */
export function projectStorageHref(orgId: string, projectId: string): string {
  return `${projectHref(orgId, projectId)}/storage`
}

/**
 * Scope settings (variables, system users, workspace, naming, danger).
 * Path: `/projects/:projectId/settings`
 */
export function projectSettingsHref(orgId: string, projectId: string): string {
  return `${projectHref(orgId, projectId)}/settings`
}

/**
 * Selected environment on Overview (compose overlay / lifecycle).
 * Path: `/projects/:projectId/environments/:environmentId`
 */
export function projectEnvironmentHref(
  orgId: string,
  projectId: string,
  environmentId: string,
): string {
  return `${projectHref(orgId, projectId)}/environments/${encodeURIComponent(environmentId)}`
}

/**
 * Compose YAML editor for an environment overlay.
 * Path: `/projects/:projectId/environments/:environmentId/compose`
 */
export function projectEnvironmentComposeHref(
  orgId: string,
  projectId: string,
  environmentId: string,
): string {
  return `${projectEnvironmentHref(orgId, projectId, environmentId)}/compose`
}

/**
 * Services (visual) editor for an environment overlay.
 * Path: `/projects/:projectId/environments/:environmentId/services`
 */
export function projectEnvironmentServicesHref(
  orgId: string,
  projectId: string,
  environmentId: string,
): string {
  return `${projectEnvironmentHref(orgId, projectId, environmentId)}/services`
}

/**
 * Hosting editor for an environment.
 * Path: `/projects/:projectId/environments/:environmentId/hosting`
 */
export function projectEnvironmentHostingHref(
  orgId: string,
  projectId: string,
  environmentId: string,
): string {
  return `${projectEnvironmentHref(orgId, projectId, environmentId)}/hosting`
}

/**
 * Server pin for an environment.
 * Path: `/projects/:projectId/environments/:environmentId/servers`
 */
export function projectEnvironmentServersHref(
  orgId: string,
  projectId: string,
  environmentId: string,
): string {
  return `${projectEnvironmentHref(orgId, projectId, environmentId)}/servers`
}

/**
 * Storage for an environment.
 * Path: `/projects/:projectId/environments/:environmentId/storage`
 */
export function projectEnvironmentStorageHref(
  orgId: string,
  projectId: string,
  environmentId: string,
): string {
  return `${projectEnvironmentHref(orgId, projectId, environmentId)}/storage`
}

/**
 * Settings for an environment.
 * Path: `/projects/:projectId/environments/:environmentId/settings`
 */
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
 * Resolve the Compose / Services section from the pathname.
 * Returns null on Overview / environment index / service detail paths.
 */
export function parseComposeEditView(
  pathname: string,
  projectId: string,
): ComposeEditView | null {
  const base = `/projects/${projectId}`
  const envId = parseProjectEnvironmentId(pathname, projectId)
  if (envId) {
    const envMarker = `${base}/environments/`
    const envIdx = pathname.indexOf(envMarker)
    if (envIdx < 0) return null
    const afterEnv = pathname.slice(envIdx + envMarker.length)
    const parts = afterEnv.split(/[/?#]/).filter(Boolean)
    // parts[0] = environmentId, parts[1] = compose | services
    const suffix = parts[1] ?? ''
    if (suffix === 'compose') return 'editor'
    if (suffix === 'services') return 'visual'
    return null
  }
  if (pathname.includes(`${base}/compose`)) return 'editor'
  // Bare `/services` only — `/services/:id` is service detail.
  const servicesMarker = `${base}/services`
  const servicesIdx = pathname.indexOf(servicesMarker)
  if (servicesIdx < 0) return null
  const after = pathname.slice(servicesIdx + servicesMarker.length)
  if (after === '' || after.startsWith('?') || after.startsWith('#')) {
    return 'visual'
  }
  return null
}

/**
 * Trailing section segment on a compose project path (`compose`, `hosting`, …).
 * Empty on Overview and on `/environments/:id` with no suffix.
 */
function composePathSectionSegment(
  pathname: string,
  projectId: string,
): string {
  const base = `/projects/${projectId}`
  const envId = parseProjectEnvironmentId(pathname, projectId)
  if (envId) {
    const envMarker = `${base}/environments/`
    const envIdx = pathname.indexOf(envMarker)
    if (envIdx < 0) return ''
    const afterEnv = pathname.slice(envIdx + envMarker.length)
    const parts = afterEnv.split(/[/?#]/).filter(Boolean)
    return parts[1] ?? ''
  }
  const marker = `${base}/`
  const idx = pathname.indexOf(marker)
  if (idx < 0) return ''
  const rest = pathname.slice(idx + marker.length)
  return rest.split(/[/?#]/)[0] ?? ''
}

/** Active compose section tab for the path (Overview when not a named section). */
export function parseComposeProjectTab(
  pathname: string,
  projectId: string,
): ComposeProjectTabId {
  const view = parseComposeEditView(pathname, projectId)
  if (view === 'editor') return 'compose'
  // The visual editor is the Services lens, which lives on the overview path.
  if (view === 'visual') return 'overview'
  const suffix = composePathSectionSegment(pathname, projectId)
  if (suffix === 'map') return 'map'
  if (suffix === 'hosting') return 'hosting'
  if (suffix === 'servers') return 'servers'
  if (suffix === 'storage') return 'storage'
  if (suffix === 'settings') return 'settings'
  return 'overview'
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
    project: projectOverviewHref,
  },
  map: { environment: projectEnvironmentMapHref, project: projectMapHref },
  compose: {
    environment: projectEnvironmentComposeHref,
    project: projectComposeHref,
  },
  hosting: {
    environment: projectEnvironmentHostingHref,
    project: projectHostingHref,
  },
  servers: {
    environment: projectEnvironmentServersHref,
    project: projectServersHref,
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
  const tab: ComposeProjectTabId = view === 'visual' ? 'overview' : 'compose'
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
 * True on Overview Base (`…/overview`, `/compose`, `/services`, `/hosting`,
 * `/servers`, `/storage`, `/settings`, or bare index).
 */
export function isProjectOverviewBasePath(
  pathname: string,
  projectId: string,
): boolean {
  if (parseProjectEnvironmentId(pathname, projectId)) return false
  if (pathname.endsWith(`/projects/${projectId}`)) return true
  if (pathname.includes(`/projects/${projectId}/overview`)) return true
  if (pathname.includes(`/projects/${projectId}/compose`)) return true
  // Bare `/services` (edit) and `/services/:id` (detail) live under Project scope.
  if (pathname.includes(`/projects/${projectId}/services`)) return true
  if (pathname.includes(`/projects/${projectId}/hosting`)) return true
  if (pathname.includes(`/projects/${projectId}/servers`)) return true
  if (pathname.includes(`/projects/${projectId}/map`)) return true
  if (pathname.includes(`/projects/${projectId}/storage`)) return true
  if (pathname.includes(`/projects/${projectId}/settings`)) return true
  return false
}

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
