import { useQuery } from '@tanstack/react-query'
import {
  fetchOrganizationActivity,
  type OrganizationActivityFilter,
} from '@/lib/instance-api'
import { queryKeys } from '@/lib/query-client'

/** The feed is polled, not pushed: one cheap read every two seconds while the screen is open. */
export const ACTIVITY_POLL_MS = 2000
export const ACTIVITY_PAGE_SIZE = 25

/** One page of the org activity feed. Owners and managers only: callers pass `enabled` from their role check. */
export function useOrganizationActivity(
  orgId: string,
  params: Readonly<{ filter: OrganizationActivityFilter; offset: number }>,
  options?: Readonly<{ enabled?: boolean }>
) {
  return useQuery({
    queryKey: queryKeys.org(orgId).activity(params.filter, params.offset),
    queryFn: () =>
      fetchOrganizationActivity(orgId, {
        filter: params.filter,
        limit: ACTIVITY_PAGE_SIZE,
        offset: params.offset,
      }),
    enabled: (options?.enabled ?? true) && orgId.length > 0,
    refetchInterval: ACTIVITY_POLL_MS,
    // Keep the rows on screen while the next poll or page loads.
    placeholderData: (previous) => previous,
  })
}
