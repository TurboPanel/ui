import { useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  addEnvironmentShare,
  fetchEnvironmentFolders,
  fetchOrgDirectoryDefaults,
  type DirectoryNamesMode,
  fetchEnvironmentShares,
  fetchStorage,
  removeEnvironmentShare,
} from '@/lib/instance-api'
import { useApiMutation, queryKeys } from '@/lib/query-client'

/** Folders under an environment's name; refetched after deletes so a removing row can clear. */
export function useEnvironmentFolders(
  orgId: string,
  environmentId: string | null | undefined,
  options?: Readonly<{ enabled?: boolean }>
) {
  return useQuery({
    queryKey: queryKeys.org(orgId).environments.folders(environmentId ?? ''),
    queryFn: () => fetchEnvironmentFolders(environmentId ?? ''),
    enabled: (options?.enabled ?? true) && orgId.length > 0 && !!environmentId,
  })
}

export function useEnvironmentShares(
  orgId: string,
  environmentId: string | null | undefined,
  options?: Readonly<{ enabled?: boolean }>
) {
  return useQuery({
    queryKey: queryKeys.org(orgId).environments.shares(environmentId ?? ''),
    queryFn: () => fetchEnvironmentShares(environmentId ?? ''),
    enabled: (options?.enabled ?? true) && orgId.length > 0 && !!environmentId,
  })
}

export function useAddEnvironmentShare(orgId: string, environmentId: string) {
  const queryClient = useQueryClient()
  return useApiMutation({
    mutationFn: (body: Parameters<typeof addEnvironmentShare>[1]) =>
      addEnvironmentShare(environmentId, body),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.org(orgId).environments.shares(environmentId),
      })
    },
  })
}

export function useRemoveEnvironmentShare(orgId: string, environmentId: string) {
  const queryClient = useQueryClient()
  return useApiMutation({
    mutationFn: (shareId: string) => removeEnvironmentShare(environmentId, shareId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.org(orgId).environments.shares(environmentId),
      })
    },
  })
}

/** Volumes of the given environments that are shared across environments (the candidates to start using). */
export function useCommonVolumesOfEnvironments(
  orgId: string,
  environmentIds: readonly string[],
  options?: Readonly<{ enabled?: boolean }>
) {
  const enabled = (options?.enabled ?? true) && orgId.length > 0
  const queries = useQueries({
    queries: environmentIds.map((environmentId) => ({
      queryKey: queryKeys.org(orgId).storage.list({ environmentId }),
      queryFn: () => fetchStorage({ environmentId }),
      enabled: enabled && environmentId.length > 0,
    })),
  })
  return queries.flatMap((query) => query.data?.storage ?? []).filter((row) => row.common === true)
}

/** The organization's folder naming; only managers can read it, so others get the default (readable names). */
export function useDirectoryNamesMode(orgId: string, canManage: boolean): DirectoryNamesMode {
  const query = useQuery({
    queryKey: queryKeys.org(orgId).settings.directoryDefaults,
    queryFn: () => fetchOrgDirectoryDefaults(orgId),
    enabled: canManage && orgId.length > 0,
  })
  return query.data?.effectiveNames ?? 'slug'
}
