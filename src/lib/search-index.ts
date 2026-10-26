import type { SearchIconId } from '@/lib/header-search'
import { searchDestinations } from '@/lib/header-search'
import { adminAreaHref } from '@/lib/admin-navigation'
import {
  ORG_AREAS,
  ORG_SETTINGS_TAB_IDS,
  ORG_SETTINGS_TAB_LABELS,
  SERVER_DETAIL_TAB_IDS,
  SERVER_DETAIL_TAB_LABELS,
  datacenterHref,
  orgAreaHref,
  orgRouteHref,
  orgSettingsTabHref,
  serverDetailHref,
  serverDetailTabHref,
  serversAddHref,
} from '@/lib/org-navigation'
import { resolveServerConnectionStatus } from '@/lib/server-connection-status'

/** The result groups, in the order they are listed when nothing ranks higher. */
export const SEARCH_GROUP_ORDER = [
  'Actions',
  'Servers',
  'Projects',
  'Databases',
  'Datacenters',
  'Pages',
] as const

export type SearchGroup = (typeof SEARCH_GROUP_ORDER)[number]

/** The most rows one search lists, so a large fleet never floods the popover. */
export const SEARCH_RESULT_LIMIT = 30

export type SearchItemIcon = SearchIconId | 'server' | 'database' | 'action-add' | 'action'

export type SearchItem = Readonly<{
  id: string
  name: string
  /** Muted label at the right of the row. */
  type: string
  group: SearchGroup
  href: string
  icon: SearchItemIcon
  /** Extra words the query can match (hostname, address, synonyms). */
  keywords: string
  /** Set on rows that belong to one server, project or database. */
  objectId?: string
  /** Server connection or managed database status shown as a chip. */
  status?: string
  /** Dangerous: Enter asks first and only then opens the page. */
  danger?: boolean
  /** The sentence shown while a dangerous row waits for its confirmation. */
  confirm?: string
  /** Ranks above rows with the same match (status-aware actions). */
  priority?: boolean
}>

export type SearchServer = Readonly<{
  id: string
  name: string | null
  hostname: string | null
  address: string | null
  connected: boolean
  statusChangedAt: string | null
}>

export type SearchProject = Readonly<{
  id: string
  name: string | null
  type: string | null | undefined
}>

export type SearchDatabase = Readonly<{
  id: string
  projectId: string
  name: string | null
  engineName: string | null
  status: string
}>

export type SearchDatacenter = Readonly<{ id: string; name: string | null }>

export type SearchData = Readonly<{
  billingEnabled: boolean
  projectsScopeId: string
  /** `organization:manage`. */
  canManage: boolean
  /** `organization:own`. */
  canOwn: boolean
  /** Platform admin or superadmin. */
  isPlatformAdmin: boolean
  servers: readonly SearchServer[]
  projects: readonly SearchProject[]
  databases: readonly SearchDatabase[]
  datacenters: readonly SearchDatacenter[]
}>

const serverName = (server: SearchServer) =>
  server.name?.trim() || server.hostname?.trim() || `Server ${server.id.slice(0, 8)}`

function pageItems(orgId: string, data: SearchData): SearchItem[] {
  const pages: SearchItem[] = searchDestinations(orgId, {
    billingEnabled: data.billingEnabled,
    projectsScopeId: data.projectsScopeId,
  }).map((entry) => ({
    id: entry.id,
    name: entry.name,
    type: entry.type,
    group: 'Pages',
    href: entry.href,
    icon: entry.icon,
    keywords: '',
  }))
  const sub = (
    area: 'servers' | 'network' | 'managed',
    subId: string,
    name: string,
    keywords = ''
  ): SearchItem[] => {
    const entry = ORG_AREAS.find((a) => a.id === area)?.subRoutes.find((s) => s.id === subId)
    if (!entry) return []
    return [
      {
        id: `${area}-${entry.id}`,
        name,
        type: 'Page',
        group: 'Pages',
        href: orgRouteHref(orgId, area, entry.pathSegment),
        icon: area,
        keywords,
      },
    ]
  }
  const networkPages = ORG_AREAS.find((a) => a.id === 'network')?.subRoutes.map((entry) => ({
    id: `network-${entry.id}`,
    name: entry.label,
    type: 'Network',
    group: 'Pages' as const,
    href: orgRouteHref(orgId, 'network', entry.pathSegment),
    icon: 'network' as const,
    keywords: '',
  }))
  const settingsPages = ORG_SETTINGS_TAB_IDS.filter((tab) => tab !== 'general').map(
    (tab): SearchItem => ({
      id: `org-settings-${tab}`,
      name: tab === 'notifications' ? 'Notification settings' : ORG_SETTINGS_TAB_LABELS[tab],
      type: 'Organization settings',
      group: 'Pages',
      href: orgSettingsTabHref(orgId, tab),
      icon: 'org-settings',
      keywords: tab === 'principals' ? 'hosting accounts linux users' : '',
    })
  )
  return [
    ...pages,
    ...sub('servers', 'datacenters', 'Datacenters'),
    ...sub('servers', 'keys', 'Pending Keys', 'registration keys unused'),
    ...sub('servers', 'tls', 'Server certificates', 'tls ssl'),
    ...sub('servers', 'settings', 'Server settings', 'defaults timezone'),
    ...(networkPages ?? []),
    ...sub('managed', 'settings', 'Managed database settings', 'defaults'),
    ...settingsPages,
  ]
}

function generalActions(orgId: string, data: SearchData): SearchItem[] {
  const action = (
    id: string,
    name: string,
    href: string,
    keywords: string,
    icon: SearchItemIcon = 'action'
  ): SearchItem => ({
    id: `action-${id}`,
    name,
    type: 'Action',
    group: 'Actions',
    href,
    icon,
    keywords,
  })
  return [
    ...(data.canOwn
      ? [
          action(
            'add-server',
            'Add server',
            serversAddHref(orgId),
            'new create enroll host',
            'action-add'
          ),
        ]
      : []),
    action(
      'add-project',
      'Add project',
      orgRouteHref(orgId, 'projects', 'new'),
      'new create site app',
      'action-add'
    ),
    action(
      'add-database',
      'Add database',
      `${orgRouteHref(orgId, 'projects', 'new')}?type=managed`,
      'new create managed postgres mysql',
      'action-add'
    ),
    ...(data.canManage
      ? [
          action(
            'invite-member',
            'Invite member',
            orgSettingsTabHref(orgId, 'members'),
            'add people user team',
            'action-add'
          ),
          action(
            'update-servers',
            'Update servers',
            orgAreaHref(orgId, 'servers'),
            'upgrade daemon version'
          ),
        ]
      : []),
    ...(data.isPlatformAdmin
      ? [
          action(
            'update-panel',
            'Update TurboPanel',
            adminAreaHref('updates'),
            'upgrade version release'
          ),
        ]
      : []),
  ]
}

function serverItems(orgId: string, data: SearchData): SearchItem[] {
  return data.servers.flatMap((server): SearchItem[] => {
    const name = serverName(server)
    const status = resolveServerConnectionStatus(server)
    const jump = (id: string, label: string, tab: (typeof SERVER_DETAIL_TAB_IDS)[number]) => ({
      id: `action-${id}-${server.id}`,
      name: label,
      type: 'Action',
      group: 'Actions' as const,
      href: serverDetailTabHref(orgId, server.id, tab),
      icon: 'action' as const,
      objectId: server.id,
    })
    const items: SearchItem[] = [
      {
        id: `server-${server.id}`,
        name,
        type: 'Server',
        group: 'Servers',
        href: serverDetailHref(orgId, server.id),
        icon: 'server',
        keywords: [server.hostname, server.address].filter(Boolean).join(' '),
        objectId: server.id,
        status,
      },
      ...SERVER_DETAIL_TAB_IDS.filter((tab) => tab !== 'overview').map((tab): SearchItem => ({
        id: `server-${server.id}-tab-${tab}`,
        name: `${name}: ${SERVER_DETAIL_TAB_LABELS[tab]}`,
        type: 'Server page',
        group: 'Pages',
        href: serverDetailTabHref(orgId, server.id, tab),
        icon: 'server',
        keywords: '',
        objectId: server.id,
      })),
      { ...jump('firewall', `Open firewall for ${name}`, 'firewall'), keywords: 'rules ports' },
    ]
    if (data.canOwn) {
      const gone = status === 'offline'
      items.push({
        ...jump(
          'remove',
          gone ? `Remove server ${name} (host is gone)` : `Remove server ${name}`,
          'control'
        ),
        keywords: 'delete forget remove',
        danger: true,
        priority: gone,
        confirm: `Remove server ${name}? This opens its Control tab, where you confirm the removal.`,
      })
      if (status === 'online') {
        items.push({
          ...jump('reboot', `Reboot server ${name}`, 'control'),
          keywords: 'restart',
          danger: true,
          confirm: `Reboot server ${name}? This opens its Control tab, where you confirm the reboot.`,
        })
      }
    }
    return items
  })
}

function objectItems(orgId: string, data: SearchData): SearchItem[] {
  const projects = data.projects
    .filter((project) => project.type !== 'system' && project.type !== 'managed')
    .map((project): SearchItem => ({
      id: `project-${project.id}`,
      name: project.name?.trim() || 'Untitled project',
      type: 'Project',
      group: 'Projects',
      href: orgRouteHref(orgId, 'projects', project.id),
      icon: 'projects',
      keywords: '',
      objectId: project.id,
    }))
  const databases = data.databases.map((database): SearchItem => ({
    id: `database-${database.id}`,
    name: database.name?.trim() || 'Managed database',
    type: 'Database',
    group: 'Databases',
    href: orgRouteHref(orgId, 'projects', database.projectId),
    icon: 'database',
    keywords: database.engineName ?? '',
    objectId: database.id,
    status: database.status,
  }))
  const datacenters = data.datacenters.map((datacenter): SearchItem => ({
    id: `datacenter-${datacenter.id}`,
    name: datacenter.name?.trim() || 'Datacenter',
    type: 'Datacenter',
    group: 'Datacenters',
    href: datacenterHref(orgId, datacenter.id),
    icon: 'servers',
    keywords: '',
    objectId: datacenter.id,
  }))
  return [...serverItems(orgId, data), ...projects, ...databases, ...datacenters]
}

/**
 * Everything the header search can open or do: the organization's servers,
 * projects, databases and datacenters, every page (including sub-pages and
 * server tabs) and actions. Actions follow what the person may do, and they
 * follow status: an offline server offers removal, not a reboot.
 */
export function buildSearchItems(orgId: string, data: SearchData): SearchItem[] {
  return [...generalActions(orgId, data), ...pageItems(orgId, data), ...objectItems(orgId, data)]
}

const words = (text: string) =>
  text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)

function tokenMatches(token: string, nameWords: readonly string[], keywords: readonly string[]) {
  return (
    nameWords.some((word) => word.startsWith(token)) ||
    keywords.some((keyword) => keyword.startsWith(token))
  )
}

const wordCache = new WeakMap<
  SearchItem,
  { nameWords: string[]; keywordParts: string[]; keywordWords: string[] }
>()

/** The item's words, split once instead of on every keystroke. */
function wordsOf(item: SearchItem) {
  let cached = wordCache.get(item)
  if (!cached) {
    const keywordParts = item.keywords.toLowerCase().split(/\s+/).filter(Boolean)
    cached = {
      nameWords: words(item.name),
      keywordParts,
      keywordWords: keywordParts.flatMap(words),
    }
    wordCache.set(item, cached)
  }
  return cached
}

/** 0 exact name, 1 name starts with the query, 2 every word starts a name word, 3 matched through keywords; null for no match. */
function matchScore(item: SearchItem, query: string, tokens: readonly string[]): number | null {
  const name = item.name.toLowerCase()
  if (name === query) return 0
  if (name.startsWith(query)) return 1
  const { nameWords, keywordParts, keywordWords } = wordsOf(item)
  if (tokens.every((token) => nameWords.some((word) => word.startsWith(token)))) return 2
  return tokens.every((token) => tokenMatches(token, [...nameWords, ...keywordWords], keywordParts))
    ? 3
    : null
}

/**
 * The rows to list for a query, grouped. Groups are ordered by their best
 * match (ties keep {@link SEARCH_GROUP_ORDER}); inside a group the better
 * match comes first. An empty query lists the general actions and the pages
 * only, never one row per server.
 */
export function rankSearchItems(items: readonly SearchItem[], query: string): SearchItem[] {
  const q = query.trim().toLowerCase()
  if (!q) {
    const general = items.filter((item) => !item.objectId)
    return SEARCH_GROUP_ORDER.flatMap((group) => general.filter((item) => item.group === group))
  }
  const tokens = q.split(/\s+/)
  const scored = items.flatMap((item, order) => {
    const score = matchScore(item, q, tokens)
    return score === null ? [] : [{ item, order, score: score - (item.priority ? 0.5 : 0) }]
  })
  scored.sort((a, b) => a.score - b.score || a.order - b.order)
  const top = scored.slice(0, SEARCH_RESULT_LIMIT)
  const best = new Map<SearchGroup, number>()
  for (const entry of top) {
    if (!best.has(entry.item.group)) best.set(entry.item.group, entry.score)
  }
  const groups = [...best.keys()].sort(
    (a, b) =>
      (best.get(a) ?? 0) - (best.get(b) ?? 0) ||
      SEARCH_GROUP_ORDER.indexOf(a) - SEARCH_GROUP_ORDER.indexOf(b)
  )
  return groups.flatMap((group) =>
    top.filter((entry) => entry.item.group === group).map((entry) => entry.item)
  )
}

/** The status chip a row shows: a status key and the word to print, or null. */
export function searchStatusChip(item: SearchItem): { key: string; label?: string } | null {
  switch (item.status) {
    case undefined:
      return null
    case 'online':
    case 'offline':
      return { key: item.status }
    case 'initializing':
      return { key: 'busy', label: 'Initializing' }
    case 'ready':
      return { key: 'running' }
    case 'failed':
      return { key: 'failed', label: 'Failed' }
    case 'stopped':
      return { key: 'stopped' }
    default:
      return { key: 'busy', label: item.status === 'applying' ? 'Applying' : 'Provisioning' }
  }
}
