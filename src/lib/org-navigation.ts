export const ORG_AREAS = [
  {
    id: 'servers',
    label: 'Servers',
    pathSegment: 'servers',
    hint: 'Managed hosts and fleet status',
    subRoutes: [
      {
        id: 'networks',
        label: 'Networks',
        pathSegment: 'networks',
        hint: 'Addresses, interfaces, and connectivity',
      },
      {
        id: 'licenses',
        label: 'Licenses',
        pathSegment: 'licenses',
        hint: 'Registration keys in use',
      },
    ],
  },
  {
    id: 'workspaces',
    label: 'Workspaces',
    pathSegment: 'workspaces',
    hint: 'Manage workspaces for this organization',
    subRoutes: [],
  },
  {
    id: 'projects',
    label: 'Projects',
    pathSegment: 'projects',
    hint: 'Manage projects and environments',
    subRoutes: [],
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

  const subRouteSegment = parts[2]
  const subRoute = subRouteSegment
    ? (area.subRoutes.find((entry) => entry.pathSegment === subRouteSegment) ??
      null)
    : null

  return { area, subRoute }
}
