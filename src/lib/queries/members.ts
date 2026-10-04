import { useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchOrganizationMembers, removeOrganizationMember } from '@/lib/instance-api'
import { queryKeys, useApiMutation } from '@/lib/query-client'

/** The people in the organization. Owners and managers only: callers pass `enabled` from their role check. */
export function useOrganizationMembers(orgId: string, options?: Readonly<{ enabled?: boolean }>) {
  return useQuery({
    queryKey: queryKeys.org(orgId).members,
    queryFn: () => fetchOrganizationMembers(orgId),
    enabled: (options?.enabled ?? true) && orgId.length > 0,
  })
}

/** Remove a person, or leave when the id is your own. The list refreshes afterwards. */
export function useRemoveOrganizationMember(orgId: string) {
  const queryClient = useQueryClient()
  return useApiMutation({
    mutationFn: (memberId: string) => removeOrganizationMember(orgId, memberId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.org(orgId).members })
    },
    fallbackError: 'Could not remove this person',
  })
}
