import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createBinding,
  deleteBinding,
  fetchBindings,
  updateBinding,
  type BindingListFilter,
} from '@/lib/instance-api'
import { useApiMutation } from '@/lib/query-client'
import { queryKeys } from '@/lib/query-keys'

function invalidateBindingsAndServiceVariables(
  queryClient: ReturnType<typeof useQueryClient>,
  orgId: string,
  filter: BindingListFilter,
  serviceId?: string,
) {
  const jobs: Promise<unknown>[] = [
    queryClient.invalidateQueries({
      queryKey: queryKeys.org(orgId).bindings.list(filter),
    }),
    queryClient.invalidateQueries({
      queryKey: queryKeys.org(orgId).bindings.all,
    }),
  ]
  if (serviceId) {
    jobs.push(
      queryClient.invalidateQueries({
        queryKey: queryKeys.org(orgId).variables.list({ serviceId }),
      }),
    )
  }
  return Promise.all(jobs)
}

function invalidateScopedBindingLists(
  queryClient: ReturnType<typeof useQueryClient>,
  orgId: string,
  scopes: Readonly<{
    environmentId?: string
    managedEnvironmentId?: string
  }>,
) {
  const jobs: Promise<unknown>[] = []
  if (scopes.environmentId) {
    jobs.push(
      queryClient.invalidateQueries({
        queryKey: queryKeys.org(orgId).bindings.list({
          environmentId: scopes.environmentId,
        }),
      }),
    )
  }
  if (scopes.managedEnvironmentId) {
    jobs.push(
      queryClient.invalidateQueries({
        queryKey: queryKeys.org(orgId).bindings.list({
          managedEnvironmentId: scopes.managedEnvironmentId,
        }),
      }),
    )
  }
  return jobs.length > 0 ? Promise.all(jobs) : Promise.resolve()
}

/** Service-scoped bindings — no polling. */
export function useServiceBindings(
  orgId: string,
  serviceId: string,
  options?: Readonly<{ enabled?: boolean }>,
) {
  return useQuery({
    queryKey: queryKeys.org(orgId).bindings.list({ serviceId }),
    queryFn: () => fetchBindings({ serviceId }),
    enabled:
      (options?.enabled ?? true) &&
      orgId.length > 0 &&
      serviceId.length > 0,
  })
}

/**
 * Consuming-service environment list — bindings whose compose service lives in
 * this environment. Managed Connect tabs should use
 * {@link useManagedEnvironmentBindings} instead.
 */
export function useEnvironmentBindings(
  orgId: string,
  environmentId: string,
  options?: Readonly<{ enabled?: boolean }>,
) {
  return useQuery({
    queryKey: queryKeys.org(orgId).bindings.list({ environmentId }),
    queryFn: () => fetchBindings({ environmentId }),
    enabled:
      (options?.enabled ?? true) &&
      orgId.length > 0 &&
      environmentId.length > 0,
  })
}

/**
 * Managed-cluster bindings — principal belongs to the managed environment.
 * Used by database Connect / Users panels.
 */
export function useManagedEnvironmentBindings(
  orgId: string,
  managedEnvironmentId: string,
  options?: Readonly<{ enabled?: boolean }>,
) {
  return useQuery({
    queryKey: queryKeys.org(orgId).bindings.list({ managedEnvironmentId }),
    queryFn: () => fetchBindings({ managedEnvironmentId }),
    enabled:
      (options?.enabled ?? true) &&
      orgId.length > 0 &&
      managedEnvironmentId.length > 0,
  })
}

export type CreateBindingVariables = Parameters<typeof createBinding>[0] & {
  /** UI-only — invalidates the managed-cluster binding list after create. */
  managedEnvironmentId?: string
}

export function useCreateBinding(orgId: string) {
  const queryClient = useQueryClient()
  return useApiMutation({
    mutationFn: (body: CreateBindingVariables) => {
      const { managedEnvironmentId: _managedEnvironmentId, ...apiBody } = body
      return createBinding(apiBody)
    },
    onSuccess: (_result, variables) =>
      Promise.all([
        invalidateBindingsAndServiceVariables(
          queryClient,
          orgId,
          { serviceId: variables.serviceId },
          variables.serviceId,
        ),
        invalidateScopedBindingLists(queryClient, orgId, {
          managedEnvironmentId: variables.managedEnvironmentId,
        }),
      ]),
  })
}

export function useUpdateBinding(orgId: string) {
  const queryClient = useQueryClient()
  return useApiMutation({
    mutationFn: (input: {
      id: string
      body: Parameters<typeof updateBinding>[1]
      serviceId: string
      environmentId?: string
      managedEnvironmentId?: string
    }) => updateBinding(input.id, input.body),
    onSuccess: (_result, variables) =>
      Promise.all([
        invalidateBindingsAndServiceVariables(
          queryClient,
          orgId,
          { serviceId: variables.serviceId },
          variables.serviceId,
        ),
        invalidateScopedBindingLists(queryClient, orgId, {
          environmentId: variables.environmentId,
          managedEnvironmentId: variables.managedEnvironmentId,
        }),
      ]),
  })
}

export function useDeleteBinding(orgId: string) {
  const queryClient = useQueryClient()
  return useApiMutation({
    mutationFn: (input: {
      id: string
      serviceId: string
      environmentId?: string
      managedEnvironmentId?: string
    }) => deleteBinding(input.id),
    onSuccess: (_result, variables) =>
      Promise.all([
        invalidateBindingsAndServiceVariables(
          queryClient,
          orgId,
          { serviceId: variables.serviceId },
          variables.serviceId,
        ),
        invalidateScopedBindingLists(queryClient, orgId, {
          environmentId: variables.environmentId,
          managedEnvironmentId: variables.managedEnvironmentId,
        }),
      ]),
  })
}
