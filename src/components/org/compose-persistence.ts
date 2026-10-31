import { useQueryClient } from '@tanstack/react-query'
import {
  updateEnvironment,
  updateProject,
  type ComposeDocument,
  type ProjectRecord,
} from '@/lib/instance-api'
import type { AccountWrite } from '@/lib/compose/principal-required'
import { buildProjectOptionsPatch, mergeProjectOptionsLocal } from '@/lib/project-options'
import { useApiMutation, queryKeys } from '@/lib/query-client'

export function usePersistProjectCompose(orgId: string, projectId: string) {
  const queryClient = useQueryClient()
  return useApiMutation({
    mutationFn: async (compose: ComposeDocument) => {
      const cached = queryClient.getQueryData<{ project: ProjectRecord }>(
        queryKeys.org(orgId).projects.detail(projectId)
      )
      const project = cached?.project
      if (!project) {
        throw new Error('Project not loaded')
      }
      const options = buildProjectOptionsPatch(project, { compose })
      // Saved from the Base screens, so it always names the Base.
      await updateProject(projectId, { options, target: 'base' })
      return {
        project: {
          ...project,
          options: mergeProjectOptionsLocal(project.options, options),
        },
      }
    },
    onSuccess: async (data) => {
      queryClient.setQueryData(queryKeys.org(orgId).projects.detail(projectId), {
        project: data.project,
      })
      await queryClient.invalidateQueries({
        queryKey: queryKeys.org(orgId).projects.all,
      })
    },
    fallbackError: 'Failed to save compose',
  })
}

export function usePersistEnvironmentCompose(orgId: string, environmentId: string) {
  const queryClient = useQueryClient()
  return useApiMutation({
    mutationFn: async (compose: ComposeDocument) => {
      await updateEnvironment(environmentId, { options: { compose } })
      return compose
    },
    onSuccess: async (compose) => {
      queryClient.setQueryData(
        queryKeys.org(orgId).environments.detail(environmentId),
        (current: { environment: { options?: { compose?: ComposeDocument } } } | undefined) =>
          current
            ? {
                environment: {
                  ...current.environment,
                  options: { ...current.environment.options, compose },
                },
              }
            : current
      )
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: queryKeys.org(orgId).environments.all,
        }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.org(orgId).services.all,
        }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.org(orgId).containers.all,
        }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.org(orgId).environments.deployPreview(environmentId),
        }),
      ])
    },
    fallbackError: 'Failed to save compose overlay',
  })
}

/**
 * Save the compose documents an account change touched: the Base and/or the
 * environments whose app was waiting for an account. One mutation so the
 * screen refreshes once, after every document is saved.
 */
export function usePersistAccountWrites(orgId: string, projectId: string) {
  const queryClient = useQueryClient()
  return useApiMutation({
    mutationFn: async (writes: readonly AccountWrite[]) => {
      await Promise.all(
        writes.map((write) => {
          if (write.target.kind === 'base') {
            const cached = queryClient.getQueryData<{ project: ProjectRecord }>(
              queryKeys.org(orgId).projects.detail(projectId)
            )
            if (!cached?.project) throw new Error('Project not loaded')
            const options = buildProjectOptionsPatch(cached.project, { compose: write.document })
            return updateProject(projectId, { options, target: 'base' })
          }
          return updateEnvironment(write.target.environmentId, {
            options: { compose: write.document },
          })
        })
      )
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.org(orgId).projects.all }),
        // The Hosting Account list and the Base screen read these two, and
        // neither sits under the `projects` or `environments` prefixes.
        queryClient.invalidateQueries({
          queryKey: queryKeys.org(orgId).projects.principals(projectId),
        }),
        queryClient.invalidateQueries({
          predicate: ({ queryKey }) =>
            queryKey[0] === 'org' &&
            queryKey[1] === orgId &&
            queryKey[2] === 'environment' &&
            queryKey[4] === 'config-view',
        }),
        queryClient.invalidateQueries({ queryKey: queryKeys.org(orgId).environments.all }),
        queryClient.invalidateQueries({ queryKey: queryKeys.org(orgId).services.all }),
      ])
    },
    fallbackError: 'Failed to save the account',
  })
}
