import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createEnvironment,
  deleteEnvironment,
  deployEnvironment,
  fetchDeployPreview,
  fetchEnvironment,
  fetchVisibleEnvironments,
  isServerPlacementRequiredError,
  runEnvironmentLifecycle,
  stopEnvironment,
  updateEnvironment,
  type EnvironmentLifecycleAction,
} from '@/lib/instance-api'
import { useApiMutation, queryKeys } from '@/lib/query-client'

export function useEnvironments(
  orgId: string,
  projectId?: string,
  options?: Readonly<{ enabled?: boolean }>,
) {
  return useQuery({
    queryKey: queryKeys.org(orgId).environments.list(projectId),
    queryFn: () => fetchVisibleEnvironments(projectId),
    enabled: (options?.enabled ?? true) && orgId.length > 0,
  })
}

export function useEnvironment(
  orgId: string,
  environmentId: string,
  options?: Readonly<{ enabled?: boolean }>,
) {
  return useQuery({
    queryKey: queryKeys.org(orgId).environments.detail(environmentId),
    queryFn: () => fetchEnvironment(environmentId),
    enabled:
      (options?.enabled ?? true) &&
      orgId.length > 0 &&
      environmentId.length > 0,
  })
}

export function useDeployPreview(
  orgId: string,
  environmentId: string,
  options?: Readonly<{ enabled?: boolean }>,
) {
  return useQuery({
    queryKey: queryKeys.org(orgId).environments.deployPreview(environmentId),
    queryFn: () => fetchDeployPreview(environmentId),
    enabled:
      (options?.enabled ?? true) &&
      orgId.length > 0 &&
      environmentId.length > 0,
    refetchInterval: false,
    retry: (failureCount, error) => {
      if (isServerPlacementRequiredError(error)) return false
      return failureCount < 2
    },
  })
}

async function invalidateEnvironmentSubtree(
  queryClient: ReturnType<typeof useQueryClient>,
  orgId: string,
  environmentId?: string,
) {
  const tasks = [
    queryClient.invalidateQueries({
      queryKey: queryKeys.org(orgId).environments.all,
    }),
    queryClient.invalidateQueries({
      queryKey: queryKeys.org(orgId).containers.all,
    }),
  ]
  if (environmentId) {
    tasks.push(
      queryClient.invalidateQueries({
        queryKey: queryKeys.org(orgId).environments.detail(environmentId),
      }),
      queryClient.invalidateQueries({
        queryKey: queryKeys.org(orgId).environments.deployPreview(environmentId),
      }),
    )
  }
  await Promise.all(tasks)
}

export function useCreateEnvironment(orgId: string) {
  const queryClient = useQueryClient()
  return useApiMutation({
    mutationFn: createEnvironment,
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.org(orgId).environments.all,
      })
    },
  })
}

export function useUpdateEnvironment(orgId: string, environmentId: string) {
  const queryClient = useQueryClient()
  return useApiMutation({
    mutationFn: (body: Parameters<typeof updateEnvironment>[1]) =>
      updateEnvironment(environmentId, body),
    onSuccess: async () => {
      await invalidateEnvironmentSubtree(queryClient, orgId, environmentId)
    },
  })
}

export function useDeleteEnvironment(orgId: string) {
  const queryClient = useQueryClient()
  return useApiMutation({
    mutationFn: deleteEnvironment,
    onSuccess: async () => {
      await invalidateEnvironmentSubtree(queryClient, orgId)
    },
  })
}

export function useDeployEnvironment(orgId: string, environmentId: string) {
  const queryClient = useQueryClient()
  return useApiMutation({
    mutationFn: (body?: {
      acknowledgeHealthCheckWarnings?: boolean
      noCache?: boolean
    }) => deployEnvironment(environmentId, body),
    onSuccess: async () => {
      await invalidateEnvironmentSubtree(queryClient, orgId, environmentId)
      await queryClient.invalidateQueries({
        queryKey: queryKeys.org(orgId).commands.all,
      })
    },
  })
}

export function useStopEnvironment(orgId: string, environmentId: string) {
  const queryClient = useQueryClient()
  return useApiMutation({
    mutationFn: () => stopEnvironment(environmentId),
    onSuccess: async () => {
      await invalidateEnvironmentSubtree(queryClient, orgId, environmentId)
      await queryClient.invalidateQueries({
        queryKey: queryKeys.org(orgId).commands.all,
      })
    },
  })
}

/** Stop any environment by id (e.g. project delete wizard). */
export function useStopEnvironmentMutation(orgId: string) {
  const queryClient = useQueryClient()
  return useApiMutation({
    mutationFn: stopEnvironment,
    onSuccess: async (_data, environmentId) => {
      await invalidateEnvironmentSubtree(queryClient, orgId, environmentId)
      await queryClient.invalidateQueries({
        queryKey: queryKeys.org(orgId).commands.all,
      })
    },
  })
}

export function useRunEnvironmentLifecycle(
  orgId: string,
  environmentId: string,
) {
  const queryClient = useQueryClient()
  return useApiMutation({
    mutationFn: (action: EnvironmentLifecycleAction) =>
      runEnvironmentLifecycle(environmentId, action),
    onSuccess: async () => {
      await invalidateEnvironmentSubtree(queryClient, orgId, environmentId)
      await queryClient.invalidateQueries({
        queryKey: queryKeys.org(orgId).commands.all,
      })
    },
  })
}

export type { EnvironmentLifecycleAction }
