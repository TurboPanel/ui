import { useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createWorkspace,
  deleteWorkspace,
  fetchVisibleWorkspaces,
  fetchWorkspace,
  updateWorkspace,
} from '@/lib/instance-api'
import { useApiMutation, queryKeys } from '@/lib/query-client'
import { findTurbopanelWorkspace } from '@/lib/system-inventory'

export function useWorkspaces(
  orgId: string,
  options?: Readonly<{ enabled?: boolean }>,
) {
  return useQuery({
    queryKey: queryKeys.org(orgId).workspaces.list,
    queryFn: fetchVisibleWorkspaces,
    enabled: (options?.enabled ?? true) && orgId.length > 0,
  })
}

/** Selector over `useWorkspaces` — no extra round trip. */
export function useSystemWorkspace(orgId: string) {
  const query = useWorkspaces(orgId)
  const systemWorkspace = useMemo(
    () => findTurbopanelWorkspace(query.data?.workspaces ?? []),
    [query.data?.workspaces],
  )
  return { ...query, systemWorkspace }
}

export function useWorkspace(
  orgId: string,
  workspaceId: string,
  options?: Readonly<{ enabled?: boolean }>,
) {
  return useQuery({
    queryKey: queryKeys.org(orgId).workspaces.detail(workspaceId),
    queryFn: () => fetchWorkspace(workspaceId),
    enabled:
      (options?.enabled ?? true) &&
      orgId.length > 0 &&
      workspaceId.length > 0,
  })
}

export function useCreateWorkspace(orgId: string) {
  const queryClient = useQueryClient()
  return useApiMutation({
    mutationFn: createWorkspace,
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.org(orgId).workspaces.list,
      })
    },
  })
}

export function useUpdateWorkspace(orgId: string, workspaceId: string) {
  const queryClient = useQueryClient()
  return useApiMutation({
    mutationFn: (body: Parameters<typeof updateWorkspace>[1]) =>
      updateWorkspace(workspaceId, body),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: queryKeys.org(orgId).workspaces.detail(workspaceId),
        }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.org(orgId).workspaces.list,
        }),
      ])
    },
  })
}

export function useDeleteWorkspace(orgId: string) {
  const queryClient = useQueryClient()
  return useApiMutation({
    mutationFn: deleteWorkspace,
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.org(orgId).workspaces.all,
      })
    },
  })
}
