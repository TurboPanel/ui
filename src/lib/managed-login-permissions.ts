/**
 * Plain-words shaping of what a database login can really do (the read-only
 * "What can this login do?" view). Pure: no network, no React.
 */
import type {
  ManagedEffectiveGrant,
  ManagedEffectivePermissions,
  ManagedPrivilegeCatalogue,
} from '@/lib/managed-services'

export type PermissionGroupId = 'database' | 'objects' | 'columns' | 'routines' | 'other'

export const PERMISSION_GROUPS: readonly {
  id: PermissionGroupId
  title: string
  levels: readonly string[]
}[] = [
  { id: 'database', title: 'Whole database', levels: ['database'] },
  { id: 'objects', title: 'Schemas and tables', levels: ['schema', 'table'] },
  { id: 'columns', title: 'Columns', levels: ['column'] },
  { id: 'routines', title: 'Routines and sequences', levels: ['routine', 'sequence', 'type'] },
  {
    id: 'other',
    title: 'Server-wide and other',
    levels: ['global', 'parameter', 'tablespace', 'language', 'foreign', 'largeobject'],
  },
]

/** Fallback when the catalogue could not be read. */
const LEVEL_NAMES: Readonly<Record<string, string>> = {
  global: 'Whole server',
  database: 'Database',
  schema: 'Schema',
  table: 'Table',
  column: 'Column',
  sequence: 'Sequence',
  routine: 'Routine',
  type: 'Type',
  parameter: 'Setting',
  tablespace: 'Storage area',
  language: 'Language',
  foreign: 'Outside data source',
  largeobject: 'Large object',
}

export function levelName(level: string, catalogue?: ManagedPrivilegeCatalogue | null): string {
  return catalogue?.levels.find((entry) => entry.id === level)?.label ?? LEVEL_NAMES[level] ?? level
}

function groupOf(level: string): PermissionGroupId {
  return PERMISSION_GROUPS.find((group) => group.levels.includes(level))?.id ?? 'other'
}

export type PermissionGroup = {
  id: PermissionGroupId
  title: string
  grants: ManagedEffectiveGrant[]
}

export type PermissionDatabase = {
  /** `null` = grants that are not tied to one database (MySQL / MariaDB server-wide). */
  name: string | null
  /** MySQL / MariaDB wildcard pattern, not an exact name. */
  pattern: boolean
  /** The login's own grants. */
  groups: PermissionGroup[]
  /** Postgres PUBLIC grants: held by everyone, shown read-only. */
  everyone: ManagedEffectiveGrant[]
}

/** Per database: the login's own grants by level, and the grants everyone has. */
export function groupPermissions(grants: readonly ManagedEffectiveGrant[]): PermissionDatabase[] {
  const byKey = new Map<string, PermissionDatabase>()
  for (const grant of grants) {
    const name = grant.database ?? null
    const pattern = grant.pattern === true
    const key = `${pattern ? 'p' : 'e'}:${name ?? ''}`
    let entry = byKey.get(key)
    if (!entry) {
      entry = { name, pattern, groups: [], everyone: [] }
      byKey.set(key, entry)
    }
    if (grant.viaLabel === 'everyone') {
      entry.everyone.push(grant)
      continue
    }
    const id = groupOf(grant.level)
    let group = entry.groups.find((row) => row.id === id)
    if (!group) {
      group = { id, title: PERMISSION_GROUPS.find((row) => row.id === id)?.title ?? '', grants: [] }
      entry.groups.push(group)
    }
    group.grants.push(grant)
  }
  const order = (id: PermissionGroupId) => PERMISSION_GROUPS.findIndex((row) => row.id === id)
  const rows = [...byKey.values()]
  for (const row of rows) row.groups.sort((a, b) => order(a.id) - order(b.id))
  return rows.sort((a, b) => {
    if (a.name === null) return -1
    if (b.name === null) return 1
    return a.name.localeCompare(b.name) || Number(a.pattern) - Number(b.pattern)
  })
}

/** Where a grant sits inside its database, for example `public.orders` or `orders (a, b)`. */
export function grantTarget(grant: ManagedEffectiveGrant): string {
  const path = [grant.schema, grant.object].filter(Boolean).join('.')
  const columns = grant.columns?.length ? ` (${grant.columns.join(', ')})` : ''
  if (path) return `${path}${columns}`
  if (grant.level === 'database') return 'Everything in this database'
  if (grant.level === 'global') return 'Everything on the server'
  if (grant.level === 'schema') return 'Every schema'
  return `All ${levelName(grant.level).toLowerCase()}s${columns}`
}

export type PermissionsNotice = { title: string; body: string; tone: 'info' | 'warning' }

function list(names: readonly string[]): string {
  return names.join(', ')
}

/** Notices that say the picture is incomplete, in plain words. */
export function permissionsNotices(view: ManagedEffectivePermissions): PermissionsNotice[] {
  const out: PermissionsNotice[] = []
  if (view.exists === false) {
    out.push({
      title: 'This login does not exist on the server yet',
      body: 'Apply the changes to the database, then look again.',
      tone: 'warning',
    })
  }
  const failed = view.databasesFailed ?? []
  if (failed.length > 0) {
    out.push({
      title: 'Some databases could not be read',
      body: `Their permissions are not shown: ${list(failed)}. Try again in a moment.`,
      tone: 'warning',
    })
  }
  const notAsked = view.databasesNotAsked ?? []
  if (notAsked.length > 0) {
    out.push({
      title: 'Some databases were left out',
      body: `Only the first databases are read at once. Not read: ${list(notAsked)}.`,
      tone: 'warning',
    })
  }
  if (view.truncated) {
    out.push({
      title: 'The list was cut short',
      body: 'This login has more permissions than can be shown at once, so some are missing.',
      tone: 'warning',
    })
  }
  if (view.versionMatchesCatalogue === false) {
    out.push({
      title: 'The server runs a different version than expected',
      body: 'Some names may be shown as the database spells them.',
      tone: 'info',
    })
  }
  return out
}

/** The plain-words message for a failed read, by status and code in the error text. */
export function permissionsErrorMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : ''
  const code = /HTTP \d+:\s*([a-z0-9_]+)/i.exec(raw)?.[1]
  const status = Number(/HTTP (\d+)/i.exec(raw)?.[1])
  if (code === 'daemon_update_required') {
    return 'This server needs a newer TurboPanel version before it can show permissions. Update the server and try again.'
  }
  if (code === 'server_offline') {
    return 'The server is offline, so its permissions cannot be read right now. Bring it back online and try again.'
  }
  if (code === 'permissions_read_failed' || status === 502 || status === 504) {
    return status === 504
      ? 'The server did not answer in time. Try again in a moment.'
      : 'The server could not read the permissions. Try again in a moment.'
  }
  if (code === 'privilege_catalogue_unsupported_version') {
    return 'Permissions cannot be shown for this database version.'
  }
  if (status === 404) return 'This login was not found. It may have been deleted.'
  return 'Permissions could not be loaded. Try again in a moment.'
}
