import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createTlsCertificate,
  deleteTlsCertificate,
  fetchTlsLibrary,
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
