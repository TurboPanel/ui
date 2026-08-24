import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  configureProject,
  createProject,
  createProjectPrincipal,
  deleteProject,
  deleteProjectPrincipal,
  fetchProject,
  fetchProjectCatalog,
  fetchProjectPrincipals,
  fetchVisibleProjects,
  updateProject,
  updateProjectPrincipal,
  updateProjectPrincipalAssignments,
  type ConfigureProjectBody,
} from '@/lib/instance-api'
import { useApiMutation, queryKeys } from '@/lib/query-client'

export type { CreateProjectBody } from '@/lib/instance-api'
export type { ConfigureProjectBody }

export function useProjects(
  orgId: string,
  workspaceId?: string,
  options?: Readonly<{ enabled?: boolean }>,
) {
  return useQuery({
    queryKey: queryKeys.org(orgId).projects.list(workspaceId),
    queryFn: () => fetchVisibleProjects(workspaceId),
    enabled: (options?.enabled ?? true) && orgId.length > 0,
  })
}

export function useProject(
  orgId: string,
  projectId: string,
  options?: Readonly<{ enabled?: boolean }>,
) {
  return useQuery({
    queryKey: queryKeys.org(orgId).projects.detail(projectId),
    queryFn: () => fetchProject(projectId),
    enabled:
      (options?.enabled ?? true) &&
      orgId.length > 0 &&
      projectId.length > 0,
  })
}

export function useProjectCatalog(
  orgId: string,
  options?: Readonly<{ enabled?: boolean }>,
) {
  return useQuery({
    queryKey: queryKeys.org(orgId).projects.catalog,
    queryFn: fetchProjectCatalog,
    enabled: (options?.enabled ?? true) && orgId.length > 0,
  })
}

export function useProjectPrincipals(
  orgId: string,
  projectId: string,
  options?: Readonly<{ enabled?: boolean }>,
) {
  return useQuery({
    queryKey: queryKeys.org(orgId).projects.principals(projectId),
    queryFn: () => fetchProjectPrincipals(projectId),
    enabled:
      (options?.enabled ?? true) &&
      orgId.length > 0 &&
      projectId.length > 0,
  })
}

export function useCreateProject(orgId: string) {
  const queryClient = useQueryClient()
  return useApiMutation({
    mutationFn: createProject,
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.org(orgId).projects.all,
      })
    },
  })
}

export function useConfigureProject(orgId: string, projectId: string) {
  const queryClient = useQueryClient()
  return useApiMutation({
    mutationFn: (body: ConfigureProjectBody) =>
      configureProject(projectId, body),
    onSuccess: async () => {
      const { project } = await fetchProject(projectId)
      queryClient.setQueryData(
        queryKeys.org(orgId).projects.detail(projectId),
        { project },
      )
      await queryClient.invalidateQueries({
        queryKey: queryKeys.org(orgId).projects.all,
      })
    },
  })
}

export function useUpdateProject(orgId: string, projectId: string) {
  const queryClient = useQueryClient()
  return useApiMutation({
    mutationFn: (body: Parameters<typeof updateProject>[1]) =>
      updateProject(projectId, body),
    onSuccess: async () => {
      const { project } = await fetchProject(projectId)
      queryClient.setQueryData(
        queryKeys.org(orgId).projects.detail(projectId),
        { project },
      )
      await queryClient.invalidateQueries({
        queryKey: queryKeys.org(orgId).projects.all,
      })
    },
  })
}

export function useDeleteProject(orgId: string) {
  const queryClient = useQueryClient()
  return useApiMutation({
    mutationFn: deleteProject,
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.org(orgId).projects.all,
      })
      await queryClient.invalidateQueries({
        queryKey: queryKeys.org(orgId).environments.all,
      })
    },
  })
}

export function useCreateProjectPrincipal(orgId: string, projectId: string) {
  const queryClient = useQueryClient()
  return useApiMutation({
    mutationFn: (body: Parameters<typeof createProjectPrincipal>[1]) =>
      createProjectPrincipal(projectId, body),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.org(orgId).projects.principals(projectId),
      })
    },
  })
}

/**
 * Patch a principal's stewards and/or its runtime entitlements.
 *
 * Both fields are optional and forwarded only when present: the API reads
 * absent as "leave them alone" and `[]` as "revoke everything", so a
 * steward-only edit must not carry an empty entitlement list.
 */
export function useUpdateProjectPrincipal(orgId: string, projectId: string) {
  const queryClient = useQueryClient()
  return useApiMutation({
    mutationFn: ({
      principalId,
      ...patch
    }: {
      principalId: string
      serviceIds?: string[]
      entitlements?: { runtime: string; series: string }[]
    }) => updateProjectPrincipal(projectId, principalId, patch),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.org(orgId).projects.principals(projectId),
      })
    },
  })
}

export function useUpdateProjectPrincipalAssignments(
  orgId: string,
  projectId: string,
) {
  const queryClient = useQueryClient()
  return useApiMutation({
    mutationFn: ({
      principalId,
      serviceIds,
    }: {
      principalId: string
      serviceIds: string[]
    }) => updateProjectPrincipalAssignments(projectId, principalId, serviceIds),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.org(orgId).projects.principals(projectId),
      })
    },
  })
}

export function useDeleteProjectPrincipal(orgId: string, projectId: string) {
  const queryClient = useQueryClient()
  return useApiMutation({
    mutationFn: (principalId: string) =>
      deleteProjectPrincipal(projectId, principalId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.org(orgId).projects.principals(projectId),
      })
    },
  })
}
