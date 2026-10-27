import { useQuery } from '@tanstack/react-query'
import {
  fetchOrganizationActivity,
  type OrganizationActivityFilter,
  type OrganizationActivityPage,
} from '@/lib/instance-api'
import { queryKeys } from '@/lib/query-client'

/** The feed is polled, not pushed: every two seconds while something on the page is in progress. */
export const ACTIVITY_POLL_MS = 2000
/** A page of finished history changes only when something new starts, so it is read less often. */
export const ACTIVITY_IDLE_POLL_MS = 15000
export const ACTIVITY_PAGE_SIZE = 25

function isLive(page: OrganizationActivityPage | undefined): boolean {
  return (page?.items ?? []).some((item) => item.state === 'queued' || item.state === 'deploying')
}

/** How often to read the page again: fast while it shows work in progress, slowly otherwise. */
export function activityPollInterval(page: OrganizationActivityPage | undefined): number {
  return isLive(page) ? ACTIVITY_POLL_MS : ACTIVITY_IDLE_POLL_MS
}

export type ActivityFeedParams = Readonly<{
  filter: OrganizationActivityFilter
  offset: number
  projectId?: string
  environmentId?: string
}>

/** One page of the org activity feed. Owners and managers only: callers pass `enabled` from their role check. */
export function useOrganizationActivity(
  orgId: string,
  params: ActivityFeedParams,
  options?: Readonly<{ enabled?: boolean }>
) {
  return useQuery({
    queryKey: queryKeys
      .org(orgId)
      .activity(params.filter, params.offset, params.projectId, params.environmentId),
    queryFn: () =>
      fetchOrganizationActivity(orgId, {
        filter: params.filter,
        projectId: params.projectId,
        environmentId: params.environmentId,
        limit: ACTIVITY_PAGE_SIZE,
        offset: params.offset,
      }),
    enabled: (options?.enabled ?? true) && orgId.length > 0,
    refetchInterval: (query) => activityPollInterval(query.state.data),
    // Keep the rows on screen while the next poll or page loads.
    placeholderData: (previous) => previous,
  })
}
