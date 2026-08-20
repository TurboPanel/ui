// @vitest-environment happy-dom
import { QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createAppQueryClient } from '@/lib/query-client'
import {
  useCreateStorage,
  useDeleteStorage,
  useStorage,
} from '@/lib/queries/storage'

const {
  fetchStorage,
  createStorage,
  deleteStorage,
} = vi.hoisted(() => ({
  fetchStorage: vi.fn(),
  createStorage: vi.fn(),
  deleteStorage: vi.fn(),
}))

vi.mock('@/lib/instance-api', () => ({
  fetchStorage,
  createStorage,
  deleteStorage,
  updateStorage: vi.fn(),
  updateStorageMount: vi.fn(),
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
})
