import type { ProjectRecord } from '@/lib/instance-api'

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

export function projectTypeLabel(project: ProjectRecord): string {
  const type = project.metadata?.type
  if (type === 'managed') return 'Managed'
  if (type === 'template') return 'Template'
  if (type === 'docker-compose') return 'Compose'
  return 'Setup'
}

/**
 * Compose project routes. Overview is Project / environment compose (chips).
 */
export const COMPOSE_PROJECT_TAB_IDS = ['overview'] as const

export type ComposeProjectTabId = (typeof COMPOSE_PROJECT_TAB_IDS)[number]

/** System projects are compose-shaped but never accept mutations from the UI. */
export function systemProjectAllowsMutations(): boolean {
  return false
}

export const COMPOSE_PROJECT_TAB_LABELS: Record<ComposeProjectTabId, string> = {
  overview: 'Overview',
}

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

export function projectServiceHref(
  orgId: string,
  projectId: string,
  serviceId: string,
): string {
  return `${projectHref(orgId, projectId)}/services/${serviceId}`
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

export function projectSettingsSubHref(
  orgId: string,
  projectId: string,
  sub:
    | 'compose'
    | 'overrides'
    | 'variables'
    | 'principals'
    | 'naming'
    | 'workspace'
    | 'danger'
    | 'managed',
): string {
  return `${projectHref(orgId, projectId)}/settings/${sub}`
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

/** True on Overview Base (`…/overview` or bare project index). */
export function isProjectOverviewBasePath(
  pathname: string,
  projectId: string,
): boolean {
  if (parseProjectEnvironmentId(pathname, projectId)) return false
  if (pathname.endsWith(`/projects/${projectId}`)) return true
  if (pathname.includes(`/projects/${projectId}/overview`)) return true
  // Service detail lives under Overview.
  if (pathname.includes(`/projects/${projectId}/services`)) return true
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
  environments: ReadonlyArray<{ id: string }>,
): string | null {
  if (environments.length === 0) return null
  if (preferred && environments.some((env) => env.id === preferred)) {
    return preferred
  }
  return environments[0]?.id ?? null
}
