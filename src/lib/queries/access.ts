import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createAccessGrant,
  fetchAccessGrants,
  fetchOrganizations,
  fetchPermissions,
  fetchVisibleTeams,
  resolveResourceId,
  revokeAccessGrant,
  type AccessScopeKind,
  type CreateAccessBody,
} from '@/lib/instance-api'
import { useApiMutation, queryKeys } from '@/lib/query-client'

export function usePermissions(options?: Readonly<{ enabled?: boolean }>) {
  return useQuery({
    queryKey: queryKeys.auth.permissions,
    queryFn: fetchPermissions,
    enabled: options?.enabled ?? true,
  })
}

export function useAccessGrants(
  resourceId: string,
  options?: Readonly<{ enabled?: boolean }>,
) {
  return useQuery({
    queryKey: queryKeys.auth.accessGrants(resourceId),
    queryFn: () => fetchAccessGrants(resourceId),
    enabled: (options?.enabled ?? true) && resourceId.length > 0,
  })
}

export function useOrganizations(options?: Readonly<{ enabled?: boolean }>) {
  return useQuery({
    queryKey: queryKeys.auth.organizations,
    queryFn: fetchOrganizations,
    enabled: options?.enabled ?? true,
  })
}

export function useTeams(options?: Readonly<{ enabled?: boolean }>) {
  return useQuery({
    queryKey: queryKeys.auth.teams,
    queryFn: fetchVisibleTeams,
    enabled: options?.enabled ?? true,
  })
}

export function useResolveResourceId(
  kind: AccessScopeKind | null,
  itemId: string,
  options?: Readonly<{ enabled?: boolean }>,
) {
  return useQuery({
    queryKey: queryKeys.auth.resourceId(kind ?? '', itemId),
    queryFn: () =>
      resolveResourceId(kind as AccessScopeKind, itemId),
    enabled:
      (options?.enabled ?? true) &&
      kind !== null &&
      itemId.length > 0,
  })
}

export function useCreateAccessGrant(resourceId: string) {
  const queryClient = useQueryClient()
  return useApiMutation({
    mutationFn: (body: Omit<CreateAccessBody, 'resourceId'>) =>
      createAccessGrant({ resourceId, ...body }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.auth.accessGrants(resourceId),
      })
    },
  })
}

export function useRevokeAccessGrant(resourceId: string) {
  const queryClient = useQueryClient()
  return useApiMutation({
    mutationFn: revokeAccessGrant,
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.auth.accessGrants(resourceId),
      })
    },
  })
}
