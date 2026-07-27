export const ORG_AREAS = [
  {
    id: 'projects',
    label: 'Projects',
    pathSegment: 'projects',
    hint: 'Projects filtered by the workspace switcher',
    subRoutes: [],
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
        id: 'settings',
        label: 'Settings',
        pathSegment: 'settings',
        hint: 'Fleet defaults such as the default server timezone',
      },
      {
        id: 'networks',
        label: 'Networks',
        pathSegment: 'networks',
        hint: 'Addresses, interfaces, and connectivity',
      },
      {
        id: 'datacenters',
        label: 'Datacenters',
        pathSegment: 'datacenters',
        hint: 'Physical locations grouping servers on a private network',
      },
      {
        id: 'ips',
        label: 'IP addresses',
        pathSegment: 'ips',
        hint: 'Managed address pool for ingress and internal routing',
      },
      {
        id: 'vpns',
        label: 'VPNs',
        pathSegment: 'vpns',
        hint: 'WireGuard meshes linking datacenters via peer servers',
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

export function orgAreaHref(
  orgId: string,
  areaPathSegment: string,
): `/${string}/${string}` {
  return `/${orgId}/${areaPathSegment}`
}

export function orgRouteHref(
  orgId: string,
  areaPathSegment: string,
  subRoutePathSegment: string,
): `/${string}/${string}/${string}` {
  return `/${orgId}/${areaPathSegment}/${subRoutePathSegment}`
}

export function defaultOrgDashboardHref(orgId: string): `/${string}/servers` {
  return `/${orgId}/servers`
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

export function datacenterDetailHref(
  orgId: string,
  datacenterId: string,
): `/${string}/servers/datacenters/${string}` {
  return `/${orgId}/servers/datacenters/${datacenterId}`
}

export function vpnDetailHref(
  orgId: string,
  vpnId: string,
): `/${string}/servers/vpns/${string}` {
  return `/${orgId}/servers/vpns/${vpnId}`
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

  if (
    areaSegment === 'servers' &&
    parts.length >= 4 &&
    parts[3] === 'metrics'
  ) {
    return { area, subRoute: SERVER_METRICS_SUB_ROUTE }
  }

  if (areaSegment === 'servers' && parts.length >= 3) {
    const maybeSub = parts[2]
    const knownSub = area.subRoutes.some(
      (entry) => entry.pathSegment === maybeSub,
    )
    if (!knownSub && maybeSub !== 'metrics') {
      return { area, subRoute: SERVER_DETAIL_SUB_ROUTE }
    }
  }

  const subRouteSegment = parts[2]
  const subRoute = subRouteSegment
    ? (area.subRoutes.find((entry) => entry.pathSegment === subRouteSegment) ??
      null)
    : null

  return { area, subRoute }
}
