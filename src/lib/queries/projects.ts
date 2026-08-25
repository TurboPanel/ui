import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  addPrincipalSshKey,
  configureProject,
  createProject,
  createProjectPrincipal,
  deletePrincipalSshKey,
  deleteProject,
  deleteProjectPrincipal,
  fetchPrincipalSshKeys,
  fetchProject,
  fetchProjectCatalog,
  fetchProjectPrincipals,
  fetchVisibleProjects,
  updateProject,
  updateProjectPrincipal,
  updateProjectPrincipalAssignments,
  type ConfigureProjectBody,
  type PrincipalAccessLevel,
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
 * Patch a principal's stewards, runtime entitlements, and/or SSH access.
 *
 * Every field is optional and forwarded only when present: the API reads
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
      access?: PrincipalAccessLevel
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

/**
 * Keys that may authenticate as one principal.
 *
 * Keyed per principal rather than folded into the principals list: a key list
 * is opened for one account at a time, and refetching every account's keys
 * because one changed would be work nobody asked for.
 */
export function usePrincipalSshKeys(
  orgId: string,
  projectId: string,
  principalId: string,
  enabled = true,
) {
  return useQuery({
    queryKey: queryKeys.org(orgId).projects.principalSshKeys(
      projectId,
      principalId,
    ),
    queryFn: () => fetchPrincipalSshKeys(projectId, principalId),
    enabled: enabled && Boolean(orgId && projectId && principalId),
  })
}

/**
 * Both key mutations invalidate the principals list as well as the key list:
 * the list carries `sshKeyCount`, and an account's *effective* access depends
 * on whether it holds any key at all. Refreshing only the keys would leave the
 * row still reading "No access" after the first key was added.
 */
export function useAddPrincipalSshKey(
  orgId: string,
  projectId: string,
  principalId: string,
) {
  const queryClient = useQueryClient()
  return useApiMutation({
    mutationFn: (body: { name: string; publicKey: string }) =>
      addPrincipalSshKey(projectId, principalId, body),
    onSuccess: async () => {
      await invalidatePrincipalKeys(queryClient, orgId, projectId, principalId)
    },
  })
}

export function useDeletePrincipalSshKey(
  orgId: string,
  projectId: string,
  principalId: string,
) {
  const queryClient = useQueryClient()
  return useApiMutation({
    mutationFn: (keyId: string) =>
      deletePrincipalSshKey(projectId, principalId, keyId),
    onSuccess: async () => {
      await invalidatePrincipalKeys(queryClient, orgId, projectId, principalId)
    },
  })
}

async function invalidatePrincipalKeys(
  queryClient: ReturnType<typeof useQueryClient>,
  orgId: string,
  projectId: string,
  principalId: string,
): Promise<void> {
  await queryClient.invalidateQueries({
    queryKey: queryKeys.org(orgId).projects.principalSshKeys(
      projectId,
      principalId,
    ),
  })
  await queryClient.invalidateQueries({
    queryKey: queryKeys.org(orgId).projects.principals(projectId),
  })
}
