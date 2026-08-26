import { keepPreviousData, useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useMemo } from 'react'
import { systemContainerObservationInterval } from '@/lib/container-status-guards'
import {
  fetchContainerLogTail,
  fetchContainers,
  type ContainerRecord,
} from '@/lib/instance-api'
import { COMMAND_POLL_MS } from '@/lib/queries/commands'
import { queryKeys, type ContainerListFilters } from '@/lib/query-keys'

function observationRefetchInterval(query: {
  state: { data?: { containers?: ContainerRecord[] } }
}): number | false {
  return systemContainerObservationInterval(
    query.state.data?.containers,
    COMMAND_POLL_MS,
  )
}

/**
 * Filtered container lists use `keepPreviousData` so chip/filter changes do not
 * flash empty while the next page loads. Pass `keepPreviousData: true` (default
 * when filters are present) or set explicitly.
 */
export function useContainers(
  orgId: string,
  filters?: ContainerListFilters,
  options?: Readonly<{
    enabled?: boolean
    refetchInterval?: number | false
    /**
     * Poll until allocator pins gain a Docker id / post-create status.
     * Platform (system) projects only — compose overview stays one-shot.
     */
    observeUntilHostDeployed?: boolean
    keepPreviousData?: boolean
  }>,
) {
  const useKeepPrevious =
    options?.keepPreviousData ?? Boolean(filters && Object.keys(filters).length > 0)

  return useQuery({
    queryKey: queryKeys.org(orgId).containers.list(filters),
    queryFn: () => fetchContainers(filters),
    enabled: (options?.enabled ?? true) && orgId.length > 0,
    refetchInterval: options?.observeUntilHostDeployed
      ? observationRefetchInterval
      : (options?.refetchInterval ?? false),
    ...(useKeepPrevious ? { placeholderData: keepPreviousData } : {}),
  })
}

/**
 * Every container in a project, grouped by environment.
 *
 * **One** request, not one per environment: `GET /containers?projectId=` stamps
 * `environmentId` on each row so the grouping happens here. Platform projects
 * place one environment per server, so the old per-environment fan-out scaled
 * with the fleet — and with `observeUntilHostDeployed` it polled that way too.
 *
 * Pass `environmentIds` so environments with no containers still get an empty
 * bucket (callers read `containersByEnv[id]` for status).
 */
export function useContainersByProject(
  orgId: string,
  projectId: string,
  options?: Readonly<{
    enabled?: boolean
    /** Environments to guarantee a bucket for; memoize at the call site. */
    environmentIds?: readonly string[]
    /** Platform (system) projects: poll until Docker identity is stamped. */
    observeUntilHostDeployed?: boolean
  }>,
) {
  const queryClient = useQueryClient()
  const enabled =
    (options?.enabled ?? true) && orgId.length > 0 && projectId.length > 0
  const observeUntilHostDeployed = options?.observeUntilHostDeployed === true
  const environmentIds = options?.environmentIds

  const query = useQuery({
    queryKey: queryKeys.org(orgId).containers.list({ projectId }),
    queryFn: () => fetchContainers({ projectId }),
    enabled,
    refetchInterval: observeUntilHostDeployed
      ? observationRefetchInterval
      : false,
  })

  const containers = query.data?.containers

  const containersByEnv = useMemo(() => {
    const map: Record<string, ContainerRecord[]> = {}
    for (const environmentId of environmentIds ?? []) {
      if (environmentId.length > 0) map[environmentId] = []
    }
    for (const row of containers ?? []) {
      // An environment added since the caller's list was built has no bucket.
      const bucket = (map[row.environmentId] ??= [])
      bucket.push(row)
    }
    return map
  }, [containers, environmentIds])

  const refetchAll = useCallback(async () => {
    await queryClient.refetchQueries({
      queryKey: queryKeys.org(orgId).containers.list({ projectId }),
    })
  }, [orgId, projectId, queryClient])

  // The project list is one query — refreshing "one" environment refreshes it.
  const refetchOne = useCallback(
    async (_environmentId: string) => {
      await refetchAll()
    },
    [refetchAll],
  )

  return {
    containersByEnv,
    isLoading: enabled && query.isLoading,
    refetchAll,
    refetchOne,
  }
}

/** Per-service container maps (no auto-poll). */
export function useContainersByServices(
  orgId: string,
  serviceIds: readonly string[],
  options?: Readonly<{ enabled?: boolean }>,
) {
  const enabled = (options?.enabled ?? true) && orgId.length > 0
  const queries = useQueries({
    queries: serviceIds.map((serviceId) => ({
      queryKey: queryKeys.org(orgId).containers.list({ serviceId }),
      queryFn: () => fetchContainers({ serviceId }),
      enabled: enabled && serviceId.length > 0,
      refetchInterval: false as const,
    })),
  })

  const containersDataKey = queries
    .map((query) => query.dataUpdatedAt)
    .join(':')

  const containersByService = useMemo(() => {
    const map: Record<string, ContainerRecord[]> = {}
    for (let index = 0; index < serviceIds.length; index++) {
      const serviceId = serviceIds[index]
      if (!serviceId) continue
      map[serviceId] = queries[index]?.data?.containers ?? []
    }
    return map
    // eslint-disable-next-line react-hooks/exhaustive-deps -- containersDataKey tracks query data identity
  }, [serviceIds, containersDataKey])

  const isLoading =
    enabled && serviceIds.length > 0 && queries.some((query) => query.isLoading)

  const refetchAll = async () => {
    await Promise.all(queries.map((query) => query.refetch()))
  }

  return { containersByService, isLoading, refetchAll }
}

/** Follow cadence for an open tail — slower than command transcripts on purpose. */
export const CONTAINER_LOG_TAIL_POLL_MS = 5_000

/**
 * On-demand `docker container logs` snapshot. Disabled by default; callers
 * opt in. Follow is a refetch interval, not `--follow` on the host.
 */
export function useContainerLogTail(
  orgId: string,
  containerId: string,
  options?: Readonly<{
    enabled?: boolean
    tail?: number
    follow?: boolean
  }>,
) {
  const follow = options?.follow === true
  return useQuery({
    queryKey: queryKeys.org(orgId).containers.logs(containerId, options?.tail),
    queryFn: () => fetchContainerLogTail(containerId, options?.tail),
    enabled:
      (options?.enabled ?? false) &&
      orgId.length > 0 &&
      containerId.length > 0,
    refetchInterval: follow ? CONTAINER_LOG_TAIL_POLL_MS : false,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: follow,
  })
}

export type { ContainerListFilters }
