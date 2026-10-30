import type { Href } from 'expo-router'
import { TURBOFABRIC_PRODUCT_NAME } from '@/lib/platform-copy'
import { projectsListHref } from '@/lib/workspace-scope'

export const ORG_AREAS = [
  {
    id: 'overview',
    label: 'Overview',
    pathSegment: 'overview',
    hint: 'Organization overview',
    subRoutes: [],
  },
  {
    id: 'activity',
    label: 'Activity',
    pathSegment: 'activity',
    hint: 'Running and recently failed deploys across the organization',
    subRoutes: [],
  },
  {
    id: 'projects',
    label: 'Projects',
    pathSegment: 'projects',
    hint: 'Projects filtered by the workspace switcher',
    subRoutes: [
      {
        id: 'git-sources',
        label: 'Git Sources',
        pathSegment: 'git-sources',
        hint: 'GitHub Apps and GitLab applications this organization connects through',
      },
      {
        id: 'repositories',
        label: 'Repositories',
        pathSegment: 'repositories',
        hint: 'Git repositories connected to this organization and what uses them',
      },
    ],
  },
  {
    // Not in the sidebar: managed databases are listed on Projects (the
    // Managed Databases filter, which links to these settings). `/managed`
    // redirects there; the area stays so `/managed/settings` resolves.
    id: 'managed',
    label: 'Managed',
    pathSegment: 'managed',
    hint: 'Managed databases, listed on Projects',
    subRoutes: [
      {
        id: 'settings',
        label: 'Settings',
        pathSegment: 'settings',
        hint: 'Organization defaults inherited by managed databases',
      },
    ],
  },
  {
    id: 'servers',
    label: 'Servers',
    pathSegment: 'servers',
    hint: 'Managed hosts and fleet status',
    subRoutes: [
      {
        id: 'datacenters',
        label: 'Datacenters',
        pathSegment: 'datacenters',
        hint: 'Private CIDR locations that group servers',
      },
      {
        id: 'keys',
        label: 'Pending Keys',
        pathSegment: 'keys',
        hint: 'Servers that are still waiting to connect',
      },
      {
        id: 'settings',
        label: 'Settings',
        pathSegment: 'settings',
        hint: 'Fleet defaults such as the default server timezone',
      },
      {
        id: 'tls',
        label: 'TLS',
        pathSegment: 'tls',
        hint: 'Organization certificate library',
      },
      {
        id: 'fabric',
        label: TURBOFABRIC_PRODUCT_NAME,
        pathSegment: 'fabric',
        hint: 'Opt-in mesh for environments that run across servers',
      },
      {
        id: 'addresses',
        label: 'Addresses',
        pathSegment: 'addresses',
        hint: 'Managed address pool for ingress and internal routing',
      },
      {
        id: 'docker',
        label: 'Docker Networks',
        pathSegment: 'docker',
        hint: 'Compose external Docker network registry and host address pools',
      },
      {
        id: 'reserved',
        label: 'Reserved Ranges',
        pathSegment: 'reserved',
        hint: 'Ranges TurboPanel must never assign because something else routes them',
      },
      {
        id: 'cloudflare',
        label: 'Cloudflare Accounts',
        pathSegment: 'cloudflare',
        hint: 'Cloudflare accounts and the API Tokens TurboPanel uses for tunnels',
      },
      {
        id: 'tunnels',
        label: 'Tunnels',
        pathSegment: 'tunnels',
        hint: 'Tunnels, the servers that run them and the hostnames they carry',
      },
      {
        id: 'firewall',
        label: 'Firewall',
        pathSegment: 'firewall',
        hint: 'Policy and rules behind each server’s firewall preview',
      },
    ],
  },
  {
    // Not in the sidebar: its pages (TurboFabric, Addresses, Docker Networks,
    // Reserved Ranges, Cloudflare Accounts, Tunnels, Firewall) live under
    // Servers. `/network` and `/network/<page>` redirect there; the area stays
    // so the old links resolve and the moved pages keep the Network icon.
    id: 'network',
    label: 'Network',
    pathSegment: 'network',
    hint: 'TurboFabric, addresses, Docker networks, and the firewall',
    subRoutes: [],
  },
  {
    // Not in the sidebar: Access is a tab of Organization Settings. `/access`
    // redirects there; the area stays so the old link resolves.
    id: 'access',
    label: 'Access',
    pathSegment: 'access',
    hint: 'Roles, permissions, and grants',
    subRoutes: [],
  },
  {
    // Hosted only, and never in the sidebar: reached from the organization
    // menu (switcher, Billing) and from screens that need a purchase. The
    // route redirects to Overview when `InstallStatus.billingEnabled` is
    // false (self-hosted). Kept here so breadcrumbs and deep links resolve.
    id: 'billing',
    label: 'Billing',
    pathSegment: 'billing',
    hint: 'Subscription, licenses per tier, invoices, and payment method',
    subRoutes: [],
  },
] as const

export type OrgAreaId = (typeof ORG_AREAS)[number]['id']
export type OrgSubRouteId = (typeof ORG_AREAS)[number]['subRoutes'][number]['id']

/** Native bottom-tab set. Other org areas stay reachable by deep link only on native. */
export const ORG_TAB_AREA_IDS = [
  'projects',
  'activity',
  'servers',
] as const satisfies readonly OrgAreaId[]

/**
 * Web sidebar, in order: the three places people work. Recent projects follow,
 * then (for platform admins) Admin. Network's pages sit under Servers, Access is
 * an Organization Settings tab, and managed databases are a filter on Projects.
 */
export const ORG_SIDEBAR_AREA_IDS = [
  'projects',
  'activity',
  'servers',
] as const satisfies readonly OrgAreaId[]

/**
 * The Servers sub-pages that used to make up the Network area, in sidebar
 * order. `/network/<page>` redirects to `/servers/<page>` for these.
 */
export const SERVERS_NETWORK_SUB_ROUTE_IDS = [
  'fabric',
  'addresses',
  'docker',
  'reserved',
  'cloudflare',
  'tunnels',
  'firewall',
] as const satisfies readonly OrgSubRouteId[]

export type ServersNetworkSubRouteId = (typeof SERVERS_NETWORK_SUB_ROUTE_IDS)[number]

/** Where an old `/network/<page>` link goes: the page under Servers, or the Servers list. */
export function networkRedirectHref(orgId: string, page: string | undefined): string {
  const moved = SERVERS_NETWORK_SUB_ROUTE_IDS.find((id) => id === page)
  return moved ? orgRouteHref(orgId, 'servers', moved) : orgAreaHref(orgId, 'servers')
}

export type OrgTabAreaId = (typeof ORG_TAB_AREA_IDS)[number]

export type OrgTabSwipeDirection = 'next' | 'previous'

export type OrgTabHref = `/${string}/${string}` | `/${string}/projects?workspaceId=${string}`

export function orgAreaHref(orgId: string, areaPathSegment: string): `/${string}/${string}` {
  return `/${orgId}/${areaPathSegment}`
}

function orgPathWithoutQuery(pathname: string): string {
  const queryIndex = pathname.indexOf('?')
  return queryIndex === -1 ? pathname : pathname.slice(0, queryIndex)
}

/**
 * Whether `pathname` is the given org area or a nested child of it.
 *
 * Strips a query string when present. Expo `usePathname()` already omits the
 * query, so `/org/projects?workspaceId=…` and `/org/projects` both match.
 */
export function isOrgAreaActive(pathname: string, orgId: string, areaPathSegment: string): boolean {
  const path = orgPathWithoutQuery(pathname)
  const href = orgAreaHref(orgId, areaPathSegment)
  return path === href || path.startsWith(`${href}/`)
}

/**
 * True only on a native tab's own overview (`/{orgId}/overview|projects|servers`),
 * not nested detail/settings routes. Query strings are ignored so a Projects
 * workspace filter still counts as the tab overview.
 */
export function isOrgTabOverviewPath(pathname: string, orgId: string): boolean {
  const path = orgPathWithoutQuery(pathname)
  return ORG_TAB_AREA_IDS.some((areaId) => path === orgAreaHref(orgId, areaId))
}

/**
 * Index into {@link ORG_TAB_AREA_IDS} for a native tab overview path.
 * `-1` when the path is not one of those overviews.
 */
export function orgTabIndexFromPathname(pathname: string, orgId: string): number {
  const path = orgPathWithoutQuery(pathname)
  return ORG_TAB_AREA_IDS.findIndex((areaId) => path === orgAreaHref(orgId, areaId))
}

/**
 * Expo Router nested-stack route names for the three native tab overviews
 * (`overview`, `projects/index`, `[orgId]/servers` — not project Overview
 * or server detail).
 */
export function isOrgTabOverviewRouteName(routeName: string): boolean {
  const normalized = routeName.replace(/\/index$/, '').replace(/^\[orgId\]\//, '')
  return (ORG_TAB_AREA_IDS as readonly string[]).includes(normalized)
}

/** Shared identity so the root stack keeps a single org console screen. */
export const ORG_CONSOLE_SINGULAR_ID = 'org-console'

type OrganizationReplaceRouter = Readonly<{
  replace: (href: Href, options?: { dangerouslySingular?: boolean | (() => string) }) => void
}>

/**
 * Open an organization without stacking the previous org on the native back
 * stack (no slide, no swipe-back to the org you just left).
 */
export function replaceOrganization(router: OrganizationReplaceRouter, href: Href): void {
  router.replace(href, {
    dangerouslySingular: () => ORG_CONSOLE_SINGULAR_ID,
  })
}

/**
 * Where a bottom tab (or a swipe) goes. Projects keeps the workspace scope
 * and the type filter (`?type=`) it was last left on, so going back to it
 * from Activity or Servers shows the same list.
 */
export function orgTabHref(
  orgId: string,
  areaId: OrgTabAreaId,
  projectsScopeId: string,
  projectsType?: string | null
): OrgTabHref {
  if (areaId === 'projects') {
    return projectsListHref(orgId, projectsScopeId, projectsType) as OrgTabHref
  }
  return orgAreaHref(orgId, areaId)
}

export function adjacentOrgTabHref(
  pathname: string,
  orgId: string,
  direction: OrgTabSwipeDirection,
  projectsScopeId: string,
  projectsType?: string | null
): OrgTabHref | null {
  const path = orgPathWithoutQuery(pathname)
  const index = ORG_TAB_AREA_IDS.findIndex((areaId) => path === orgAreaHref(orgId, areaId))
  if (index < 0) {
    return null
  }
  const nextIndex = direction === 'next' ? index + 1 : index - 1
  const areaId = ORG_TAB_AREA_IDS[nextIndex]
  if (!areaId) {
    return null
  }
  return orgTabHref(orgId, areaId, projectsScopeId, projectsType)
}

export function orgRouteHref(
  orgId: string,
  areaPathSegment: string,
  subRoutePathSegment: string
): `/${string}/${string}/${string}` {
  return `/${orgId}/${areaPathSegment}/${subRoutePathSegment}`
}

/** Where an organization opens: its Projects. The old Overview route redirects here. */
export function defaultOrgDashboardHref(orgId: string): `/${string}/projects` {
  return `/${orgId}/projects`
}

/** Organization defaults for managed databases (client TLS mode, listener ports). */
export function managedSettingsHref(orgId: string): `/${string}/managed/settings` {
  return `/${orgId}/managed/settings`
}

/**
 * Where the retired `/managed` list goes: Projects with the Managed Databases
 * filter on, keeping the rest of the query (`?workspaceId=`). `params` is what
 * `useLocalSearchParams` returns, so the `orgId` path param is dropped.
 */
export function managedListRedirectHref(
  orgId: string,
  params: Readonly<Record<string, string | readonly string[] | undefined>>
): string {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (key === 'orgId' || key === 'type' || value === undefined) continue
    for (const entry of typeof value === 'string' ? [value] : value) query.append(key, entry)
  }
  query.append('type', 'managed')
  return `/${orgId}/projects?${query.toString()}`
}

/** Signed-in organization picker — searchable list, create, manage. */
export function organizationsHref(): '/organizations' {
  return '/organizations'
}

export function orgManageHref(orgId: string): `/${string}/manage` {
  return `/${orgId}/manage`
}

/** Tabs on Organization Settings, in bar order (the picker menu is the only way in). */
export const ORG_SETTINGS_TAB_IDS = [
  'general',
  'projects',
  'access',
  'notifications',
  'domains',
  'git',
  'principals',
] as const

export type OrgSettingsTabId = (typeof ORG_SETTINGS_TAB_IDS)[number]

export const ORG_SETTINGS_TAB_LABELS: Record<OrgSettingsTabId, string> = {
  general: 'General',
  projects: 'Project Settings',
  access: 'Access',
  notifications: 'Notifications',
  domains: 'Domains & Certificates',
  git: 'Git Connections',
  principals: 'Principals',
}

/** The tab a `?tab=` value names; anything else opens General. `members` was Access's old name. */
export function parseOrgSettingsTab(
  value: string | readonly string[] | null | undefined
): OrgSettingsTabId {
  const first = typeof value === 'string' ? value : value?.[0]
  if (first === 'members') return 'access'
  return ORG_SETTINGS_TAB_IDS.find((id) => id === first) ?? 'general'
}

export function orgSettingsTabHref(orgId: string, tab: OrgSettingsTabId): string {
  return tab === 'general' ? orgManageHref(orgId) : `${orgManageHref(orgId)}?tab=${tab}`
}

/** Organization Settings › Project Settings, which replaced the Projects › Settings page. */
export function orgProjectSettingsHref(orgId: string): string {
  return orgSettingsTabHref(orgId, 'projects')
}

/**
 * Query key the billing screen reads on arrival: `tier` (catalogue tier id
 * or label) pre-selects the tier to buy at or move a license to — the
 * server detail Upgrade button sets it. Stripe's own return adds
 * `checkout=success|cancel` (see the control plane's `checkoutReturnUrls`).
 */
export const BILLING_TIER_QUERY_PARAM = 'tier'

export function orgBillingHref(
  orgId: string,
  preselect?: Readonly<{ tier?: string | null }>
): string {
  const params = new URLSearchParams()
  if (preselect?.tier) params.set(BILLING_TIER_QUERY_PARAM, preselect.tier)
  const query = params.toString()
  return query.length > 0 ? `/${orgId}/billing?${query}` : `/${orgId}/billing`
}

export function serverMetricsHref(
  orgId: string,
  serverId: string
): `/${string}/servers/${string}/metrics` {
  return `/${orgId}/servers/${serverId}/metrics`
}

export function serverDetailHref(orgId: string, serverId: string): `/${string}/servers/${string}` {
  return `/${orgId}/servers/${serverId}`
}

/**
 * Where Git applications are managed.
 *
 * Replaces the old `projects/sources` and `projects/git-apps` pair. This page
 * stops at applications and their connected accounts; the repository rows those
 * connections attach live on {@link projectRepositoriesHref}.
 */
export function projectGitSourcesHref(orgId: string): `/${string}/projects/git-sources` {
  return `/${orgId}/projects/git-sources`
}

/**
 * The organization's connected Git repositories.
 *
 * Rows are created implicitly — attached from a project flow or added by clone
 * URL — and deduplicated per organization, so this screen is where an operator
 * sees what accumulated, refreshes provider facts, and deletes rows nothing
 * references any more.
 */
export function projectRepositoriesHref(orgId: string): `/${string}/projects/repositories` {
  return `/${orgId}/projects/repositories`
}

/** Organization-owned GitHub Apps and GitLab applications. */

/** Servers list shown after a server is removed, carrying its name for the notice. */
export function serversRemovedHref(orgId: string, serverName: string): string {
  return `/${orgId}/servers?removed=${encodeURIComponent(serverName)}`
}

export function serversDatacentersHref(orgId: string): `/${string}/servers/datacenters` {
  return `/${orgId}/servers/datacenters`
}

export function serversPendingKeysHref(orgId: string): `/${string}/servers/keys` {
  return `/${orgId}/servers/keys`
}

/** The phone's Search tab (the header search is an icon on narrow widths). */
export function orgSearchHref(orgId: string): `/${string}/search` {
  return `/${orgId}/search`
}

/** True on the Search tab's page. */
export function isOrgSearchPath(pathname: string, orgId: string): boolean {
  return orgPathWithoutQuery(pathname) === orgSearchHref(orgId)
}

/** The Servers list with the Add Server steps already open (the search's "Add Server"). */
export function serversAddHref(orgId: string): `/${string}/servers?add=1` {
  return `/${orgId}/servers?add=1`
}

/** True when the `add` query value asks for the Add Server steps. */
export function isAddServerRequest(value: string | readonly string[] | null | undefined): boolean {
  return (typeof value === 'string' ? value : value?.[0]) === '1'
}

export function datacenterHref(
  orgId: string,
  datacenterId: string
): `/${string}/servers/datacenters/${string}` {
  return `/${orgId}/servers/datacenters/${datacenterId}`
}

export function datacenterNewHref(orgId: string): `/${string}/servers/datacenters/new` {
  return `/${orgId}/servers/datacenters/new`
}

export function serversFabricHref(orgId: string): `/${string}/servers/fabric` {
  return `/${orgId}/servers/fabric`
}

export function serversAddressesHref(orgId: string): `/${string}/servers/addresses` {
  return `/${orgId}/servers/addresses`
}

export function serversDockerHref(orgId: string): `/${string}/servers/docker` {
  return `/${orgId}/servers/docker`
}

export function serversFirewallHref(orgId: string): `/${string}/servers/firewall` {
  return `/${orgId}/servers/firewall`
}

export function serversReservedHref(orgId: string): `/${string}/servers/reserved` {
  return `/${orgId}/servers/reserved`
}

export function serversCloudflareHref(orgId: string): `/${string}/servers/cloudflare` {
  return `/${orgId}/servers/cloudflare`
}

export function serversTunnelsHref(orgId: string): `/${string}/servers/tunnels` {
  return `/${orgId}/servers/tunnels`
}

export const SERVER_DETAIL_TAB_IDS = [
  'overview',
  'services',
  'control',
  'time',
  'network',
  'firewall',
  'principals',
  'metrics',
] as const

export type ServerDetailTabId = (typeof SERVER_DETAIL_TAB_IDS)[number]

export const SERVER_DETAIL_TAB_LABELS: Record<ServerDetailTabId, string> = {
  overview: 'Overview',
  services: 'Services',
  control: 'Control',
  time: 'Time',
  network: 'Network',
  firewall: 'Firewall',
  principals: 'Principals',
  metrics: 'Metrics',
}

export function serverDetailTabHref(
  orgId: string,
  serverId: string,
  tabId: ServerDetailTabId
): string {
  return `${serverDetailHref(orgId, serverId)}?tab=${tabId}`
}

const SERVER_DETAIL_SUB_ROUTE = {
  id: 'server-detail',
  label: 'Server',
  pathSegment: '',
  hint: 'Server control panel',
} as const

const SERVER_METRICS_SUB_ROUTE = {
  id: 'metrics',
  label: 'Metrics',
  pathSegment: 'metrics',
  hint: 'Host metrics charts',
} as const

const DATACENTER_DETAIL_SUB_ROUTE = {
  id: 'datacenter-detail',
  label: 'Datacenter',
  pathSegment: 'datacenters',
  hint: 'Private CIDR, members, and timezone',
} as const

const DATACENTER_NEW_SUB_ROUTE = {
  id: 'datacenter-new',
  label: 'New Datacenter',
  pathSegment: 'datacenters',
  hint: 'Create a datacenter from a server IP',
} as const

function resolveServersExtraSubRoute(parts: readonly string[]) {
  if (parts.length < 4) return null
  if (parts[3] === 'metrics') return SERVER_METRICS_SUB_ROUTE
  if (parts[2] !== 'datacenters') return null
  if (parts[3] === 'new') return DATACENTER_NEW_SUB_ROUTE
  return DATACENTER_DETAIL_SUB_ROUTE
}

export function orgAreaFromPathname(pathname: string) {
  const parts = pathname.split('/').filter(Boolean)
  if (parts.length < 2) {
    return null
  }

  const areaSegment = parts[1]
  const area = ORG_AREAS.find((entry) => entry.pathSegment === areaSegment)
  if (!area) {
    return null
  }

  if (areaSegment === 'servers') {
    const extra = resolveServersExtraSubRoute(parts)
    if (extra) return { area, subRoute: extra }
    if (parts.length >= 3) {
      const maybeSub = parts[2]
      const knownSub = area.subRoutes.some((entry) => entry.pathSegment === maybeSub)
      if (!knownSub && maybeSub !== 'metrics') {
        return { area, subRoute: SERVER_DETAIL_SUB_ROUTE }
      }
    }
  }

  const subRouteSegment = parts[2]
  const subRoute = subRouteSegment
    ? (area.subRoutes.find((entry) => entry.pathSegment === subRouteSegment) ?? null)
    : null

  return { area, subRoute }
}
