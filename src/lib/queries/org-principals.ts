import { useQuery, useQueryClient } from '@tanstack/react-query'
import { deleteOrgPrincipal, fetchOrgPrincipals } from '@/lib/instance-api'
import { useApiMutation } from '@/lib/query-client'
import { queryKeys } from '@/lib/query-keys'

/** Every principal in the organization, for Manage organization > Principals. */
export function useOrgPrincipals(orgId: string, options?: Readonly<{ enabled?: boolean }>) {
  return useQuery({
    queryKey: queryKeys.org(orgId).principals,
    queryFn: () => fetchOrgPrincipals(orgId),
    enabled: (options?.enabled ?? true) && orgId.length > 0,
  })
}

/** Delete a principal its project left behind; the lists reload afterwards. */
export function useDeleteOrgPrincipal(orgId: string) {
  const queryClient = useQueryClient()
  return useApiMutation({
    mutationFn: (principalId: string) => deleteOrgPrincipal(orgId, principalId),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.org(orgId).principals }),
        // A removed principal leaves every server's list too.
        queryClient.invalidateQueries({ queryKey: ['org', orgId, 'server'] }),
      ])
    },
  })
}
