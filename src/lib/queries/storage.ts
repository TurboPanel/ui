import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createStorage,
  deleteStorage,
  fetchStorage,
  updateStorage,
  type CreateStorageBody,
} from '@/lib/instance-api'
import { useApiMutation, queryKeys } from '@/lib/query-client'
import { type StorageParentFilter } from '@/lib/query-keys'

export function useStorage(
  orgId: string,
  filter: StorageParentFilter,
  options?: Readonly<{ enabled?: boolean }>,
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

export type { StorageParentFilter }
