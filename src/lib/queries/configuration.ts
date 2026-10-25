import { useQueryClient, type QueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'
import {
  createVariable,
  deleteVariable,
  fetchEnvironment,
  fetchProject,
  fetchVariables,
  updateEnvironment,
  updateVariable,
} from '@/lib/instance-api'
import { queryKeys, useApiMutation } from '@/lib/query-client'
import type { StagedEdit, VariableOp } from '@/lib/v4/config-edits'
import { saveEdits, type SaveDeps } from '@/lib/v4/config-save'

function variableRunner(op: VariableOp): Promise<unknown> {
  if (op.type === 'create') return createVariable(op.body)
  if (op.type === 'update') return updateVariable(op.id, op.body)
  return deleteVariable(op.id)
}

function saveDeps(projectId: string, environmentId: string): SaveDeps {
  return {
    load: async () => {
      const [fresh, env, projectVariables, environmentVariables] = await Promise.all([
        fetchProject(projectId),
        fetchEnvironment(environmentId),
        fetchVariables({ projectId }),
        fetchVariables({ environmentId }),
      ])
      return {
        projectId,
        environmentId,
        projectCompose: fresh.project.options?.compose ?? null,
        environmentCompose: env.environment.options?.compose ?? null,
        projectVariables: projectVariables.variables,
        environmentVariables: environmentVariables.variables,
      }
    },
    saveEnvironmentCompose: (compose) => updateEnvironment(environmentId, { options: { compose } }),
    runVariable: variableRunner,
  }
}

/** Base variables: the project's own list only; no compose is read or written. */
function baseSaveDeps(projectId: string): SaveDeps {
  return {
    load: async () => {
      const projectVariables = await fetchVariables({ projectId })
      return {
        projectId,
        environmentId: '',
        projectCompose: null,
        environmentCompose: null,
        projectVariables: projectVariables.variables,
        environmentVariables: [],
        base: true,
      }
    },
    saveEnvironmentCompose: () => Promise.reject(new Error('The Base saves variables only.')),
    runVariable: variableRunner,
  }
}

/** Every config view (a Base edit reaches each environment), the project, and the variables lists. */
async function refreshConfiguration(
  queryClient: QueryClient,
  orgId: string,
  projectId: string,
  environmentId: string | null
) {
  const org = queryKeys.org(orgId)
  const environmentKeys =
    environmentId === null
      ? []
      : [
          org.environments.all,
          org.environments.detail(environmentId),
          org.environments.deployPreview(environmentId),
          org.variables.list({ environmentId }),
        ]
  await Promise.all([
    queryClient.invalidateQueries({
      predicate: ({ queryKey }) =>
        queryKey[0] === 'org' &&
        queryKey[1] === orgId &&
        queryKey[2] === 'environment' &&
        queryKey[4] === 'config-view',
    }),
    queryClient.invalidateQueries({ queryKey: org.projects.all }),
    queryClient.invalidateQueries({ queryKey: org.projects.detail(projectId) }),
    queryClient.invalidateQueries({ queryKey: org.variables.list({ projectId }) }),
    ...environmentKeys.map((queryKey) => queryClient.invalidateQueries({ queryKey })),
  ])
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
    mutationFn: (edits: readonly StagedEdit[]) =>
      saveEdits(edits, saveDeps(projectId, environmentId)),
    onSettled: () => refreshConfiguration(queryClient, orgId, projectId, environmentId),
    fallbackError: 'Could not save these changes.',
  })
}

/** Refresh what is built on the project's variables (every config view) after a change saved elsewhere. */
export function useRefreshBaseConfiguration(orgId: string, projectId: string) {
  const queryClient = useQueryClient()
  return useCallback(
    () => refreshConfiguration(queryClient, orgId, projectId, null),
    [queryClient, orgId, projectId]
  )
}

/** Save the staged variable edits of the Base tab: the project's own variables, read fresh first. */
export function useSaveBaseVariables(orgId: string, projectId: string) {
  const queryClient = useQueryClient()
  return useApiMutation({
    mutationFn: (edits: readonly StagedEdit[]) => saveEdits(edits, baseSaveDeps(projectId)),
    onSettled: () => refreshConfiguration(queryClient, orgId, projectId, null),
    fallbackError: 'Could not save these changes.',
  })
}
