import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createEnvironment,
  deleteEnvironment,
  fetchEnvironmentDeletePreview,
  deployEnvironment,
  fetchDeployPreview,
  fetchEnvironment,
  fetchEnvironmentConfigView,
  fetchVisibleEnvironments,
  isServerPlacementRequiredError,
  makeEnvironmentPrimary,
  runEnvironmentLifecycle,
  stopEnvironment,
  cancelDeployment,
  updateEnvironment,
  type EnvironmentLifecycleAction,
} from '@/lib/instance-api'
import { useApiMutation, queryKeys } from '@/lib/query-client'

export function useEnvironments(
  orgId: string,
  projectId?: string,
  options?: Readonly<{ enabled?: boolean }>
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
  options?: Readonly<{ enabled?: boolean }>
) {
  return useQuery({
    queryKey: queryKeys.org(orgId).environments.detail(environmentId),
    queryFn: () => fetchEnvironment(environmentId),
    enabled: (options?.enabled ?? true) && orgId.length > 0 && environmentId.length > 0,
  })
}

/** What the environment runs and what it changes from the Base (read-only, derived on the server). */
export function useEnvironmentConfigView(
  orgId: string,
  environmentId: string,
  options?: Readonly<{ enabled?: boolean }>
) {
  return useQuery({
    queryKey: queryKeys.org(orgId).environments.configView(environmentId),
    queryFn: () => fetchEnvironmentConfigView(environmentId),
    enabled: (options?.enabled ?? true) && orgId.length > 0 && environmentId.length > 0,
  })
}

export function useDeployPreview(
  orgId: string,
  environmentId: string,
  options?: Readonly<{ enabled?: boolean }>
) {
  return useQuery({
    queryKey: queryKeys.org(orgId).environments.deployPreview(environmentId),
    queryFn: () => fetchDeployPreview(environmentId),
    enabled: (options?.enabled ?? true) && orgId.length > 0 && environmentId.length > 0,
    refetchInterval: false,
    staleTime: 0,
    retry: (failureCount, error) => {
      if (isServerPlacementRequiredError(error)) return false
      return failureCount < 2
    },
  })
}

async function invalidateEnvironmentSubtree(
  queryClient: ReturnType<typeof useQueryClient>,
  orgId: string,
  environmentId?: string
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
      // Deploy history polls only while its newest deploy runs, so a new
      // attempt shows up (and starts that poll) because the enqueueing
      // mutation invalidates this key.
      queryClient.invalidateQueries({
        queryKey: queryKeys.org(orgId).environments.deployments(environmentId),
      })
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

/** Make an environment the project's primary one (the landing, the status, the copy source). */
export function useMakeEnvironmentPrimary(orgId: string) {
  const queryClient = useQueryClient()
  return useApiMutation({
    mutationFn: (environmentId: string) => makeEnvironmentPrimary(environmentId),
    onSuccess: async (_data, environmentId) => {
      await invalidateEnvironmentSubtree(queryClient, orgId, environmentId)
    },
  })
}

/** What deleting the environment removes and keeps; read fresh each time it is asked for. */
export function useEnvironmentDeletePreview(
  orgId: string,
  environmentId: string,
  options?: Readonly<{ enabled?: boolean }>
) {
  return useQuery({
    queryKey: queryKeys.org(orgId).environments.deletePreview(environmentId),
    queryFn: () => fetchEnvironmentDeletePreview(environmentId),
    enabled: (options?.enabled ?? true) && orgId.length > 0 && environmentId.length > 0,
    staleTime: 0,
  })
}

export function useDeleteEnvironment(orgId: string) {
  const queryClient = useQueryClient()
  return useApiMutation({
    mutationFn: (input: string | { id: string; confirmName?: string }) => {
      if (typeof input === 'string') return deleteEnvironment(input)
      const { id, confirmName } = input
      return confirmName === undefined
        ? deleteEnvironment(id)
        : deleteEnvironment(id, { confirmName })
    },
    onSuccess: async () => {
      await invalidateEnvironmentSubtree(queryClient, orgId)
    },
  })
}

export function useDeployEnvironment(orgId: string, environmentId: string) {
  const queryClient = useQueryClient()
  return useApiMutation({
    mutationFn: (body?: { acknowledgeHealthCheckWarnings?: boolean; noCache?: boolean }) =>
      deployEnvironment(environmentId, body),
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

/** Cancel a running or queued deploy; refreshes history and environment status. */
export function useCancelDeployment(orgId: string, environmentId: string) {
  const queryClient = useQueryClient()
  return useApiMutation({
    mutationFn: (deploymentId: string) => cancelDeployment(environmentId, deploymentId),
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

export function useRunEnvironmentLifecycle(orgId: string, environmentId: string) {
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
