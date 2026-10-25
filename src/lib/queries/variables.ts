import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createVariable,
  deleteVariable,
  fetchVariables,
  updateVariable,
  type CreateVariableBody,
  type VariableParentFilter,
} from '@/lib/instance-api'
import { useApiMutation, queryKeys } from '@/lib/query-client'

export function useVariables(
  orgId: string,
  filter: VariableParentFilter,
  options?: Readonly<{ enabled?: boolean }>,
) {
  return useQuery({
    queryKey: queryKeys.org(orgId).variables.list(filter),
    queryFn: () => fetchVariables(filter),
    enabled: (options?.enabled ?? true) && orgId.length > 0,
  })
}

/** Runs after a saved change has refreshed the list, e.g. to refresh the views built on it. */
type OnVariablesChanged = () => Promise<unknown> | void

export function useCreateVariable(
  orgId: string,
  filter: VariableParentFilter,
  onChanged?: OnVariablesChanged
) {
  const queryClient = useQueryClient()
  return useApiMutation({
    mutationFn: (body: Omit<CreateVariableBody, keyof VariableParentFilter>) =>
      createVariable({ ...filter, ...body }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.org(orgId).variables.list(filter),
      })
      await onChanged?.()
    },
  })
}

export function useUpdateVariable(
  orgId: string,
  filter: VariableParentFilter,
  onChanged?: OnVariablesChanged
) {
  const queryClient = useQueryClient()
  return useApiMutation({
    mutationFn: ({
      variableId,
      body,
    }: {
      variableId: string
      body: Parameters<typeof updateVariable>[1]
    }) => updateVariable(variableId, body),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.org(orgId).variables.list(filter),
      })
      await onChanged?.()
    },
  })
}

export function useDeleteVariable(
  orgId: string,
  filter: VariableParentFilter,
  onChanged?: OnVariablesChanged
) {
  const queryClient = useQueryClient()
  return useApiMutation({
    mutationFn: deleteVariable,
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.org(orgId).variables.list(filter),
      })
      await onChanged?.()
    },
  })
}

export type { VariableParentFilter }
