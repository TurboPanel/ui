import { useQueryClient } from '@tanstack/react-query'
import {
  createVariable,
  deleteVariable,
  fetchEnvironment,
  fetchProject,
  fetchVariables,
  updateEnvironment,
  updateProject,
  updateVariable,
  type ProjectRecord,
} from '@/lib/instance-api'
import { buildProjectOptionsPatch } from '@/lib/project-options'
import { queryKeys, useApiMutation } from '@/lib/query-client'
import type { StagedEdit, VariableOp } from '@/lib/v4/config-edits'
import { saveEdits, type SaveDeps } from '@/lib/v4/config-save'

function variableRunner(op: VariableOp): Promise<unknown> {
  if (op.type === 'create') return createVariable(op.body)
  if (op.type === 'update') return updateVariable(op.id, op.body)
  return deleteVariable(op.id)
}

function saveDeps(projectId: string, environmentId: string): SaveDeps {
  let project: ProjectRecord | null = null
  return {
    load: async () => {
      const [fresh, env, projectVariables, environmentVariables] = await Promise.all([
        fetchProject(projectId),
        fetchEnvironment(environmentId),
        fetchVariables({ projectId }),
        fetchVariables({ environmentId }),
      ])
      project = fresh.project
      return {
        projectId,
        environmentId,
        projectCompose: fresh.project.options?.compose ?? null,
        environmentCompose: env.environment.options?.compose ?? null,
        projectVariables: projectVariables.variables,
        environmentVariables: environmentVariables.variables,
      }
    },
    saveProjectCompose: (compose) => {
      if (project === null) return Promise.reject(new Error('Project not loaded'))
      const options = buildProjectOptionsPatch(project, { compose })
      return updateProject(projectId, { options })
    },
    saveEnvironmentCompose: (compose) => updateEnvironment(environmentId, { options: { compose } }),
    runVariable: variableRunner,
  }
}

/**
 * Save the staged edits of the Configuration tab. Loads fresh project,
 * environment and variable data first, so a stale cache never overwrites a
 * newer change. Resolves with what is still unsaved; it only throws for a
 * dropped connection. A Base edit changes every environment that follows it, so
 * every environment's config view is refreshed.
 */
export function useSaveConfiguration(orgId: string, projectId: string, environmentId: string) {
  const queryClient = useQueryClient()
  return useApiMutation({
    mutationFn: (edits: readonly StagedEdit[]) => saveEdits(edits, saveDeps(projectId, environmentId)),
    onSettled: async () => {
      const org = queryKeys.org(orgId)
      await Promise.all([
        queryClient.invalidateQueries({
          predicate: ({ queryKey }) =>
            queryKey[0] === 'org' &&
            queryKey[1] === orgId &&
            queryKey[2] === 'environment' &&
            queryKey[4] === 'config-view',
        }),
        queryClient.invalidateQueries({ queryKey: org.environments.all }),
        queryClient.invalidateQueries({ queryKey: org.environments.detail(environmentId) }),
        queryClient.invalidateQueries({ queryKey: org.environments.deployPreview(environmentId) }),
        queryClient.invalidateQueries({ queryKey: org.projects.all }),
        queryClient.invalidateQueries({ queryKey: org.projects.detail(projectId) }),
        queryClient.invalidateQueries({ queryKey: org.variables.list({ projectId }) }),
        queryClient.invalidateQueries({ queryKey: org.variables.list({ environmentId }) }),
      ])
    },
    fallbackError: 'Could not save these changes.',
  })
}
