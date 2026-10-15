import type { OrgAreaId } from '@/lib/org-navigation'
import {
  ORG_AREAS,
  orgAreaHref,
  orgBillingHref,
  orgManageHref,
  orgRouteHref,
} from '@/lib/org-navigation'
import { projectsHrefForScope } from '@/lib/workspace-scope'

/** Widths under this collapse the header search to an icon button. */
export const HEADER_SEARCH_COLLAPSE_WIDTH = 1024

export type SearchIconId =
  | OrgAreaId
  | 'git-sources'
  | 'repositories'
  | 'project-settings'
  | 'org-settings'

export type SearchDestination = Readonly<{
  id: string
  name: string
  /** Muted label at the right of the row. */
  type: 'Page' | 'Projects'
  href: string
  icon: SearchIconId
}>

/**
 * Every page the header search can open, from the navigation registry. The
 * same gating as the sidebar and organization menu applies: Billing only when
 * the install has billing, and Projects opens on the current workspace scope.
 */
export function searchDestinations(
  orgId: string,
  options: Readonly<{ billingEnabled: boolean; projectsScopeId: string }>,
): SearchDestination[] {
  const area = (id: OrgAreaId) => ORG_AREAS.find((entry) => entry.id === id)
  const page = (id: OrgAreaId, label?: string): SearchDestination[] => {
    const entry = area(id)
    if (!entry) return []
    return [
      {
        id: entry.id,
        name: label ?? entry.label,
        type: 'Page',
        href:
          id === 'projects'
            ? projectsHrefForScope(orgId, options.projectsScopeId)
            : orgAreaHref(orgId, entry.pathSegment),
        icon: id,
      },
    ]
  }
  const projectSub = (
    subId: string,
    name: string,
    icon: SearchIconId,
  ): SearchDestination[] => {
    const sub = area('projects')?.subRoutes.find((entry) => entry.id === subId)
    if (!sub) return []
    return [
      {
        id: `projects-${sub.id}`,
        name,
        type: 'Projects',
        href: orgRouteHref(orgId, 'projects', sub.pathSegment),
        icon,
      },
    ]
  }
  return [
    ...page('projects'),
    ...projectSub('git-sources', 'Git sources', 'git-sources'),
    ...projectSub('repositories', 'Repositories', 'repositories'),
    ...projectSub('settings', 'Project settings', 'project-settings'),
    ...page('activity'),
    ...page('servers'),
    ...page('managed', 'Managed databases'),
    ...page('network'),
    ...page('access'),
    {
      id: 'org-settings',
      name: 'Organization settings',
      type: 'Page',
      href: orgManageHref(orgId),
      icon: 'org-settings',
    },
    ...(options.billingEnabled
      ? [
          {
            id: 'billing',
            name: 'Billing',
            type: 'Page' as const,
            href: orgBillingHref(orgId),
            icon: 'billing' as const,
          },
        ]
      : []),
  ]
}

/** Case-insensitive substring match on the name; an empty query keeps all. */
export function filterSearchDestinations(
  items: readonly SearchDestination[],
  query: string,
): SearchDestination[] {
  const q = query.trim().toLowerCase()
  if (!q) return [...items]
  return items.filter((item) => item.name.toLowerCase().includes(q))
}

export type HighlightedName = Readonly<{
  before: string
  match: string
  after: string
}>

/** Splits a name around the first case-insensitive match of the query. */
export function splitHighlight(name: string, query: string): HighlightedName {
  const q = query.trim().toLowerCase()
  const at = q ? name.toLowerCase().indexOf(q) : -1
  if (at < 0) return { before: name, match: '', after: '' }
  return {
    before: name.slice(0, at),
    match: name.slice(at, at + q.length),
    after: name.slice(at + q.length),
  }
}

/** Wraps the arrow-key cursor over `count` rows. */
export function moveSearchIndex(
  index: number,
  count: number,
  direction: 'down' | 'up',
): number {
  if (count <= 0) return 0
  return (index + (direction === 'down' ? 1 : count - 1)) % count
}

/** True for the key presses that should focus the search field. */
export function isSearchShortcut(
  event: Readonly<{
    key: string
    metaKey: boolean
    ctrlKey: boolean
    targetIsTextField: boolean
  }>,
): boolean {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
    return true
  }
  return event.key === '/' && !event.targetIsTextField
}
