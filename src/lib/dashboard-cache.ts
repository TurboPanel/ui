import type { QueryClient, QueryKey } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query-keys'

/**
 * A returning person sees the last dashboard at once: the lists the home
 * screen draws are kept in browser storage and revalidated in the background.
 *
 * Only a fixed set of non-sensitive lists is kept (organizations, and the
 * org-wide project, environment and container-summary lists), only for one
 * signed-in user. Every row is rebuilt from an explicit per-entity field list,
 * so a column the API adds later is never written to storage, and nothing that
 * can carry configuration (compose documents, options, free metadata) is kept.
 * Anything restored is marked stale and unconfirmed: it is always refetched on
 * first use, and the organization route waits for the live answer.
 */

export const DASHBOARD_CACHE_STORAGE_KEY = 'turbopanel.dashboardCache.v1'
export const DASHBOARD_CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000
const MAX_SERIALIZED_LENGTH = 750_000
/** Older than any real fetch, so a restored list is stale and revalidates. */
export const RESTORED_UPDATED_AT = 1

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

type PersistedEntry = Readonly<{ queryKey: QueryKey; data: unknown }>

type Snapshot = Readonly<{
  version: 1
  userId: string
  savedAt: number
  entries: PersistedEntry[]
}>

function defaultStorage(): StorageLike | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

const ORG_LISTS = new Set(['projects', 'environments', 'containers'])

function isEmptyFilter(value: unknown): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.keys(value).length === 0
  )
}

/** True for the keys of the lists the dashboard keeps. */
export function isPersistableQueryKey(queryKey: QueryKey): boolean {
  const organizations: readonly unknown[] = queryKeys.auth.organizations
  if (
    queryKey.length === organizations.length &&
    queryKey.every((part, index) => part === organizations[index])
  ) {
    return true
  }
  if (queryKey.length !== 4 || queryKey[0] !== 'org') return false
  if (typeof queryKey[1] !== 'string' || typeof queryKey[2] !== 'string') return false
  if (!ORG_LISTS.has(queryKey[2])) return false
  // Only the org-wide lists the home cards read. A per-project or filtered
  // list is read by detail screens that expect full records.
  return queryKey[2] === 'containers' ? isEmptyFilter(queryKey[3]) : queryKey[3] === 'all'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

const ORGANIZATION_FIELDS = ['id', 'name', 'createdAt', 'icon', 'isEmojiIconAllowed'] as const
const PROJECT_FIELDS = [
  'id',
  'name',
  'description',
  'workspaceId',
  'repositoryId',
  'kind',
  'icon',
  'createdAt',
  'updatedAt',
] as const
const PROJECT_METADATA_FIELDS = ['code', 'component'] as const
const ENVIRONMENT_FIELDS = [
  'id',
  'name',
  'description',
  'projectId',
  'serverId',
  'isPrimary',
  'pinned',
  'createdAt',
  'updatedAt',
] as const
const CONTAINER_FIELDS = [
  'id',
  'serviceId',
  'environmentId',
  'serverId',
  'containerId',
  'containerName',
  'status',
  'role',
  'composeServiceName',
  'createdAt',
  'updatedAt',
] as const

function pick(
  row: Record<string, unknown>,
  fields: readonly string[],
  nulled: readonly string[] = []
): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const field of fields) {
    if (row[field] !== undefined) out[field] = row[field]
  }
  // Fields the types call required but that are not kept read as empty.
  for (const field of nulled) out[field] = null
  return out
}

function rebuildRows(
  rows: unknown,
  rebuild: (row: Record<string, unknown>) => Record<string, unknown>
): Record<string, unknown>[] {
  return Array.isArray(rows) ? rows.filter(isRecord).map(rebuild) : []
}

function rebuildProject(row: Record<string, unknown>): Record<string, unknown> {
  const out = pick(row, PROJECT_FIELDS, ['options'])
  out.metadata = isRecord(row.metadata) ? pick(row.metadata, PROJECT_METADATA_FIELDS) : null
  return out
}

/** Each kept row is rebuilt from its field list; null when the shape is unknown. */
export function sanitizeForPersist(queryKey: QueryKey, data: unknown): unknown {
  if (!isRecord(data)) return null
  if (queryKey[0] === 'auth') {
    if (!Array.isArray(data.organizations)) return null
    return {
      organizations: rebuildRows(data.organizations, (row) => pick(row, ORGANIZATION_FIELDS)),
    }
  }
  switch (queryKey[2]) {
    case 'projects':
      if (!Array.isArray(data.projects)) return null
      return { projects: rebuildRows(data.projects, rebuildProject) }
    case 'environments':
      if (!Array.isArray(data.environments)) return null
      return {
        environments: rebuildRows(data.environments, (row) =>
          pick(row, ENVIRONMENT_FIELDS, ['options', 'metadata'])
        ),
      }
    case 'containers':
      if (!Array.isArray(data.containers)) return null
      return {
        containers: rebuildRows(data.containers, (row) =>
          pick(row, CONTAINER_FIELDS, ['options', 'metadata'])
        ),
      }
    default:
      return null
  }
}

export function buildDashboardSnapshot(
  client: QueryClient,
  userId: string,
  now: number = Date.now()
): Snapshot {
  const entries: PersistedEntry[] = []
  for (const query of client.getQueryCache().getAll()) {
    if (query.state.status !== 'success' || !isPersistableQueryKey(query.queryKey)) continue
    const data = sanitizeForPersist(query.queryKey, query.state.data)
    if (data !== null) entries.push({ queryKey: query.queryKey, data })
  }
  return { version: 1, userId, savedAt: now, entries }
}

export function clearDashboardCache(storage: StorageLike | null = defaultStorage()): void {
  try {
    storage?.removeItem(DASHBOARD_CACHE_STORAGE_KEY)
  } catch {
    // Storage can be blocked; there is nothing to clear then.
  }
}

/** Write the snapshot for `userId`. Returns false when nothing was stored. */
export function saveDashboardCache(
  client: QueryClient,
  userId: string,
  storage: StorageLike | null = defaultStorage(),
  now: number = Date.now()
): boolean {
  if (!storage || userId.length === 0) return false
  try {
    const snapshot = buildDashboardSnapshot(client, userId, now)
    if (snapshot.entries.length === 0) return false
    const serialized = JSON.stringify(snapshot)
    if (serialized.length > MAX_SERIALIZED_LENGTH) return false
    storage.setItem(DASHBOARD_CACHE_STORAGE_KEY, serialized)
    return true
  } catch {
    return false
  }
}

function readSnapshot(storage: StorageLike | null, now: number): Snapshot | null {
  if (!storage) return null
  try {
    const raw = storage.getItem(DASHBOARD_CACHE_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<Snapshot> | null
    if (
      parsed?.version !== 1 ||
      typeof parsed.userId !== 'string' ||
      typeof parsed.savedAt !== 'number' ||
      !Array.isArray(parsed.entries)
    ) {
      return null
    }
    if (now - parsed.savedAt > DASHBOARD_CACHE_MAX_AGE_MS) return null
    return parsed as Snapshot
  } catch {
    return null
  }
}

/**
 * Put the stored lists for `userId` into the cache. A snapshot that belongs to
 * another person (or is unreadable or too old) is removed and never read.
 * Lists that already hold data are left alone. Returns how many were restored.
 */
export function restoreDashboardCache(
  client: QueryClient,
  userId: string,
  storage: StorageLike | null = defaultStorage(),
  now: number = Date.now()
): number {
  const snapshot = readSnapshot(storage, now)
  if (snapshot?.userId !== userId || userId.length === 0) {
    clearDashboardCache(storage)
    return 0
  }
  let restored = 0
  for (const entry of snapshot.entries) {
    if (!Array.isArray(entry.queryKey) || !isPersistableQueryKey(entry.queryKey)) continue
    const data = sanitizeForPersist(entry.queryKey, entry.data)
    if (data === null || client.getQueryData(entry.queryKey) !== undefined) continue
    client.setQueryData(entry.queryKey, data, { updatedAt: RESTORED_UPDATED_AT })
    restored += 1
  }
  return restored
}
