import {
  ENVIRONMENT_PAGE_TAB_IDS,
  ENVIRONMENT_PAGE_TAB_LABELS,
  PROJECT_PAGE_TAB_IDS,
  PROJECT_PAGE_TAB_LABELS,
  environmentPageTabHref,
  projectOverviewHref,
  type EnvironmentPageTabId,
  type ProjectPageTabId,
} from '@/lib/project-navigation'

/**
 * A managed database uses the same tab bars as a website project. The tabs
 * whose contents TurboPanel writes and keeps are greyed with this label; they
 * still open, onto a short panel that says so.
 */
export const MANAGED_BY_TURBOPANEL = 'Managed by TurboPanel'

/** Environment tabs a managed database greys: the Compose file is TurboPanel's. */
export const MANAGED_MUTED_ENVIRONMENT_TABS: ReadonlySet<EnvironmentPageTabId> = new Set([
  'compose',
])

/** Project tabs a managed database greys: it has no Base and no shared Compose file. */
export const MANAGED_MUTED_PROJECT_TABS: ReadonlySet<ProjectPageTabId> = new Set([
  'base',
  'compose',
])

export type ManagedTab = Readonly<{
  key: string
  label: string
  muted?: boolean
  mutedLabel?: string
}>

function tabsOf<Id extends string>(
  ids: readonly Id[],
  labels: Readonly<Record<Id, string>>,
  muted: ReadonlySet<Id>
): ManagedTab[] {
  return ids.map((key) =>
    muted.has(key)
      ? { key, label: labels[key], muted: true, mutedLabel: MANAGED_BY_TURBOPANEL }
      : { key, label: labels[key] }
  )
}

/** The environment tab bar of a managed database: the website tabs, Compose greyed. */
export function managedEnvironmentTabs(): ManagedTab[] {
  return tabsOf(
    ENVIRONMENT_PAGE_TAB_IDS,
    ENVIRONMENT_PAGE_TAB_LABELS,
    MANAGED_MUTED_ENVIRONMENT_TABS
  )
}

/** The project tab bar of a managed database: the website tabs, Base and Compose greyed. */
export function managedProjectTabs(): ManagedTab[] {
  return tabsOf(PROJECT_PAGE_TAB_IDS, PROJECT_PAGE_TAB_LABELS, MANAGED_MUTED_PROJECT_TABS)
}

/**
 * The tabs a managed project had before it shared the website shell, and the
 * environment tab each one lives on now. `environments` went to the project's
 * Environments tab, so it has no entry here.
 */
const RETIRED_MANAGED_TABS = {
  connect: 'bindings',
  data: 'configuration',
  backups: 'deployments',
} as const satisfies Readonly<Record<string, EnvironmentPageTabId>>

export type RetiredManagedTab = keyof typeof RETIRED_MANAGED_TABS

/**
 * Where an old managed tab (`/connect`, `/data`, `/backups`) opens now: that
 * tab of the given environment (the primary one), or the project's
 * Environments tab when the project has no environment yet.
 */
export function retiredManagedTabHref(
  orgId: string,
  projectId: string,
  tab: RetiredManagedTab,
  environmentId: string | null
): string {
  if (!environmentId) return projectOverviewHref(orgId, projectId)
  return environmentPageTabHref(orgId, projectId, environmentId, RETIRED_MANAGED_TABS[tab])
}
