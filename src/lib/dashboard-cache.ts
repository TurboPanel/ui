import type { QueryClient, QueryKey } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query-keys'

/**
 * A returning person sees the last dashboard at once: the lists the home
 * screen draws are kept in browser storage and revalidated in the background.
 *
 * Only an allow-listed set of non-sensitive lists is kept (organizations,
 * projects, environments, container summaries), only for one signed-in user,
 * and fields that can carry configuration (compose documents, options, free
 * metadata) are dropped. Anything restored is marked stale, so it is always
 * refetched on first use.
 */

export const DASHBOARD_CACHE_STORAGE_KEY = 'turbopanel.dashboardCache.v1'
export const DASHBOARD_CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000
const MAX_SERIALIZED_LENGTH = 750_000
/** Older than any real fetch, so a restored list is stale and revalidates. */
const RESTORED_UPDATED_AT = 1

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
  // Containers are kept only as the unfiltered org-wide list.
  return queryKey[2] !== 'containers' || isEmptyFilter(queryKey[3])
}

function stripFields(rows: unknown, fields: readonly string[]): unknown {
  if (!Array.isArray(rows)) return []
  return rows.map((row) => {
    if (typeof row !== 'object' || row === null) return row
    const copy: Record<string, unknown> = { ...(row as Record<string, unknown>) }
    for (const field of fields) delete copy[field]
    return copy
  })
}

/** The list with configuration-bearing fields removed, or null when the shape is unknown. */
export function sanitizeForPersist(queryKey: QueryKey, data: unknown): unknown {
  if (typeof data !== 'object' || data === null) return null
  const record = data as Record<string, unknown>
  if (queryKey[0] === 'auth') {
    return Array.isArray(record.organizations) ? { organizations: record.organizations } : null
  }
  switch (queryKey[2]) {
    case 'projects':
      return Array.isArray(record.projects)
        ? { projects: stripFields(record.projects, ['options']) }
        : null
    case 'environments':
      return Array.isArray(record.environments)
        ? { environments: stripFields(record.environments, ['options', 'metadata']) }
        : null
    case 'containers':
      return Array.isArray(record.containers)
        ? { containers: stripFields(record.containers, ['options', 'metadata']) }
        : null
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
  if (!snapshot || snapshot.userId !== userId || userId.length === 0) {
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
