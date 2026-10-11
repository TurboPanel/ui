import { useSyncExternalStore } from 'react'

/**
 * The projects someone opened last, newest first, for the sidebar's
 * "Recent projects". Kept per organization, on this device only (localStorage
 * in the browser, memory for the session where storage is missing, throws, or
 * the platform has none). Nothing goes to the control plane.
 *
 * Only ids are stored. Names come from the projects list, so a rename shows up
 * at once and a deleted project simply drops out of the list.
 */
export const RECENT_PROJECTS_LIMIT = 5

const STORAGE_PREFIX = 'turbopanel.recentProjects.'

export function recentProjectsStorageKey(orgId: string): string {
  return `${STORAGE_PREFIX}${orgId}`
}

/** Read a stored list, tolerating anything a hand-edited or old value holds. */
export function parseRecentProjectIds(raw: string | null | undefined): string[] {
  if (!raw) return []
  try {
    const value: unknown = JSON.parse(raw)
    if (!Array.isArray(value)) return []
    const ids = value.filter(
      (entry): entry is string => typeof entry === 'string' && entry.length > 0,
    )
    return [...new Set(ids)].slice(0, RECENT_PROJECTS_LIMIT)
  } catch {
    return []
  }
}

/** Put `projectId` first, drop its older place, keep at most the limit. */
export function touchRecentProjectIds(
  current: readonly string[],
  projectId: string,
): string[] {
  return [projectId, ...current.filter((id) => id !== projectId)].slice(
    0,
    RECENT_PROJECTS_LIMIT,
  )
}

/**
 * The first `limit` recent ids that still name a project in `known`, in
 * recent order. Missing projects (deleted, or hidden from this person) are
 * skipped rather than shown as holes.
 */
export function resolveRecentProjects<T extends Readonly<{ id: string }>>(
  recentIds: readonly string[],
  known: readonly T[],
  limit = RECENT_PROJECTS_LIMIT,
): T[] {
  const byId = new Map(known.map((project) => [project.id, project]))
  const out: T[] = []
  for (const id of recentIds) {
    const project = byId.get(id)
    if (project) out.push(project)
    if (out.length >= limit) break
  }
  return out
}

function readStored(orgId: string): string[] {
  try {
    if (typeof localStorage === 'undefined') return []
    return parseRecentProjectIds(
      localStorage.getItem(recentProjectsStorageKey(orgId)),
    )
  } catch {
    return []
  }
}

function writeStored(orgId: string, ids: readonly string[]): void {
  try {
    if (typeof localStorage === 'undefined') return
    localStorage.setItem(recentProjectsStorageKey(orgId), JSON.stringify(ids))
  } catch {
    // Private windows and blocked storage: the list still holds in memory.
  }
}

const EMPTY: readonly string[] = Object.freeze([])
// One array per organization, replaced (never edited) so `useSyncExternalStore`
// sees a new snapshot only when the list changed.
const cache = new Map<string, readonly string[]>()
const listeners = new Set<() => void>()

function emit(): void {
  for (const listener of listeners) listener()
}

export function subscribeRecentProjects(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function getRecentProjectIds(orgId: string): readonly string[] {
  if (!orgId) return EMPTY
  let ids = cache.get(orgId)
  if (!ids) {
    ids = readStored(orgId)
    cache.set(orgId, ids)
  }
  return ids
}

/** Note that `projectId` was just opened in `orgId`. */
export function recordProjectTouch(orgId: string, projectId: string): void {
  if (!orgId || !projectId) return
  const current = getRecentProjectIds(orgId)
  if (current[0] === projectId) return
  const next = touchRecentProjectIds(current, projectId)
  cache.set(orgId, next)
  writeStored(orgId, next)
  emit()
}

export function useRecentProjectIds(orgId: string): readonly string[] {
  return useSyncExternalStore(
    subscribeRecentProjects,
    () => getRecentProjectIds(orgId),
    () => EMPTY,
  )
}
