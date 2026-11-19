import { QueryClient } from '@tanstack/react-query'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  DASHBOARD_CACHE_MAX_AGE_MS,
  DASHBOARD_CACHE_STORAGE_KEY,
  clearDashboardCache,
  isPersistableQueryKey,
  restoreDashboardCache,
  saveDashboardCache,
  sanitizeForPersist,
} from '@/lib/dashboard-cache'
import { queryKeys } from '@/lib/query-keys'

function memoryStorage() {
  const map = new Map<string, string>()
  return {
    map,
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
    removeItem: (key: string) => void map.delete(key),
  }
}

function seed(client: QueryClient) {
  client.setQueryData(queryKeys.auth.organizations, {
    organizations: [{ id: 'org-1', name: 'One', createdAt: 'x' }],
  })
  const org = queryKeys.org('org-1')
  client.setQueryData(org.projects.list(), {
    projects: [{ id: 'p1', name: 'P', options: { compose: { env: 'SECRET=1' } } }],
  })
  client.setQueryData(org.environments.list(), {
    environments: [{ id: 'e1', projectId: 'p1', options: { compose: 1 }, metadata: { a: 1 } }],
  })
  client.setQueryData(org.containers.list(), {
    containers: [{ id: 'c1', status: 'running', options: { env: 'X' }, metadata: { token: 't' } }],
  })
  // Not on the allow-list: must never be written.
  client.setQueryData(['org', 'org-1', 'variables', 'all'], { variables: [{ value: 'secret' }] })
  client.setQueryData(['auth', 'session'], { userId: 'u1', email: 'a@example.net' })
  client.setQueryData(org.containers.list({ serviceId: 's1' }), { containers: [] })
}

describe('dashboard cache', () => {
  let storage: ReturnType<typeof memoryStorage>
  beforeEach(() => {
    storage = memoryStorage()
  })

  it('allows only the dashboard lists', () => {
    expect(isPersistableQueryKey(queryKeys.auth.organizations)).toBe(true)
    expect(isPersistableQueryKey(queryKeys.org('o').projects.list())).toBe(true)
    expect(isPersistableQueryKey(queryKeys.org('o').containers.list())).toBe(true)
    expect(isPersistableQueryKey(queryKeys.org('o').containers.list({ serviceId: 's' }))).toBe(
      false
    )
    expect(isPersistableQueryKey(['auth', 'session'])).toBe(false)
    expect(isPersistableQueryKey(['org', 'o', 'variables', 'all'])).toBe(false)
  })

  it('saves only allow-listed lists without configuration fields or secrets', () => {
    const client = new QueryClient()
    seed(client)
    expect(saveDashboardCache(client, 'u1', storage)).toBe(true)
    const raw = storage.map.get(DASHBOARD_CACHE_STORAGE_KEY) ?? ''
    expect(raw).not.toContain('SECRET')
    expect(raw).not.toContain('secret')
    expect(raw).not.toContain('token')
    expect(raw).not.toContain('a@example.net')
    expect(JSON.parse(raw).entries).toHaveLength(4)
  })

  it('restores the same user as stale data and leaves live data alone', () => {
    const source = new QueryClient()
    seed(source)
    saveDashboardCache(source, 'u1', storage)

    const client = new QueryClient()
    const org = queryKeys.org('org-1')
    client.setQueryData(org.projects.list(), { projects: [{ id: 'live' }] })
    expect(restoreDashboardCache(client, 'u1', storage)).toBe(3)
    expect(client.getQueryData(org.projects.list())).toEqual({ projects: [{ id: 'live' }] })
    expect(client.getQueryState(queryKeys.auth.organizations)?.dataUpdatedAt).toBe(1)
    expect(client.getQueryState(queryKeys.auth.organizations)?.isInvalidated).toBe(false)
    expect(client.getQueryCache().find({ queryKey: org.environments.list() })).toBeDefined()
  })

  it('never restores another user and removes their snapshot', () => {
    const source = new QueryClient()
    seed(source)
    saveDashboardCache(source, 'u1', storage)
    const client = new QueryClient()
    expect(restoreDashboardCache(client, 'u2', storage)).toBe(0)
    expect(client.getQueryCache().getAll()).toHaveLength(0)
    expect(storage.map.has(DASHBOARD_CACHE_STORAGE_KEY)).toBe(false)
  })

  it('drops a snapshot that is too old, corrupt or has an unknown shape', () => {
    const source = new QueryClient()
    seed(source)
    saveDashboardCache(source, 'u1', storage, 1000)
    const client = new QueryClient()
    expect(
      restoreDashboardCache(client, 'u1', storage, 1000 + DASHBOARD_CACHE_MAX_AGE_MS + 1)
    ).toBe(0)
    expect(storage.map.size).toBe(0)

    storage.setItem(DASHBOARD_CACHE_STORAGE_KEY, '{nope')
    expect(restoreDashboardCache(client, 'u1', storage)).toBe(0)
    storage.setItem(DASHBOARD_CACHE_STORAGE_KEY, JSON.stringify({ version: 2 }))
    expect(restoreDashboardCache(client, 'u1', storage)).toBe(0)
  })

  it('clears on demand and survives storage that throws', () => {
    const client = new QueryClient()
    seed(client)
    saveDashboardCache(client, 'u1', storage)
    clearDashboardCache(storage)
    expect(storage.map.size).toBe(0)

    const broken = {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
      removeItem: () => {
        throw new Error('blocked')
      },
    }
    expect(saveDashboardCache(client, 'u1', broken)).toBe(false)
    expect(restoreDashboardCache(client, 'u1', broken)).toBe(0)
    expect(() => clearDashboardCache(broken)).not.toThrow()
    expect(saveDashboardCache(client, 'u1', null)).toBe(false)
    expect(saveDashboardCache(client, '', storage)).toBe(false)
  })

  it('does not write an empty snapshot over a saved one', () => {
    const client = new QueryClient()
    seed(client)
    saveDashboardCache(client, 'u1', storage)
    const before = storage.map.get(DASHBOARD_CACHE_STORAGE_KEY)
    client.clear()
    expect(saveDashboardCache(client, 'u1', storage)).toBe(false)
    expect(storage.map.get(DASHBOARD_CACHE_STORAGE_KEY)).toBe(before)
  })

  it('refuses unknown shapes when sanitizing', () => {
    expect(sanitizeForPersist(queryKeys.auth.organizations, null)).toBeNull()
    expect(sanitizeForPersist(queryKeys.auth.organizations, { organizations: 1 })).toBeNull()
    expect(sanitizeForPersist(queryKeys.org('o').projects.list(), { projects: 1 })).toBeNull()
    expect(sanitizeForPersist(queryKeys.org('o').environments.list(), {})).toBeNull()
    expect(sanitizeForPersist(queryKeys.org('o').containers.list(), {})).toBeNull()
    expect(sanitizeForPersist(['org', 'o', 'other', 'x'], { a: 1 })).toBeNull()
    expect(
      sanitizeForPersist(queryKeys.org('o').projects.list(), { projects: [1, { id: 'p' }] })
    ).toEqual({ projects: [1, { id: 'p' }] })
  })
})
