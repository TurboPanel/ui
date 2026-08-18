import type { Href } from 'expo-router'
import { TURBOFABRIC_PRODUCT_NAME } from '@/lib/platform-copy'
import { projectsHrefForScope } from '@/lib/workspace-scope'

export const ORG_AREAS = [
  {
    id: 'overview',
    label: 'Overview',
    pathSegment: 'overview',
    hint: 'Organization overview',
    subRoutes: [],
  },
  {
    id: 'projects',
    label: 'Projects',
    pathSegment: 'projects',
    hint: 'Projects filtered by the workspace switcher',
    subRoutes: [
      {
        id: 'settings',
        label: 'Settings',
        pathSegment: 'settings',
        hint: 'Project defaults such as the default environment name',
      },
    ],
  },
  {
    id: 'managed',
    label: 'Managed',
    pathSegment: 'managed',
    hint: 'Managed database and engine services across the organization',
    subRoutes: [],
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
        label: 'Pending keys',
        pathSegment: 'keys',
        hint: 'Unused registration keys that have not enrolled a host',
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
    ],
  },
  {
    id: 'network',
    label: 'Network',
    pathSegment: 'network',
    hint: 'TurboFabric, addresses, and Docker networks',
    subRoutes: [
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
        label: 'Docker networks',
        pathSegment: 'docker',
        hint: 'Compose external Docker network registry',
      },
    ],
  },
  {
    id: 'access',
    label: 'Access',
    pathSegment: 'access',
    hint: 'Roles, permissions, and grants',
    subRoutes: [],
  },
] as const

export type OrgAreaId = (typeof ORG_AREAS)[number]['id']
export type OrgSubRouteId =
  (typeof ORG_AREAS)[number]['subRoutes'][number]['id']

/** Native bottom-tab set. Other org areas stay reachable by deep link only on native. */
export const ORG_TAB_AREA_IDS = [
  'overview',
  'projects',
  'servers',
] as const satisfies readonly OrgAreaId[]

export type OrgTabAreaId = (typeof ORG_TAB_AREA_IDS)[number]

export type OrgTabSwipeDirection = 'next' | 'previous'

export type OrgTabHref =
  | `/${string}/${string}`
  | `/${string}/projects?workspaceId=${string}`

export function orgAreaHref(
  orgId: string,
  areaPathSegment: string,
): `/${string}/${string}` {
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
export function isOrgAreaActive(
  pathname: string,
  orgId: string,
  areaPathSegment: string,
): boolean {
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
  return ORG_TAB_AREA_IDS.some(
    (areaId) => path === orgAreaHref(orgId, areaId),
  )
}

/**
 * Index into {@link ORG_TAB_AREA_IDS} for a native tab overview path.
 * `-1` when the path is not one of those overviews.
 */
export function orgTabIndexFromPathname(pathname: string, orgId: string): number {
  const path = orgPathWithoutQuery(pathname)
  return ORG_TAB_AREA_IDS.findIndex(
    (areaId) => path === orgAreaHref(orgId, areaId),
  )
}

/**
 * Expo Router nested-stack route names for the three native tab overviews
 * (`overview`, `projects/index`, `[orgId]/servers` — not project Overview
 * or server detail).
 */
export function isOrgTabOverviewRouteName(routeName: string): boolean {
  const normalized = routeName
    .replace(/\/index$/, '')
    .replace(/^\[orgId\]\//, '')
  return (ORG_TAB_AREA_IDS as readonly string[]).includes(normalized)
}

/** Shared identity so the root stack keeps a single org console screen. */
export const ORG_CONSOLE_SINGULAR_ID = 'org-console'

type OrganizationReplaceRouter = Readonly<{
  replace: (
    href: Href,
    options?: { dangerouslySingular?: boolean | (() => string) },
  ) => void
}>

/**
 * Open an organization without stacking the previous org on the native back
 * stack (no slide, no swipe-back to the org you just left).
 */
export function replaceOrganization(
  router: OrganizationReplaceRouter,
  href: Href,
): void {
  router.replace(href, {
    dangerouslySingular: () => ORG_CONSOLE_SINGULAR_ID,
  })
}

export function orgTabHref(
  orgId: string,
  areaId: OrgTabAreaId,
  projectsScopeId: string,
): OrgTabHref {
  if (areaId === 'projects') {
    return projectsHrefForScope(orgId, projectsScopeId)
  }
  return orgAreaHref(orgId, areaId)
}

export function adjacentOrgTabHref(
  pathname: string,
  orgId: string,
  direction: OrgTabSwipeDirection,
  projectsScopeId: string,
): OrgTabHref | null {
  const path = orgPathWithoutQuery(pathname)
  const index = ORG_TAB_AREA_IDS.findIndex(
    (areaId) => path === orgAreaHref(orgId, areaId),
  )
  if (index < 0) {
    return null
  }
  const nextIndex = direction === 'next' ? index + 1 : index - 1
  const areaId = ORG_TAB_AREA_IDS[nextIndex]
  if (!areaId) {
    return null
  }
  return orgTabHref(orgId, areaId, projectsScopeId)
}

export function orgRouteHref(
  orgId: string,
  areaPathSegment: string,
  subRoutePathSegment: string,
): `/${string}/${string}/${string}` {
  return `/${orgId}/${areaPathSegment}/${subRoutePathSegment}`
}

export function defaultOrgDashboardHref(orgId: string): `/${string}/overview` {
  return `/${orgId}/overview`
}

/** Signed-in organization picker — searchable list, create, manage. */
export function organizationsHref(): '/organizations' {
  return '/organizations'
}

export function orgManageHref(orgId: string): `/${string}/manage` {
  return `/${orgId}/manage`
}

export function serverMetricsHref(
  orgId: string,
  serverId: string,
): `/${string}/servers/${string}/metrics` {
  return `/${orgId}/servers/${serverId}/metrics`
}

export function serverDetailHref(
  orgId: string,
  serverId: string,
): `/${string}/servers/${string}` {
  return `/${orgId}/servers/${serverId}`
}

export function serversDatacentersHref(
  orgId: string,
): `/${string}/servers/datacenters` {
  return `/${orgId}/servers/datacenters`
}

export function serversPendingKeysHref(
  orgId: string,
): `/${string}/servers/keys` {
  return `/${orgId}/servers/keys`
}

export function datacenterHref(
  orgId: string,
  datacenterId: string,
): `/${string}/servers/datacenters/${string}` {
  return `/${orgId}/servers/datacenters/${datacenterId}`
}

export function datacenterNewHref(
  orgId: string,
): `/${string}/servers/datacenters/new` {
  return `/${orgId}/servers/datacenters/new`
}

/** @deprecated Use {@link datacenterHref} — datacenter and site are the same entity. */
export function networkSiteHref(
  orgId: string,
  datacenterId: string,
): `/${string}/servers/datacenters/${string}` {
  return datacenterHref(orgId, datacenterId)
}

export function networkFabricHref(
  orgId: string,
): `/${string}/network/fabric` {
  return `/${orgId}/network/fabric`
}

export function networkAddressesHref(
  orgId: string,
): `/${string}/network/addresses` {
  return `/${orgId}/network/addresses`
}

export function networkDockerHref(
  orgId: string,
): `/${string}/network/docker` {
  return `/${orgId}/network/docker`
}

export const SERVER_DETAIL_TAB_IDS = [
  'overview',
  'control',
  'time',
  'network',
  'metrics',
] as const

export type ServerDetailTabId = (typeof SERVER_DETAIL_TAB_IDS)[number]

export const SERVER_DETAIL_TAB_LABELS: Record<ServerDetailTabId, string> = {
  overview: 'Overview',
  control: 'Control',
  time: 'Time',
  network: 'Network',
  metrics: 'Metrics',
}

export function serverDetailTabHref(
  orgId: string,
  serverId: string,
  tabId: ServerDetailTabId,
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

const SITE_DETAIL_SUB_ROUTE = {
  id: 'site-detail',
  label: 'Datacenter',
  pathSegment: 'sites',
  hint: 'Redirects to the Datacenters detail page',
} as const

const DATACENTER_DETAIL_SUB_ROUTE = {
  id: 'datacenter-detail',
  label: 'Datacenter',
  pathSegment: 'datacenters',
  hint: 'Private CIDR, members, and timezone',
} as const

const DATACENTER_NEW_SUB_ROUTE = {
  id: 'datacenter-new',
  label: 'New datacenter',
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
      const knownSub = area.subRoutes.some(
        (entry) => entry.pathSegment === maybeSub,
      )
      if (!knownSub && maybeSub !== 'metrics') {
        return { area, subRoute: SERVER_DETAIL_SUB_ROUTE }
      }
    }
  }

  if (areaSegment === 'network' && parts.length >= 4 && parts[2] === 'sites') {
    return { area, subRoute: SITE_DETAIL_SUB_ROUTE }
  }

  const subRouteSegment = parts[2]
  const subRoute = subRouteSegment
    ? (area.subRoutes.find((entry) => entry.pathSegment === subRouteSegment) ??
      null)
    : null

  return { area, subRoute }
}
