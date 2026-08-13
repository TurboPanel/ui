import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createLicense,
  deleteServer,
  fetchFleetMetricsLatest,
  fetchOrgServerCapacity,
  fetchOrgServers,
  fetchServer,
  fetchServerLabels,
  fetchServerMetricsSeries,
  fetchServersUpdateStatus,
  fetchServerUpdate,
  fetchTimezones,
  MetricsBackendUnavailableError,
  pingDaemon,
  rebootServer,
  resetServerUpdateStatus,
  saveServerLabels,
  setServerHostname,
  setServerNtp,
  setServerTimezone,
  triggerServerUpdate,
  updateServer,
  type FetchServerMetricsSeriesOptions,
  type FleetMetricsLatestResponse,
  type MetricsSeriesResponse,
  type OrgServerRecord,
  type ServerDetailRecord,
} from '@/lib/instance-api'
import { useApiMutation, queryKeys } from '@/lib/query-client'
import { serversPresenceRefetchMs } from '@/lib/server-connection-status'

export const SERVERS_REFRESH_MS = 30_000
export const UPDATE_PROGRESS_POLL_MS = 5000
/** Fleet usage tracks ~1 sample/min host metrics — refresh once a minute. */
export const FLEET_USAGE_REFRESH_MS = 60_000
const REPORTING_WINDOW_MS = 24 * 60 * 60 * 1000
const REPORTING_REFRESH_MS = 300_000

export function useOrgServers(
  orgId: string,
  options?: Readonly<{
    enabled?: boolean
    staleTime?: number
    refetchInterval?:
      | number
      | false
      | ((
          query: Readonly<{
            state: {
              data?: { servers?: readonly OrgServerRecord[] }
            }
          }>,
        ) => number | false | undefined)
    retry?: boolean | number
  }>,
) {
  return useQuery({
    queryKey: queryKeys.org(orgId).servers.list,
    queryFn: fetchOrgServers,
    enabled: (options?.enabled ?? true) && orgId.length > 0,
    staleTime: options?.staleTime,
    refetchInterval: options?.refetchInterval,
    retry: options?.retry,
  })
}

export function useServerDetail(
  orgId: string,
  serverId: string,
  options?: Readonly<{
    enabled?: boolean
    refetchInterval?:
      | number
      | false
      | ((
          query: Readonly<{
            state: { data?: ServerDetailRecord }
          }>,
        ) => number | false | undefined)
  }>,
) {
  return useQuery({
    queryKey: queryKeys.org(orgId).servers.detail(serverId),
    queryFn: () => fetchServer(serverId),
    enabled:
      (options?.enabled ?? true) &&
      orgId.length > 0 &&
      serverId.length > 0,
    refetchInterval:
      options?.refetchInterval ??
      ((query) =>
        serversPresenceRefetchMs({
          servers: query.state.data ? [query.state.data] : [],
          idleMs: SERVERS_REFRESH_MS,
        })),
  })
}

export function useServerLabels(
  orgId: string,
  serverId: string,
  options?: Readonly<{ enabled?: boolean }>,
) {
  return useQuery({
    queryKey: queryKeys.org(orgId).servers.labels(serverId),
    queryFn: () => fetchServerLabels(serverId),
    enabled:
      (options?.enabled ?? true) &&
      orgId.length > 0 &&
      serverId.length > 0,
  })
}

export function useServersUpdateStatus(
  orgId: string,
  options?: Readonly<{ enabled?: boolean; pollWhileUpdating?: boolean }>,
) {
  return useQuery({
    queryKey: queryKeys.org(orgId).servers.updatesBatch,
    queryFn: fetchServersUpdateStatus,
    enabled: (options?.enabled ?? true) && orgId.length > 0,
    refetchInterval: (query) => {
      if (!options?.pollWhileUpdating) return false
      const data = query.state.data
      if (!data?.servers.some((server) => server.status === 'updating')) {
        return false
      }
      return UPDATE_PROGRESS_POLL_MS
    },
  })
}

export function useServerUpdateStatus(
  orgId: string,
  serverId: string,
  options?: Readonly<{ enabled?: boolean }>,
) {
  return useQuery({
    queryKey: queryKeys.org(orgId).servers.updateStatus(serverId),
    queryFn: () => fetchServerUpdate(serverId),
    enabled:
      (options?.enabled ?? true) &&
      orgId.length > 0 &&
      serverId.length > 0,
    refetchInterval: (query) => {
      const status = query.state.data?.status
      if (status !== 'updating') return false
      return UPDATE_PROGRESS_POLL_MS
    },
  })
}

export function useOrgServerCapacity(
  orgId: string,
  options?: Readonly<{ enabled?: boolean }>,
) {
  return useQuery({
    queryKey: queryKeys.org(orgId).settings.serverCapacity,
    queryFn: () => fetchOrgServerCapacity(orgId),
    enabled: (options?.enabled ?? true) && orgId.length > 0,
  })
}

export function useFleetServerUsage(
  orgId: string,
  options?: Readonly<{ enabled?: boolean }>,
) {
  return useQuery({
    queryKey: queryKeys.org(orgId).servers.fleetUsage,
    queryFn: async (): Promise<FleetMetricsLatestResponse | null> => {
      try {
        return await fetchFleetMetricsLatest(orgId)
      } catch (error) {
        if (error instanceof MetricsBackendUnavailableError) return null
        throw error
      }
    },
    enabled: (options?.enabled ?? true) && orgId.length > 0,
    refetchInterval: FLEET_USAGE_REFRESH_MS,
    staleTime: FLEET_USAGE_REFRESH_MS / 2,
  })
}

export function useTimezones(options?: Readonly<{ enabled?: boolean }>) {
  return useQuery({
    queryKey: queryKeys.timezones,
    queryFn: fetchTimezones,
    enabled: options?.enabled ?? true,
  })
}

export function useServerMetricsSeries(
  orgId: string,
  serverId: string,
  seriesOptions: FetchServerMetricsSeriesOptions,
  options?: Readonly<{
    enabled?: boolean
    refetchInterval?: number | false
    staleTime?: number
  }>,
) {
  return useQuery({
    queryKey: queryKeys
      .org(orgId)
      .servers.metricsSeries(serverId, seriesOptions.fromIso),
    queryFn: () => fetchServerMetricsSeries(serverId, seriesOptions, orgId),
    enabled:
      (options?.enabled ?? true) &&
      orgId.length > 0 &&
      serverId.length > 0,
    refetchInterval: options?.refetchInterval,
    staleTime: options?.staleTime,
  })
}

export function useServerReporting(
  orgId: string,
  serverId: string,
  options?: Readonly<{ enabled?: boolean }>,
) {
  return useQuery({
    queryKey: queryKeys.org(orgId).servers.reporting(serverId, '24h'),
    queryFn: async (): Promise<MetricsSeriesResponse | null> => {
      const toMs = Date.now()
      try {
        return await fetchServerMetricsSeries(
          serverId,
          {
            fromIso: new Date(toMs - REPORTING_WINDOW_MS).toISOString(),
            toIso: new Date(toMs).toISOString(),
            metrics: ['uptimeSeconds'],
          },
          orgId,
        )
      } catch (error) {
        if (error instanceof MetricsBackendUnavailableError) return null
        throw error
      }
    },
    enabled:
      (options?.enabled ?? true) &&
      orgId.length > 0 &&
      serverId.length > 0,
    refetchInterval: REPORTING_REFRESH_MS,
  })
}

async function invalidateServerQueries(
  queryClient: ReturnType<typeof useQueryClient>,
  orgId: string,
  serverId?: string,
) {
  const tasks = [
    queryClient.invalidateQueries({
      queryKey: queryKeys.org(orgId).servers.list,
    }),
  ]
  if (serverId) {
    tasks.push(
      queryClient.invalidateQueries({
        queryKey: queryKeys.org(orgId).servers.detail(serverId),
      }),
    )
  }
  await Promise.all(tasks)
}

export function useTriggerServerUpdate(orgId: string, serverId: string) {
  const queryClient = useQueryClient()
  return useApiMutation({
    mutationFn: () => triggerServerUpdate(serverId),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: queryKeys.org(orgId).servers.updateStatus(serverId),
        }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.org(orgId).servers.updatesBatch,
        }),
      ])
    },
  })
}

export function useResetServerUpdateStatus(orgId: string, serverId: string) {
  const queryClient = useQueryClient()
  return useApiMutation({
    mutationFn: () => resetServerUpdateStatus(serverId),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: queryKeys.org(orgId).servers.updateStatus(serverId),
        }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.org(orgId).servers.updatesBatch,
        }),
      ])
    },
  })
}

export function useDeleteServer(orgId: string) {
  const queryClient = useQueryClient()
  return useApiMutation({
    mutationFn: (serverId: string) => deleteServer(serverId, orgId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.org(orgId).servers.list,
      })
    },
  })
}

export function usePingDaemon(orgId: string, serverId: string) {
  const queryClient = useQueryClient()
  return useApiMutation({
    mutationFn: () => pingDaemon(serverId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.org(orgId).commands.all,
      })
    },
  })
}

export function useRebootServer(orgId: string, serverId: string) {
  const queryClient = useQueryClient()
  return useApiMutation({
    mutationFn: () => rebootServer(serverId),
    onSuccess: async () => {
      await Promise.all([
        invalidateServerQueries(queryClient, orgId, serverId),
        queryClient.invalidateQueries({
          queryKey: queryKeys.org(orgId).commands.all,
        }),
      ])
    },
  })
}

export function useSetServerHostname(orgId: string, serverId: string) {
  const queryClient = useQueryClient()
  return useApiMutation({
    mutationFn: (hostname: string) => setServerHostname(serverId, hostname),
    onSuccess: async () => {
      await Promise.all([
        invalidateServerQueries(queryClient, orgId, serverId),
        queryClient.invalidateQueries({
          queryKey: queryKeys.org(orgId).commands.all,
        }),
      ])
    },
  })
}

export function useSetServerTimezone(orgId: string, serverId: string) {
  const queryClient = useQueryClient()
  return useApiMutation({
    mutationFn: (timezone: string) => setServerTimezone(serverId, timezone),
    onSuccess: async () => {
      await Promise.all([
        invalidateServerQueries(queryClient, orgId, serverId),
        queryClient.invalidateQueries({
          queryKey: queryKeys.org(orgId).commands.all,
        }),
      ])
    },
  })
}

export function useSetServerNtp(orgId: string, serverId: string) {
  const queryClient = useQueryClient()
  return useApiMutation({
    mutationFn: (input: Parameters<typeof setServerNtp>[1]) =>
      setServerNtp(serverId, input),
    onSuccess: async () => {
      await Promise.all([
        invalidateServerQueries(queryClient, orgId, serverId),
        queryClient.invalidateQueries({
          queryKey: queryKeys.org(orgId).commands.all,
        }),
      ])
    },
  })
}

export function useUpdateServer(orgId: string, serverId: string) {
  const queryClient = useQueryClient()
  return useApiMutation({
    mutationFn: (body: Parameters<typeof updateServer>[1]) =>
      updateServer(serverId, body),
    onSuccess: async () => {
      await invalidateServerQueries(queryClient, orgId, serverId)
    },
  })
}

export function useSaveServerLabels(orgId: string, serverId: string) {
  const queryClient = useQueryClient()
  return useApiMutation({
    mutationFn: (labels: Record<string, string>) =>
      saveServerLabels(serverId, labels),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: queryKeys.org(orgId).servers.detail(serverId),
        }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.org(orgId).servers.labels(serverId),
        }),
      ])
    },
    fallbackError: 'Failed to save server labels',
  })
}

/** Assign/unassign servers when the target id varies per mutation. */
export function usePatchServer(orgId: string) {
  const queryClient = useQueryClient()
  return useApiMutation({
    mutationFn: ({
      serverId,
      body,
    }: {
      serverId: string
      body: Parameters<typeof updateServer>[1]
    }) => updateServer(serverId, body),
    onSuccess: async (_data, { serverId }) => {
      await Promise.all([
        invalidateServerQueries(queryClient, orgId, serverId),
        queryClient.invalidateQueries({
          queryKey: queryKeys.org(orgId).topology.all,
        }),
      ])
    },
  })
}

export function useBatchTriggerServerUpdates(orgId: string) {
  const queryClient = useQueryClient()
  return useApiMutation({
    mutationFn: async (serverIds: readonly string[]) => {
      const results = await Promise.allSettled(
        serverIds.map((serverId) => triggerServerUpdate(serverId)),
      )
      return results
    },
    onSuccess: async (_data, serverIds) => {
      await Promise.all([
        ...serverIds.map((serverId) =>
          queryClient.invalidateQueries({
            queryKey: queryKeys.org(orgId).servers.updateStatus(serverId),
          }),
        ),
        queryClient.invalidateQueries({
          queryKey: queryKeys.org(orgId).servers.updatesBatch,
        }),
      ])
    },
  })
}

/** One-shot license for the add-server install command — not cached. */
export function useCreateLicense(orgId: string) {
  const queryClient = useQueryClient()
  return useApiMutation({
    mutationFn: ({
      displayName,
      installBaseUrl,
    }: {
      displayName?: string
      installBaseUrl?: string
    }) => createLicense(displayName, installBaseUrl),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.org(orgId).settings.serverCapacity,
      })
    },
    fallbackError: 'Failed to start server setup',
  })
}
