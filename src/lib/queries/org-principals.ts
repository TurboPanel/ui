import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
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
    onSuccess: () => reloadPrincipalLists(queryClient, orgId),
    // A refused delete (still in use) means the list on screen is stale.
    onError: () => reloadPrincipalLists(queryClient, orgId),
  })
}

/** Server principal lists and removal plans only; not every server query. */
export function isServerPrincipalQuery(orgId: string, queryKey: readonly unknown[]): boolean {
  return (
    queryKey[0] === 'org' &&
    queryKey[1] === orgId &&
    queryKey[2] === 'server' &&
    (queryKey[4] === 'principals' || queryKey[4] === 'principal-removal-plan')
  )
}

async function reloadPrincipalLists(queryClient: QueryClient, orgId: string): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.org(orgId).principals }),
    queryClient.invalidateQueries({
      predicate: (query) => isServerPrincipalQuery(orgId, query.queryKey),
    }),
  ])
}

/** Servers the retire could not be queued for; the delete itself went through. */
export function failedRetireServerIds(
  result: Readonly<{ reconciled?: Readonly<{ failedServerIds: readonly string[] }> }> | undefined
): string[] {
  return [...(result?.reconciled?.failedServerIds ?? [])]
}
