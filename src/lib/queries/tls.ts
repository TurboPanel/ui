import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import {
  createTlsCertificate,
  deleteTlsCertificate,
  fetchOrganizationCaRotation,
  fetchTlsLibrary,
  retireOrganizationCa,
  rotateOrganizationCa,
} from '@/lib/instance-api'
import { useApiMutation, queryKeys } from '@/lib/query-client'

export function useTlsLibrary(
  orgId: string,
  options?: Readonly<{ enabled?: boolean }>,
) {
  return useQuery({
    queryKey: queryKeys.org(orgId).tls,
    queryFn: fetchTlsLibrary,
    enabled: (options?.enabled ?? true) && orgId.length > 0,
  })
}

export function useCreateTlsCertificate(orgId: string) {
  const queryClient = useQueryClient()
  return useApiMutation({
    mutationFn: createTlsCertificate,
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.org(orgId).tls,
      })
    },
  })
}

export function useDeleteTlsCertificate(orgId: string) {
  const queryClient = useQueryClient()
  return useApiMutation({
    mutationFn: deleteTlsCertificate,
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.org(orgId).tls,
      })
    },
  })
}

export function useOrganizationCaRotation(orgId: string) {
  return useQuery({
    queryKey: queryKeys.org(orgId).tlsCaRotation,
    queryFn: fetchOrganizationCaRotation,
    enabled: orgId.length > 0,
  })
}

function invalidateOrganizationCaQueries(
  queryClient: QueryClient,
  orgId: string,
) {
  return Promise.all([
    queryClient.invalidateQueries({
      queryKey: queryKeys.org(orgId).tlsCa,
    }),
    queryClient.invalidateQueries({
      queryKey: queryKeys.org(orgId).tlsCaRotation,
    }),
  ])
}

export function useRotateOrganizationCa(orgId: string) {
  const queryClient = useQueryClient()
  return useApiMutation({
    mutationFn: rotateOrganizationCa,
    onSuccess: () => invalidateOrganizationCaQueries(queryClient, orgId),
  })
}

export function useRetireOrganizationCa(orgId: string) {
  const queryClient = useQueryClient()
  return useApiMutation({
    mutationFn: retireOrganizationCa,
    onSuccess: () => invalidateOrganizationCaQueries(queryClient, orgId),
  })
}
