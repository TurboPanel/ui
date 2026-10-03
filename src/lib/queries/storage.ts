import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createStorage,
  createStorageCopyBackup,
  deleteStorage,
  deleteStorageCopyBackup,
  fetchStorage,
  fetchStorageCopyBackups,
  restoreStorageCopyBackup,
  updateStorage,
  updateStorageMount,
  type CreateStorageBody,
} from '@/lib/instance-api'
import { useApiMutation, queryKeys } from '@/lib/query-client'
import { type StorageParentFilter } from '@/lib/query-keys'

export function useStorage(
  orgId: string,
  filter: StorageParentFilter,
  options?: Readonly<{ enabled?: boolean }>
) {
  return useQuery({
    queryKey: queryKeys.org(orgId).storage.list(filter),
    queryFn: () => fetchStorage(filter),
    enabled: (options?.enabled ?? true) && orgId.length > 0,
  })
}

export function useCreateStorage(orgId: string, filter: StorageParentFilter) {
  const queryClient = useQueryClient()
  return useApiMutation({
    mutationFn: (body: CreateStorageBody) => createStorage(body),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.org(orgId).storage.list(filter),
      })
    },
  })
}

export function useUpdateStorage(orgId: string, filter: StorageParentFilter) {
  const queryClient = useQueryClient()
  return useApiMutation({
    mutationFn: ({
      storageId,
      body,
    }: {
      storageId: string
      body: Parameters<typeof updateStorage>[1]
    }) => updateStorage(storageId, body),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.org(orgId).storage.list(filter),
      })
    },
  })
}

export function useDeleteStorage(orgId: string, filter: StorageParentFilter) {
  const queryClient = useQueryClient()
  return useApiMutation({
    mutationFn: deleteStorage,
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.org(orgId).storage.list(filter),
      })
    },
  })
}

export function useUpdateStorageMount(orgId: string, filter: StorageParentFilter) {
  const queryClient = useQueryClient()
  return useApiMutation({
    mutationFn: ({
      storageId,
      mountId,
      body,
    }: {
      storageId: string
      mountId: string
      body: Parameters<typeof updateStorageMount>[2]
    }) => updateStorageMount(storageId, mountId, body),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.org(orgId).storage.list(filter),
      })
    },
  })
}

export type { StorageParentFilter }

export function useStorageCopyBackups(
  orgId: string,
  storageId: string,
  copyId: string,
  options?: Readonly<{ enabled?: boolean }>
) {
  return useQuery({
    queryKey: queryKeys.org(orgId).storage.copyBackups(copyId),
    queryFn: () => fetchStorageCopyBackups(storageId, copyId),
    enabled: (options?.enabled ?? true) && orgId.length > 0,
  })
}

/** Back up, delete or restore a copy's archive; each queues a host command. */
export function useStorageCopyBackupActions(orgId: string, storageId: string, copyId: string) {
  const queryClient = useQueryClient()
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.org(orgId).storage.copyBackups(copyId) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.org(orgId).commands.all }),
    ])
  const backUp = useApiMutation({
    mutationFn: () => createStorageCopyBackup(storageId, copyId),
    onSuccess: refresh,
  })
  const remove = useApiMutation({
    mutationFn: (backupId: string) => deleteStorageCopyBackup(storageId, copyId, backupId),
    onSuccess: refresh,
  })
  const restore = useApiMutation({
    mutationFn: (backupId: string) => restoreStorageCopyBackup(storageId, copyId, backupId),
    onSuccess: refresh,
  })
  return { backUp, remove, restore }
}
