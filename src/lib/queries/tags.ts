import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createTag,
  deleteTag,
  fetchMarkers,
  fetchTag,
  fetchTags,
  requireExclusiveQueryEntry,
  setEntityTags,
  TAGGABLE_PARENT_KEYS,
  updateTag,
  type TaggableParentFilter,
  type TaggableParentKey,
} from '@/lib/instance-api'
import { useApiMutation, queryKeys } from '@/lib/query-client'

function taggableParentEntry(
  filter: TaggableParentFilter,
): [TaggableParentKey, string] {
  const [key, value] = requireExclusiveQueryEntry(
    { ...filter },
    TAGGABLE_PARENT_KEYS,
  )
  return [key, value]
}

export function useTags(
  orgId: string,
  scope?: TaggableParentFilter,
  options?: Readonly<{ enabled?: boolean }>,
) {
  return useQuery({
    queryKey: scope
      ? queryKeys.org(orgId).tags.forEntity(...taggableParentEntry(scope))
      : queryKeys.org(orgId).tags.list,
    queryFn: () => fetchTags(scope),
    enabled: (options?.enabled ?? true) && orgId.length > 0,
  })
}

export function useTag(
  orgId: string,
  tagId: string,
  options?: Readonly<{ enabled?: boolean }>,
) {
  return useQuery({
    queryKey: [...queryKeys.org(orgId).tags.list, tagId],
    queryFn: () => fetchTag(tagId),
    enabled: (options?.enabled ?? true) && orgId.length > 0 && tagId.length > 0,
  })
}

export function useMarkers(
  orgId: string,
  tagId: string,
  options?: Readonly<{ enabled?: boolean }>,
) {
  return useQuery({
    queryKey: queryKeys.org(orgId).tags.markers(tagId),
    queryFn: () => fetchMarkers(tagId),
    enabled: (options?.enabled ?? true) && orgId.length > 0 && tagId.length > 0,
  })
}

export function useCreateTag(orgId: string) {
  const queryClient = useQueryClient()
  return useApiMutation({
    mutationFn: (body: Parameters<typeof createTag>[0]) => createTag(body),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.org(orgId).tags.all,
      })
    },
  })
}

export function useUpdateTag(orgId: string) {
  const queryClient = useQueryClient()
  return useApiMutation({
    mutationFn: ({
      tagId,
      body,
    }: {
      tagId: string
      body: Parameters<typeof updateTag>[1]
    }) => updateTag(tagId, body),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.org(orgId).tags.all,
      })
    },
  })
}

export function useDeleteTag(orgId: string) {
  const queryClient = useQueryClient()
  return useApiMutation({
    mutationFn: deleteTag,
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.org(orgId).tags.all,
      })
    },
  })
}

export function useSetEntityTags(orgId: string, filter: TaggableParentFilter) {
  const queryClient = useQueryClient()
  return useApiMutation({
    mutationFn: (tagIds: string[]) => setEntityTags({ ...filter, tagIds }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.org(orgId).tags.all,
      })
    },
  })
}

export type { TaggableParentFilter }
