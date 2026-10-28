type AdminSubRoute = Readonly<{
  id: string
  label: string
  pathSegment: string
}>

const NO_SUB_ROUTES = [] as const

/** A sub-route whose path segment is its id. */
function adminSubRoute<const Id extends string>(id: Id, label: string) {
  return { id, label, pathSegment: id }
}

/** An admin area whose path segment is its id. */
function adminArea<
  const Id extends string,
  const SubRoutes extends readonly AdminSubRoute[] = typeof NO_SUB_ROUTES,
>(id: Id, label: string, hint: string, subRoutes?: SubRoutes) {
  return {
    id,
    label,
    pathSegment: id,
    hint,
    subRoutes: subRoutes ?? NO_SUB_ROUTES,
  }
}

export const ADMIN_AREAS = [
  adminArea(
    'access',
    'Access',
    'Hostnames, certificates, and how people and machines reach this control plane',
    [
      adminSubRoute('certificates', 'Certificates'),
      adminSubRoute('trusted-proxies', 'Trusted Proxies'),
      adminSubRoute('tunnel', 'Tunnel'),
      adminSubRoute('platform-ca', 'Platform CA'),
    ]
  ),
  adminArea('updates', 'Updates', 'Control plane and co-located daemon versions', [
    adminSubRoute('history', 'Update History'),
  ]),
  adminArea('email', 'Email', 'Email provider and SMTP/Mailgun configuration'),
  adminArea('auth-providers', 'Sign-In Providers', 'GitHub and Google OAuth client credentials'),
  adminArea(
    'git',
    'Git Providers',
    'GitHub Apps and GitLab OAuth applications shared with every organization'
  ),
  adminArea('signup', 'Sign-Up', 'Public account creation toggle'),
  adminArea(
    'tiers',
    'Tiers',
    'Billing tier catalogue, entered by hand and verified against Stripe'
  ),
  adminArea('secrets', 'Secrets', 'Rotate at-rest secret encryption'),
  adminArea('metrics', 'Server Metrics', 'Live-session sampling limits'),
] as const

export type AdminAreaId = (typeof ADMIN_AREAS)[number]['id']

export type AdminSubRouteId = (typeof ADMIN_AREAS)[number]['subRoutes'][number]['id']

export function adminAreaHref(areaPathSegment: string): `/admin/${string}` {
  return `/admin/${areaPathSegment}`
}

export function adminRouteHref(
  areaPathSegment: string,
  subRoutePathSegment: string
): `/admin/${string}/${string}` {
  return `/admin/${areaPathSegment}/${subRoutePathSegment}`
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

  const subRouteSegment = parts[2]
  const subRoute = subRouteSegment
    ? (area.subRoutes.find((entry) => entry.pathSegment === subRouteSegment) ?? null)
    : null

  return { area, subRoute }
}
