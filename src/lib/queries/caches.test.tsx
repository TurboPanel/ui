// @vitest-environment happy-dom
import { QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createAppQueryClient, queryKeys } from '@/lib/query-client'
import {
  anyCacheApplying,
  useCreateCache,
  useDeleteCache,
  useEnvironmentCaches,
  useUpdateCache,
} from '@/lib/queries/caches'

const api = vi.hoisted(() => ({
  fetchEnvironmentCaches: vi.fn(),
  createEnvironmentCache: vi.fn(),
  updateEnvironmentCache: vi.fn(),
  deleteEnvironmentCache: vi.fn(),
}))

vi.mock('@/lib/instance-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/instance-api')>()),
  ...api,
}))

afterEach(() => vi.clearAllMocks())

function setup() {
  const client = createAppQueryClient()
  const invalidate = vi.spyOn(client, 'invalidateQueries')
  const wrapper = ({ children }: Readonly<{ children: React.ReactNode }>) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  return { wrapper, invalidate }
}

const keys = queryKeys.org('org-1')

describe('anyCacheApplying', () => {
  it('is true only while a host is starting a cache', () => {
    expect(anyCacheApplying(undefined)).toBe(false)
    expect(anyCacheApplying([])).toBe(false)
    expect(anyCacheApplying([{ status: 'ready' }, { status: 'pending' }])).toBe(false)
    expect(anyCacheApplying([{ status: 'ready' }, { status: 'applying' }])).toBe(true)
  })
})

describe('cache query hooks', () => {
  it('loads the caches and waits for an environment id', async () => {
    api.fetchEnvironmentCaches.mockResolvedValue({ caches: [] })
    const { wrapper } = setup()
    const idle = renderHook(() => useEnvironmentCaches('org-1', ''), { wrapper })
    expect(idle.result.current.fetchStatus).toBe('idle')
    const { result } = renderHook(() => useEnvironmentCaches('org-1', 'env-1'), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(api.fetchEnvironmentCaches).toHaveBeenCalledWith('env-1')
  })

  it('adds, changes and deletes through the environment, then refreshes caches and accounts', async () => {
    api.createEnvironmentCache.mockResolvedValue({ ok: true })
    api.updateEnvironmentCache.mockResolvedValue({ ok: true })
    api.deleteEnvironmentCache.mockResolvedValue({ ok: true, removed: 'host' })
    const { wrapper, invalidate } = setup()
    const create = renderHook(() => useCreateCache('org-1', 'env-1'), { wrapper })
    await act(async () => {
      await create.result.current.run({ name: 'a', principalId: 'p' })
    })
    expect(api.createEnvironmentCache).toHaveBeenCalledWith('env-1', {
      name: 'a',
      principalId: 'p',
    })
    const update = renderHook(() => useUpdateCache('org-1', 'env-1'), { wrapper })
    await act(async () => {
      await update.result.current.run({ cacheId: 'c-1', body: { maxMemoryMb: 32 } })
    })
    expect(api.updateEnvironmentCache).toHaveBeenCalledWith('env-1', 'c-1', { maxMemoryMb: 32 })
    const remove = renderHook(() => useDeleteCache('org-1', 'env-1'), { wrapper })
    await act(async () => {
      await remove.result.current.run({ cacheId: 'c-1', deleteData: false })
    })
    expect(api.deleteEnvironmentCache).toHaveBeenCalledWith('env-1', 'c-1', { deleteData: false })
    const invalidated = invalidate.mock.calls.map(([filters]) => filters?.queryKey)
    expect(invalidated).toContainEqual(keys.environments.caches('env-1'))
    expect(invalidated).toContainEqual(keys.principals)
    expect(invalidated).toHaveLength(6)
  })
})
