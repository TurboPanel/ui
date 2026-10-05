import { useQueries } from '@tanstack/react-query'
import { useMemo } from 'react'
import { groupDeploymentsByGeneration, type DeploymentGroup } from '@/lib/deployment-history'
import {
  fetchEnvironmentConfigView,
  fetchEnvironmentDeployments,
  type DeploymentHistoryPage,
  type EnvironmentConfigViewResponse,
} from '@/lib/instance-api'
import { COMMAND_POLL_MS } from '@/lib/queries/commands'
import { queryKeys } from '@/lib/query-keys'
import { isDeployInProgress } from '@/lib/v4/project-home'

/** Deploys read per environment for a card: enough to group the newest fan-out. */
const LATEST_DEPLOY_ROWS = 8

/** The newest deploy of a history page, or `null` when there is none. */
function newestGroup(page: DeploymentHistoryPage): DeploymentGroup | null {
  return groupDeploymentsByGeneration(page.deployments)[0] ?? null
}

/**
 * Each environment's config-view (Base, changes, follows the Base), one call
 * per environment. A failed read (for example a saved compose the server
 * cannot read) leaves that environment out of the map; callers show nothing
 * for it rather than a guess.
 */
export function useEnvironmentConfigViews(
  orgId: string,
  environmentIds: readonly string[],
  options?: Readonly<{ enabled?: boolean }>,
) {
  const enabled = (options?.enabled ?? true) && orgId.length > 0
  const queries = useQueries({
    queries: environmentIds.map((environmentId) => ({
      queryKey: queryKeys.org(orgId).environments.configView(environmentId),
      queryFn: () => fetchEnvironmentConfigView(environmentId),
      enabled: enabled && environmentId.length > 0,
      retry: false,
    })),
  })
  // Depend on each query's data stamp: `queries` is a new array every render.
  const dataKey = queries.map((query) => query.dataUpdatedAt).join(':')
  const views = useMemo(() => {
    const map: Record<string, EnvironmentConfigViewResponse | undefined> = {}
    environmentIds.forEach((environmentId, index) => {
      map[environmentId] = queries[index]?.data
    })
    return map
    // eslint-disable-next-line react-hooks/exhaustive-deps -- dataKey tracks query data identity
  }, [environmentIds, dataKey])
  const isLoading = enabled && queries.some((query) => query.isLoading)
  return { views, isLoading }
}

/**
 * The newest deploy of each environment: a group, `null` when it never
 * deployed, `undefined` while loading or when the read failed. An environment
 * whose newest deploy is still going is read again every few seconds.
 */
export function useLatestDeployments(
  orgId: string,
  environmentIds: readonly string[],
  options?: Readonly<{ enabled?: boolean }>,
) {
  const enabled = (options?.enabled ?? true) && orgId.length > 0
  const queries = useQueries({
    queries: environmentIds.map((environmentId) => ({
      queryKey: queryKeys.org(orgId).environments.latestDeployments(environmentId),
      queryFn: async () =>
        newestGroup(await fetchEnvironmentDeployments(environmentId, { limit: LATEST_DEPLOY_ROWS })),
      enabled: enabled && environmentId.length > 0,
      retry: false,
      refetchInterval: (query: { state: { data?: DeploymentGroup | null } }) =>
        isDeployInProgress(query.state.data) ? COMMAND_POLL_MS : false,
    })),
  })
  const dataKey = queries.map((query) => query.dataUpdatedAt).join(':')
  const latest = useMemo(() => {
    const map: Record<string, DeploymentGroup | null | undefined> = {}
    environmentIds.forEach((environmentId, index) => {
      map[environmentId] = queries[index]?.data
    })
    return map
    // eslint-disable-next-line react-hooks/exhaustive-deps -- dataKey tracks query data identity
  }, [environmentIds, dataKey])
  return { latest }
}
