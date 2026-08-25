// @vitest-environment happy-dom
import { QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createAppQueryClient, queryKeys } from '@/lib/query-client'
import {
  useCreateStorage,
  useDeleteStorage,
  useStorage,
  useUpdateStorage,
  useUpdateStorageMount,
} from '@/lib/queries/storage'

const {
  fetchStorage,
  createStorage,
  deleteStorage,
  updateStorage,
  updateStorageMount,
} = vi.hoisted(() => ({
  fetchStorage: vi.fn(),
  createStorage: vi.fn(),
  deleteStorage: vi.fn(),
  updateStorage: vi.fn(),
  updateStorageMount: vi.fn(),
}))

vi.mock('@/lib/instance-api', () => ({
  fetchStorage,
  createStorage,
  deleteStorage,
  updateStorage,
  updateStorageMount,
}))

function createWrapper(client = createAppQueryClient()) {
  return function Wrapper({ children }: Readonly<{ children: React.ReactNode }>) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
}

afterEach(() => {
  vi.clearAllMocks()
})

describe('storage query hooks', () => {
  const orgId = 'org-1'
  const filter = { projectId: 'proj-1' }

  it('useStorage loads scoped storage rows', async () => {
    fetchStorage.mockResolvedValueOnce({
      storage: [{ id: 'stor-1', name: 'Data' }],
    })

    const { result } = renderHook(() => useStorage(orgId, filter), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })
    expect(fetchStorage).toHaveBeenCalledWith(filter)
  })

  it('useCreateStorage creates storage row', async () => {
    createStorage.mockResolvedValueOnce({ ok: true, id: 'stor-2' })

    const { result } = renderHook(() => useCreateStorage(orgId, filter), {
      wrapper: createWrapper(),
    })

    await expect(
      result.current.run({
        name: 'Uploads',
        kind: 'volume',
        projectId: 'proj-1',
      }),
    ).resolves.toMatchObject({ ok: true })
  })

  it('useDeleteStorage deletes storage row', async () => {
    deleteStorage.mockResolvedValueOnce({ ok: true })

    const { result } = renderHook(() => useDeleteStorage(orgId, filter), {
      wrapper: createWrapper(),
    })

    await expect(result.current.run('stor-1')).resolves.toMatchObject({
      ok: true,
    })
  })

  it('useUpdateStorage updates storage row', async () => {
    updateStorage.mockResolvedValueOnce({ ok: true })
    const client = createAppQueryClient()
    const invalidate = vi.spyOn(client, 'invalidateQueries')

    const { result } = renderHook(() => useUpdateStorage(orgId, filter), {
      wrapper: createWrapper(client),
    })

    await expect(
      result.current.run({
        storageId: 'stor-1',
        body: { name: 'Renamed' },
      }),
    ).resolves.toMatchObject({ ok: true })

    expect(updateStorage).toHaveBeenCalledWith('stor-1', { name: 'Renamed' })
    await waitFor(() => {
      expect(invalidate).toHaveBeenCalledWith({
        queryKey: queryKeys.org(orgId).storage.list(filter),
      })
    })
  })

  it('useUpdateStorageMount updates mount row', async () => {
    updateStorageMount.mockResolvedValueOnce({ ok: true })
    const client = createAppQueryClient()
    const invalidate = vi.spyOn(client, 'invalidateQueries')

    const { result } = renderHook(() => useUpdateStorageMount(orgId, filter), {
      wrapper: createWrapper(client),
    })

    await expect(
      result.current.run({
        storageId: 'stor-1',
        mountId: 'mount-1',
        body: { destinationPath: '/data' },
      }),
    ).resolves.toMatchObject({ ok: true })

    expect(updateStorageMount).toHaveBeenCalledWith('stor-1', 'mount-1', {
      destinationPath: '/data',
    })
    await waitFor(() => {
      expect(invalidate).toHaveBeenCalledWith({
        queryKey: queryKeys.org(orgId).storage.list(filter),
      })
    })
  })
})
