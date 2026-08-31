export const ADMIN_AREAS = [
  {
    id: 'networking',
    label: 'Networking',
    pathSegment: 'networking',
    hint: 'Control-plane public URLs and TLS',
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
