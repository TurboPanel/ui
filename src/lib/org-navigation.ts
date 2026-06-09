export const ORG_AREAS = [
  {
    id: 'servers',
    label: 'Servers',
    pathSegment: 'servers',
    hint: 'Managed hosts and fleet status',
    subRoutes: [
      {
        id: 'overview',
        label: 'Overview',
        pathSegment: 'overview',
        hint: 'Fleet summary and server health',
      },
      {
        id: 'networks',
        label: 'Networks',
        pathSegment: 'networks',
        hint: 'Addresses, interfaces, and connectivity',
      },
    ],
  },
] as const

export type OrgAreaId = (typeof ORG_AREAS)[number]['id']
export type OrgSubRouteId =
  (typeof ORG_AREAS)[number]['subRoutes'][number]['id']

export function orgRouteHref(
  orgId: string,
  areaPathSegment: string,
  subRoutePathSegment: string,
): `/${string}/${string}/${string}` {
  return `/${orgId}/${areaPathSegment}/${subRoutePathSegment}`
}

export function defaultOrgDashboardHref(orgId: string): `/${string}/servers/overview` {
  return `/${orgId}/servers/overview`
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

  const subRouteSegment = parts[2]
  const subRoute =
    area.subRoutes.find((entry) => entry.pathSegment === subRouteSegment) ??
    area.subRoutes[0]

  return { area, subRoute }
}
