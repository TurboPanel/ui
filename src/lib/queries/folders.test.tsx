// @vitest-environment happy-dom
import { QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createAppQueryClient, queryKeys } from '@/lib/query-client'
import {
  useAddEnvironmentShare,
  useCommonVolumesOfEnvironments,
  useDirectoryNamesMode,
  useEnvironmentFolders,
  useEnvironmentShares,
  useRemoveEnvironmentShare,
} from '@/lib/queries/folders'

const api = vi.hoisted(() => ({
  addEnvironmentShare: vi.fn(),
  fetchEnvironmentFolders: vi.fn(),
  fetchEnvironmentShares: vi.fn(),
  fetchOrgDirectoryDefaults: vi.fn(),
  fetchStorage: vi.fn(),
  removeEnvironmentShare: vi.fn(),
}))

vi.mock('@/lib/instance-api', () => api)

function createWrapper(client = createAppQueryClient()) {
  return function Wrapper({ children }: Readonly<{ children: React.ReactNode }>) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
}

afterEach(() => {
  vi.clearAllMocks()
})

describe('folder hooks', () => {
  it('useEnvironmentFolders loads the folders under an environment', async () => {
    api.fetchEnvironmentFolders.mockResolvedValueOnce({ ok: true, total: 1, folders: [{ id: 'f1' }] })
    const { result } = renderHook(() => useEnvironmentFolders('org-1', 'env-1'), {
      wrapper: createWrapper(),
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(api.fetchEnvironmentFolders).toHaveBeenCalledWith('env-1')
    expect(result.current.data?.total).toBe(1)
  })

  it('useEnvironmentFolders and useEnvironmentShares stay idle without an environment', () => {
    renderHook(() => useEnvironmentFolders('org-1', null), { wrapper: createWrapper() })
    renderHook(() => useEnvironmentShares('org-1', undefined), { wrapper: createWrapper() })
    renderHook(() => useEnvironmentShares('org-1', 'env-1', { enabled: false }), {
      wrapper: createWrapper(),
    })
    expect(api.fetchEnvironmentFolders).not.toHaveBeenCalled()
    expect(api.fetchEnvironmentShares).not.toHaveBeenCalled()
  })

  it('useEnvironmentShares loads what an environment uses', async () => {
    api.fetchEnvironmentShares.mockResolvedValueOnce({ ok: true, shares: [{ id: 's1' }] })
    const { result } = renderHook(() => useEnvironmentShares('org-1', 'env-1'), {
      wrapper: createWrapper(),
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.shares).toHaveLength(1)
  })

  it('adding and removing a share reload the share list', async () => {
    api.addEnvironmentShare.mockResolvedValueOnce({ ok: true, id: 's1' })
    api.removeEnvironmentShare.mockResolvedValueOnce({ ok: true })
    const client = createAppQueryClient()
    const invalidate = vi.spyOn(client, 'invalidateQueries')
    const add = renderHook(() => useAddEnvironmentShare('org-1', 'env-1'), {
      wrapper: createWrapper(client),
    })
    await add.result.current.mutateAsync({ storageId: 'st-1' })
    expect(api.addEnvironmentShare).toHaveBeenCalledWith('env-1', { storageId: 'st-1' })
    const remove = renderHook(() => useRemoveEnvironmentShare('org-1', 'env-1'), {
      wrapper: createWrapper(client),
    })
    await remove.result.current.mutateAsync('s1')
    expect(api.removeEnvironmentShare).toHaveBeenCalledWith('env-1', 's1')
    await waitFor(() =>
      expect(invalidate).toHaveBeenCalledWith({
        queryKey: queryKeys.org('org-1').environments.shares('env-1'),
      })
    )
  })

  it('useCommonVolumesOfEnvironments keeps only the volumes shared across environments', async () => {
    api.fetchStorage.mockResolvedValue({
      storage: [
        { id: 'v1', common: true },
        { id: 'v2', common: false },
      ],
    })
    const { result } = renderHook(() => useCommonVolumesOfEnvironments('org-1', ['e1']), {
      wrapper: createWrapper(),
    })
    await waitFor(() => expect(result.current).toHaveLength(1))
    expect(result.current[0]).toMatchObject({ id: 'v1' })
  })

  it('useDirectoryNamesMode reads the setting for managers and defaults to readable names', async () => {
    api.fetchOrgDirectoryDefaults.mockResolvedValueOnce({
      names: 'both',
      effectiveNames: 'both',
      locked: false,
      lockedByFolders: false,
    })
    const manager = renderHook(() => useDirectoryNamesMode('org-1', true), {
      wrapper: createWrapper(),
    })
    await waitFor(() => expect(manager.result.current).toBe('both'))
    const other = renderHook(() => useDirectoryNamesMode('org-1', false), {
      wrapper: createWrapper(),
    })
    expect(other.result.current).toBe('slug')
    expect(api.fetchOrgDirectoryDefaults).toHaveBeenCalledTimes(1)
  })
})
