import { orgAreaHref } from '@/lib/org-navigation'
import { resolveServerConnectionStatus } from '@/lib/server-connection-status'

/** Phones (narrower than this) keep the header as it is: no breadcrumb. */
export const BREADCRUMB_MIN_WIDTH = 640

/** The smallest width the header search keeps when a breadcrumb takes room beside it. */
export const SEARCH_MIN_WIDTH_WITH_BREADCRUMB = 240

export function showsBreadcrumb(width: number): boolean {
  return width >= BREADCRUMB_MIN_WIDTH
}

export type BreadcrumbChip = Readonly<{ key: string; label?: string }>

export type Breadcrumb = Readonly<{
  /** Links to the pages above the current one. */
  trail: readonly Readonly<{ label: string; href: string }>[]
  /** The page's own object, with its status. */
  current: Readonly<{ label: string; chip: BreadcrumbChip | null }>
}>

export type BreadcrumbRoute = Readonly<{ kind: 'server' | 'project'; id: string }>

const SERVER_LIST_PAGES = new Set(['datacenters', 'keys', 'settings', 'tls'])
const PROJECT_LIST_PAGES = new Set(['new', 'settings', 'git-sources', 'repositories'])

/** The server or project the address names, or null on list pages and other areas. */
export function breadcrumbRoute(pathname: string, orgId: string): BreadcrumbRoute | null {
  const path = pathname.split('?')[0] ?? ''
  const [org, area, id] = path.split('/').filter(Boolean)
  if (org !== orgId || !id) return null
  if (area === 'servers' && !SERVER_LIST_PAGES.has(id)) return { kind: 'server', id }
  if (area === 'projects' && !PROJECT_LIST_PAGES.has(id)) return { kind: 'project', id }
  return null
}

type ServerLike = Readonly<{
  id: string
  name: string | null
  hostname: string | null
  connected: boolean
  statusChangedAt: string | null
}>

export function serverBreadcrumb(orgId: string, server: ServerLike): Breadcrumb {
  const status = resolveServerConnectionStatus(server)
  return {
    trail: [{ label: 'Servers', href: orgAreaHref(orgId, 'servers') }],
    current: {
      label: server.name?.trim() || server.hostname?.trim() || `Server ${server.id.slice(0, 8)}`,
      chip: status === 'initializing' ? { key: 'busy', label: 'Initializing' } : { key: status },
    },
  }
}

const projectChip = (status: string): BreadcrumbChip | null =>
  status === 'unknown' ? null : { key: status }

/** `status` is the project's worst environment status key (see the Projects home cards). */
export function projectBreadcrumb(orgId: string, name: string | null, status: string): Breadcrumb {
  return {
    trail: [{ label: 'Projects', href: orgAreaHref(orgId, 'projects') }],
    current: { label: name?.trim() || 'Unnamed project', chip: projectChip(status) },
  }
}

export function databaseBreadcrumb(orgId: string, name: string | null, status: string): Breadcrumb {
  return {
    trail: [{ label: 'Managed', href: orgAreaHref(orgId, 'managed') }],
    current: { label: name?.trim() || 'Managed database', chip: projectChip(status) },
  }
}
