export const ADMIN_AREAS = [
  {
    id: 'access',
    label: 'Access',
    pathSegment: 'access',
    hint: 'Hostnames, certificates, and how people and machines reach this control plane',
    subRoutes: [
      {
        id: 'certificates',
        label: 'Certificates',
        pathSegment: 'certificates',
      },
      {
        id: 'trusted-proxies',
        label: 'Trusted proxies',
        pathSegment: 'trusted-proxies',
      },
      {
        id: 'tunnel',
        label: 'Tunnel',
        pathSegment: 'tunnel',
      },
      {
        id: 'platform-ca',
        label: 'Platform CA',
        pathSegment: 'platform-ca',
      },
    ],
  },
  {
    id: 'updates',
    label: 'Updates',
    pathSegment: 'updates',
    hint: 'Control plane and co-located daemon versions',
    subRoutes: [],
  },
  {
    id: 'email',
    label: 'Email',
    pathSegment: 'email',
    hint: 'Email provider and SMTP/Mailgun configuration',
    subRoutes: [],
  },
  {
    id: 'auth-providers',
    label: 'Sign-in providers',
    pathSegment: 'auth-providers',
    hint: 'GitHub and Google OAuth client credentials',
    subRoutes: [],
  },
  {
    id: 'git',
    label: 'Git providers',
    pathSegment: 'git',
    hint: 'GitHub Apps and GitLab OAuth applications shared by the whole instance',
    subRoutes: [],
  },
  {
    id: 'signup',
    label: 'Sign-up',
    pathSegment: 'signup',
    hint: 'Public account creation toggle',
    subRoutes: [],
  },
  {
    id: 'tiers',
    label: 'Tiers',
    pathSegment: 'tiers',
    hint: 'Billing tier catalogue, entered by hand and verified against Stripe',
    subRoutes: [],
  },
  {
    id: 'secrets',
    label: 'Secrets',
    pathSegment: 'secrets',
    hint: 'Rotate at-rest secret encryption',
    subRoutes: [],
  },
  {
    id: 'metrics',
    label: 'Server metrics',
    pathSegment: 'metrics',
    hint: 'Live-session sampling limits',
    subRoutes: [],
  },
] as const

export type AdminAreaId = (typeof ADMIN_AREAS)[number]['id']

export type AdminSubRouteId =
  (typeof ADMIN_AREAS)[number]['subRoutes'][number]['id']

export function adminAreaHref(areaPathSegment: string): `/admin/${string}` {
  return `/admin/${areaPathSegment}`
}

export function adminRouteHref(
  areaPathSegment: string,
  subRoutePathSegment: string,
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
    ? (area.subRoutes.find((entry) => entry.pathSegment === subRouteSegment) ??
      null)
    : null

  return { area, subRoute }
}
