export type ServerRemovalReasonKind =
  | 'network'
  | 'container'
  | 'ip'
  | 'environment'
  | 'managed'
  | 'replica'
  | 'deployment'
  | 'slot'
  | 'copy'
  | 'colocated'

export type ServerDeleteBlocker = {
  kind: string
  count: number
  items?: ServerBlockerItem[]
  more?: number
}

/** Mirrors turbopanel `ServerBlockerEnvironmentItem`. */
export type ServerBlockerEnvironmentItem = {
  id: string
  name: string
  projectId: string
  projectName: string
  hasDatabase: boolean
}

/** Mirrors turbopanel `ServerBlockerDatabaseItem`. */
export type ServerBlockerDatabaseItem = {
  id: string
  name: string
}

export type ServerBlockerItem = ServerBlockerEnvironmentItem | ServerBlockerDatabaseItem

/** How many names a blocker sentence spells out before "and N more". */
export const SERVER_BLOCKER_MESSAGE_NAME_LIMIT = 3

const NAMED_BLOCKER_COPY: Partial<
  Record<ServerRemovalReasonKind, { one: string; many: string }>
> = {
  environment: {
    one: 'App environment %s is still placed on this server.',
    many: 'App environments %s are still placed on this server.',
  },
  managed: {
    one: 'Managed database %s is still placed on this server.',
    many: 'Managed databases %s are still placed on this server.',
  },
  replica: {
    one: 'Database %s still has a member on this server.',
    many: 'Databases %s still have members on this server.',
  },
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function isServerBlockerEnvironmentItem(
  item: ServerBlockerItem
): item is ServerBlockerEnvironmentItem {
  return 'projectId' in item && typeof item.projectId === 'string'
}

/** `"Project / Environment"` for an environment item, the plain name otherwise. */
export function serverBlockerItemName(item: ServerBlockerItem): string {
  if (isServerBlockerEnvironmentItem(item)) {
    const project = item.projectName.trim()
    const name = item.name.trim()
    if (project.length === 0) return name
    if (name.length === 0) return project
    return `${project} / ${name}`
  }
  return item.name.trim()
}

function joinNames(parts: readonly string[]): string {
  if (parts.length <= 1) return parts[0] ?? ''
  return `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}`
}

/** Up to three quoted names, then "and N more" (matches services-tab reasons). */
export function serverBlockerQuotedNames(
  items: readonly ServerBlockerItem[],
  more = 0
): string {
  const shown = items
    .slice(0, SERVER_BLOCKER_MESSAGE_NAME_LIMIT)
    .map((item) => `"${serverBlockerItemName(item)}"`)
  const hidden = items.length - shown.length + more
  if (hidden > 0) shown.push(`${hidden} more`)
  return joinNames(shown)
}

export function parseServerBlockerItems(value: unknown): ServerBlockerItem[] {
  if (!Array.isArray(value)) return []
  const rows: ServerBlockerItem[] = []
  for (const entry of value) {
    if (!isRecord(entry) || typeof entry.id !== 'string' || typeof entry.name !== 'string') {
      continue
    }
    if (typeof entry.projectId === 'string' && typeof entry.projectName === 'string') {
      rows.push({
        id: entry.id,
        name: entry.name,
        projectId: entry.projectId,
        projectName: entry.projectName,
        hasDatabase: entry.hasDatabase === true,
      })
      continue
    }
    rows.push({ id: entry.id, name: entry.name })
  }
  return rows
}

export function blockerNamedItems(
  blocker: Readonly<{ items?: unknown; more?: number }>
): { items: ServerBlockerItem[]; more: number } {
  const items = parseServerBlockerItems(blocker.items)
  const more = typeof blocker.more === 'number' && Number.isFinite(blocker.more) ? blocker.more : 0
  return { items, more: Math.max(0, more) }
}

function namedBlockerMessage(
  kind: ServerRemovalReasonKind,
  items: readonly ServerBlockerItem[],
  more: number,
  count: number
): string | null {
  const copy = NAMED_BLOCKER_COPY[kind]
  if (!copy || items.length === 0) return null
  const template = count === 1 && more === 0 ? copy.one : copy.many
  return template.replace('%s', serverBlockerQuotedNames(items, more))
}

export function formatServerDeleteBlocker(blocker: ServerDeleteBlocker): string {
  const { kind, count } = blocker
  if (typeof kind !== 'string' || typeof count !== 'number' || count < 1) {
    return ''
  }
  const { items, more } = blockerNamedItems(blocker)
  const named = namedBlockerMessage(kind as ServerRemovalReasonKind, items, more, count)
  if (named) return named

  if (kind === 'network') {
    const label = count === 1 ? 'network' : 'networks'
    return `Remove ${count} ${label} on this server before deleting it.`
  }
  if (kind === 'container') {
    const label = count === 1 ? 'container' : 'containers'
    return `Remove ${count} ${label} on this server before deleting it.`
  }
  if (kind === 'ip') {
    const label = count === 1 ? 'address' : 'addresses'
    return `Remove ${count} ${label} on this server before deleting it.`
  }
  const noun = count === 1 ? 'item' : 'items'
  return `${count} other ${noun} still placed on this server — remove them first`
}
