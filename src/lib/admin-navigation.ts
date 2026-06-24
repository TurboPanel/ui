export const ADMIN_AREAS = [
  {
    id: 'networking',
    label: 'Networking',
    pathSegment: 'networking',
    hint: 'Control-plane public URLs and TLS',
    subRoutes: [],
  },
] as const

export type AdminAreaId = (typeof ADMIN_AREAS)[number]['id']

export function adminAreaHref(
  areaPathSegment: string,
): `/admin/${string}` {
  return `/admin/${areaPathSegment}`
}

export function adminAreaFromPathname(pathname: string) {
  const parts = pathname.split('/').filter(Boolean)
  if (parts.length < 2 || parts[0] !== 'admin') {
    return null
  }

  const areaSegment = parts[1]
  const area = ADMIN_AREAS.find((entry) => entry.pathSegment === areaSegment)
  if (!area) {
    return null
  }

  return { area }
}
