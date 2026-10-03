// @vitest-environment happy-dom
import { QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createAppQueryClient, queryKeys } from '@/lib/query-client'
import { useStorageCopyBackupActions, useStorageCopyBackups } from '@/lib/queries/storage'

const api = vi.hoisted(() => ({
  fetchStorageCopyBackups: vi.fn(),
  createStorageCopyBackup: vi.fn(),
  deleteStorageCopyBackup: vi.fn(),
  restoreStorageCopyBackup: vi.fn(),
}))

vi.mock('@/lib/instance-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/instance-api')>()),
  ...api,
}))

const queued = { ok: true, backupId: 'bk_1', commandId: 'cmd', serverId: 'srv' }

function setup() {
  const client = createAppQueryClient()
  const spy = vi.spyOn(client, 'invalidateQueries')
  const wrapper = ({ children }: Readonly<{ children: React.ReactNode }>) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  return { spy, wrapper }
}

afterEach(() => vi.clearAllMocks())

describe('storage copy backup queries', () => {
  it('loads the archives of a copy', async () => {
    api.fetchStorageCopyBackups.mockResolvedValueOnce({ backups: [] })
    const { wrapper } = setup()
    const { result } = renderHook(() => useStorageCopyBackups('org-1', 's1', 'c1'), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(api.fetchStorageCopyBackups).toHaveBeenCalledWith('s1', 'c1')
  })

  it('back up, delete and restore each call the API and refresh the list and commands', async () => {
    api.createStorageCopyBackup.mockResolvedValue(queued)
    api.deleteStorageCopyBackup.mockResolvedValue(queued)
    api.restoreStorageCopyBackup.mockResolvedValue(queued)
    const { spy, wrapper } = setup()
    const { result } = renderHook(() => useStorageCopyBackupActions('org-1', 's1', 'c1'), {
      wrapper,
    })

    await act(async () => {
      await result.current.backUp.run()
      await result.current.remove.run('bk_1')
      await result.current.restore.run('bk_1')
    })

    expect(api.createStorageCopyBackup).toHaveBeenCalledWith('s1', 'c1')
    expect(api.deleteStorageCopyBackup).toHaveBeenCalledWith('s1', 'c1', 'bk_1')
    expect(api.restoreStorageCopyBackup).toHaveBeenCalledWith('s1', 'c1', 'bk_1')
    expect(spy).toHaveBeenCalledWith({ queryKey: queryKeys.org('org-1').storage.copyBackups('c1') })
    expect(spy).toHaveBeenCalledWith({ queryKey: queryKeys.org('org-1').commands.all })
  })
})
