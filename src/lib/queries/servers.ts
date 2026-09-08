import { keepPreviousData, useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createLicense,
  deleteLicense,
  deleteServer,
  fetchFleetMetricsLatest,
  fetchLicenses,
  fetchOrgServerCapacity,
  fetchOrgServers,
  fetchServer,
  fetchServerLabels,
  fetchOrgTemperatureUnit,
  fetchServerMetricsCapabilities,
  fetchServerMetricsConnection,
  fetchServerMetricsEvents,
  fetchServerMetricsSeries,
  fetchServerMetricsSummary,
  fetchServersUpdateStatus,
  fetchServerUpdate,
  fetchTimezones,
  formatEntityMetricId,
  isForbiddenError,
  MetricsBackendUnavailableError,
  pingDaemon,
  rebootServer,
  resetServerUpdateStatus,
  saveOrgTemperatureUnit,
  startServerMetricsLive,
  stopServerMetricsLive,
  saveServerLabels,
  saveServerHardwareProfile,
  setServerHostname,
  setServerNtp,
  setServerTimezone,
  triggerServerUpdate,
  updateServer,
  type ConnectionHistoryChartResponse,
  type EffectiveCpuThermalLimits,
  type FetchServerMetricsSeriesOptions,
  type FleetMetricsLatestResponse,
  type LicenseRecord,
  type MetricEventsResponse,
  type MetricsCapabilitiesOutcome,
  type MetricsLiveStartOutcome,
  type MetricsSeriesResponse,
  type OrgTemperatureUnitSettings,
  type ServerHardwareProfileUpdate,
  type ServerMachineClass,
  type OrgServerRecord,
  type ServerDetailRecord,
} from '@/lib/instance-api'
import { unboundPendingKeys } from '@/lib/pending-keys'
import { useApiMutation, queryKeys } from '@/lib/query-client'
import { isServerMetricsQuery } from '@/lib/query-keys'
import { serversPresenceRefetchMs } from '@/lib/server-connection-status'

export const SERVERS_REFRESH_MS = 30_000
export const UPDATE_PROGRESS_POLL_MS = 5000
/** Fleet usage tracks ~1 sample/min host metrics — refresh once a minute. */
export const FLEET_USAGE_REFRESH_MS = 60_000

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
          }>
        ) => number | false | undefined)
    retry?: boolean | number
  }>
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
          }>
        ) => number | false | undefined)
  }>
) {
  return useQuery({
    queryKey: queryKeys.org(orgId).servers.detail(serverId),
    queryFn: () => fetchServer(serverId),
    enabled: (options?.enabled ?? true) && orgId.length > 0 && serverId.length > 0,
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
  options?: Readonly<{ enabled?: boolean }>
) {
  return useQuery({
    queryKey: queryKeys.org(orgId).servers.labels(serverId),
    queryFn: () => fetchServerLabels(serverId),
    enabled: (options?.enabled ?? true) && orgId.length > 0 && serverId.length > 0,
  })
}

export function useServersUpdateStatus(
  orgId: string,
  options?: Readonly<{ enabled?: boolean; pollWhileUpdating?: boolean }>
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
  options?: Readonly<{ enabled?: boolean }>
) {
  return useQuery({
    queryKey: queryKeys.org(orgId).servers.updateStatus(serverId),
    queryFn: () => fetchServerUpdate(serverId),
    enabled: (options?.enabled ?? true) && orgId.length > 0 && serverId.length > 0,
    refetchInterval: (query) => {
      const status = query.state.data?.status
      if (status !== 'updating') return false
      return UPDATE_PROGRESS_POLL_MS
    },
  })
}

export function useOrgServerCapacity(orgId: string, options?: Readonly<{ enabled?: boolean }>) {
  return useQuery({
    queryKey: queryKeys.org(orgId).settings.serverCapacity,
    queryFn: () => fetchOrgServerCapacity(orgId),
    enabled: (options?.enabled ?? true) && orgId.length > 0,
  })
}

export function useFleetServerUsage(orgId: string, options?: Readonly<{ enabled?: boolean }>) {
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
  /**
   * Pass a getter to recompute the window at fetch time — with a stable
   * `rangeKey`, interval refetches then advance the window instead of
   * re-reading a frozen one (required for live mode's 10 s cadence).
   */
  seriesOptions: FetchServerMetricsSeriesOptions | (() => FetchServerMetricsSeriesOptions),
  options?: Readonly<{
    enabled?: boolean
    refetchInterval?: number | false
    staleTime?: number
    /** Stable cache-key segment (e.g. the range id). Defaults to `fromIso`. */
    rangeKey?: string
  }>
) {
  const resolveOptions = () =>
    typeof seriesOptions === 'function' ? seriesOptions() : seriesOptions
  return useQuery({
    queryKey: queryKeys
      .org(orgId)
      .servers.metricsSeries(serverId, options?.rangeKey ?? resolveOptions().fromIso),
    queryFn: () => fetchServerMetricsSeries(serverId, resolveOptions(), orgId),
    enabled: (options?.enabled ?? true) && orgId.length > 0 && serverId.length > 0,
    refetchInterval: options?.refetchInterval,
    staleTime: options?.staleTime,
  })
}

/**
 * Same series endpoint as {@link useServerMetricsSeries}, issued as several
 * parallel requests instead of one — each `metricBatches` entry becomes its
 * own request, letting a caller stay under the server's per-request selector
 * cap (`MAX_SERIES_METRIC_SELECTORS_V5`) without dropping any entity. Uses
 * `useQueries` rather than one `useServerMetricsSeries` call per batch since
 * the batch count itself varies (topology size), which rules out calling a
 * hook a variable number of times.
 */
export function useServerMetricsSeriesBatches(
  orgId: string,
  serverId: string,
  metricBatches: readonly (readonly string[])[],
  rangeOptions: () => { fromIso: string; toIso: string },
  options?: Readonly<{
    enabled?: boolean
    refetchInterval?: number | false
    staleTime?: number
    /** Stable cache-key segment (e.g. the range id + topology generation). */
    rangeKey?: string
  }>
) {
  return useQueries({
    queries: metricBatches.map((metrics, index) => ({
      queryKey: queryKeys
        .org(orgId)
        .servers.metricsSeries(
          serverId,
          `${options?.rangeKey ?? rangeOptions().fromIso}:entities:${index}`
        ),
      queryFn: (): Promise<MetricsSeriesResponse> =>
        fetchServerMetricsSeries(serverId, { ...rangeOptions(), metrics }, orgId),
      enabled:
        (options?.enabled ?? true) && orgId.length > 0 && serverId.length > 0 && metrics.length > 0,
      refetchInterval: options?.refetchInterval,
      staleTime: options?.staleTime,
      // Hold the previous batch while a new one loads. The cache key carries
      // the topology generation and the batch index, so a generation bump or
      // a change in batch count would otherwise land on a cold entry and
      // blank every device chart to "Metric unavailable" mid-refresh — the
      // host series has no such gap, which is why only the per-device charts
      // appeared to drop out.
      placeholderData: keepPreviousData,
    })),
  })
}

/**
 * Sensor/mount/interface capability discovery — a live daemon round trip.
 * Enable only while the settings panel is actually open; never poll.
 */
export function useServerMetricsCapabilities(
  orgId: string,
  serverId: string,
  options?: Readonly<{ enabled?: boolean }>
) {
  return useQuery<MetricsCapabilitiesOutcome>({
    queryKey: queryKeys.org(orgId).servers.metricsCapabilities(serverId),
    queryFn: () => fetchServerMetricsCapabilities(serverId, orgId),
    enabled: (options?.enabled ?? true) && orgId.length > 0 && serverId.length > 0,
    retry: false,
  })
}

/**
 * Resolved CPU thermal/power limits for the hardware-profile panel's
 * TDP/Tjmax prefill. There is no dedicated capability endpoint for this —
 * it rides the summary endpoint's `cpuLimits` envelope over a narrow window.
 */
export function useServerMetricsCpuLimits(
  orgId: string,
  serverId: string,
  options?: Readonly<{ enabled?: boolean }>
) {
  return useQuery({
    queryKey: queryKeys.org(orgId).servers.metricsSummary(serverId, 'cpu-limits'),
    queryFn: async (): Promise<EffectiveCpuThermalLimits | null> => {
      const toMs = Date.now()
      try {
        const summary = await fetchServerMetricsSummary(
          serverId,
          {
            fromIso: new Date(toMs - 5 * 60 * 1000).toISOString(),
            toIso: new Date(toMs).toISOString(),
          },
          orgId
        )
        return summary.cpuLimits
      } catch (error) {
        if (error instanceof MetricsBackendUnavailableError) return null
        throw error
      }
    },
    enabled: (options?.enabled ?? true) && orgId.length > 0 && serverId.length > 0,
  })
}

/**
 * What the hardware-profile panel's monitored-NIC picker needs: the current
 * topology's network inventory (which devices are physical uplinks, which one
 * carries the default route, which slots are assigned today) plus the
 * server's effective NIC-slot limit. Both ride the series envelope, so this
 * is one narrow `/series` call over a short window — the same seeding trick
 * the sensors panel uses — rather than a dedicated endpoint.
 */
export function useServerNicSlotContext(
  orgId: string,
  serverId: string,
  options?: Readonly<{ enabled?: boolean }>
) {
  const query = useServerMetricsSeries(
    orgId,
    serverId,
    () => {
      const toMs = Date.now()
      return {
        fromIso: new Date(toMs - 5 * 60 * 1000).toISOString(),
        toIso: new Date(toMs).toISOString(),
        metrics: [formatEntityMetricId({ scope: 'host.cpu', field: 'busyPercent' })],
      }
    },
    { rangeKey: 'nic-slots', staleTime: 30_000, enabled: options?.enabled }
  )
  return {
    networks: query.data?.inventory?.networks ?? [],
    nicSlotLimit: query.data?.nicSlotLimit ?? null,
    isReady: query.data !== undefined,
    isLoading: query.isLoading,
    error: query.error,
  }
}

export function useSaveServerHardwareProfile(orgId: string, serverId: string) {
  const queryClient = useQueryClient()
  return useApiMutation({
    mutationFn: (profile: ServerHardwareProfileUpdate) =>
      saveServerHardwareProfile(serverId, profile, orgId),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: queryKeys.org(orgId).servers.detail(serverId),
        }),
        // Series/summary/capabilities/connection all depend on this
        // server's hardware profile (cpuLimits, disk/NIC labels, the
        // hardware-profile generation stamped on each sample) — invalidate
        // the whole `/metrics/*` subtree, not just capabilities.
        queryClient.invalidateQueries({
          queryKey: queryKeys.org(orgId).servers.metrics(serverId),
        }),
      ])
    },
    fallbackError: 'Failed to save sensor overrides',
  })
}

/** Org-wide display setting for how temperatures render (metrics are always stored/compared in Celsius). */
export function useOrgTemperatureUnit(orgId: string, options?: Readonly<{ enabled?: boolean }>) {
  return useQuery({
    queryKey: queryKeys.org(orgId).settings.temperatureUnit,
    queryFn: () => fetchOrgTemperatureUnit(orgId),
    enabled: (options?.enabled ?? true) && orgId.length > 0,
  })
}

export function useSaveOrgTemperatureUnit(orgId: string) {
  const queryClient = useQueryClient()
  const settingsKey = queryKeys.org(orgId).settings.temperatureUnit
  return useApiMutation({
    mutationFn: (patch: OrgTemperatureUnitSettings) => saveOrgTemperatureUnit(orgId, patch),
    onSuccess: async (data) => {
      queryClient.setQueryData(settingsKey, data)
      // Every server's /metrics/* payload (series/summary) embeds this
      // display unit — reach across the whole org, not just one server.
      await queryClient.invalidateQueries({
        predicate: (query) => isServerMetricsQuery(query, orgId),
      })
    },
    fallbackError: 'Failed to save temperature display setting',
  })
}

/**
 * Start (or renew) a live-metrics lease. `disabled` / `offline` come back as
 * typed outcomes, not thrown errors, so the metrics screen can branch.
 */
export function useStartServerMetricsLive(orgId: string, serverId: string) {
  return useApiMutation<MetricsLiveStartOutcome, string | undefined>({
    mutationFn: (leaseId?: string) => startServerMetricsLive(serverId, leaseId, orgId),
    fallbackError: 'Failed to start live metrics',
  })
}

/** Best-effort lease stop — callers may fire-and-forget on unmount. */
export function useStopServerMetricsLive(orgId: string, serverId: string) {
  return useApiMutation({
    mutationFn: (leaseId: string) => stopServerMetricsLive(serverId, leaseId, orgId),
    fallbackError: 'Failed to stop live metrics',
  })
}

/** Point-in-time hardware-health / lifecycle events for the currently viewed range. */
export function useServerMetricsEvents(
  orgId: string,
  serverId: string,
  seriesOptions: { fromIso: string; toIso: string },
  options?: Readonly<{
    enabled?: boolean
    refetchInterval?: number | false
    /** Stable cache-key segment (e.g. the range id). Defaults to `fromIso`. */
    rangeKey?: string
  }>
) {
  return useQuery({
    queryKey: queryKeys
      .org(orgId)
      .servers.metricsEvents(serverId, options?.rangeKey ?? seriesOptions.fromIso),
    queryFn: async (): Promise<MetricEventsResponse | null> => {
      try {
        return await fetchServerMetricsEvents(serverId, seriesOptions, orgId)
      } catch (error) {
        if (error instanceof MetricsBackendUnavailableError) return null
        throw error
      }
    },
    enabled: (options?.enabled ?? true) && orgId.length > 0 && serverId.length > 0,
    refetchInterval: options?.refetchInterval,
  })
}

/** Connection history + uptime totals for the currently viewed range. */
export function useServerMetricsConnection(
  orgId: string,
  serverId: string,
  seriesOptions: { fromIso: string; toIso: string },
  options?: Readonly<{
    enabled?: boolean
    refetchInterval?: number | false
    /** Stable cache-key segment (e.g. the range id). Defaults to `fromIso`. */
    rangeKey?: string
  }>
) {
  return useQuery({
    queryKey: queryKeys
      .org(orgId)
      .servers.metricsConnection(serverId, options?.rangeKey ?? seriesOptions.fromIso),
    queryFn: async (): Promise<ConnectionHistoryChartResponse | null> => {
      try {
        return await fetchServerMetricsConnection(serverId, seriesOptions, orgId)
      } catch (error) {
        if (error instanceof MetricsBackendUnavailableError) return null
        throw error
      }
    },
    enabled: (options?.enabled ?? true) && orgId.length > 0 && serverId.length > 0,
    refetchInterval: options?.refetchInterval,
  })
}

async function invalidateServerQueries(
  queryClient: ReturnType<typeof useQueryClient>,
  orgId: string,
  serverId?: string
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
      })
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
    mutationFn: (input: Parameters<typeof setServerNtp>[1]) => setServerNtp(serverId, input),
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
    mutationFn: (body: Parameters<typeof updateServer>[1]) => updateServer(serverId, body),
    onSuccess: async () => {
      await invalidateServerQueries(queryClient, orgId, serverId)
    },
  })
}

/**
 * Pin (or clear) the declared machine class. Invalidates the server's
 * metrics subtree as well as the record: the capability plan resolves from
 * `machine_class`, so the next series payload can gain or lose whole
 * families (hardware signals, Docker usage) — the same reason saving a
 * hardware profile invalidates it.
 */
export function useSetServerMachineClass(orgId: string, serverId: string) {
  const queryClient = useQueryClient()
  return useApiMutation({
    mutationFn: (machineClass: ServerMachineClass | null) =>
      updateServer(serverId, { machineClass }),
    onSuccess: async () => {
      await Promise.all([
        invalidateServerQueries(queryClient, orgId, serverId),
        queryClient.invalidateQueries({
          queryKey: queryKeys.org(orgId).servers.metrics(serverId),
        }),
      ])
    },
    fallbackError: 'Failed to save machine class',
  })
}

export function useSaveServerLabels(orgId: string, serverId: string) {
  const queryClient = useQueryClient()
  return useApiMutation({
    mutationFn: (labels: Record<string, string>) => saveServerLabels(serverId, labels),
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
        serverIds.map((serverId) => triggerServerUpdate(serverId))
      )
      return results
    },
    onSuccess: async (_data, serverIds) => {
      await Promise.all([
        ...serverIds.map((serverId) =>
          queryClient.invalidateQueries({
            queryKey: queryKeys.org(orgId).servers.updateStatus(serverId),
          })
        ),
        queryClient.invalidateQueries({
          queryKey: queryKeys.org(orgId).servers.updatesBatch,
        }),
      ])
    },
  })
}

/** One-shot registration key for the add-server install command. */
export function useCreateLicense(orgId: string) {
  const queryClient = useQueryClient()
  return useApiMutation({
    mutationFn: ({ name, installBaseUrl }: { name?: string; installBaseUrl?: string }) =>
      createLicense(name, installBaseUrl),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: queryKeys.org(orgId).settings.serverCapacity,
        }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.org(orgId).servers.licenses,
        }),
      ])
    },
    fallbackError: 'Failed to start server setup',
  })
}

/**
 * Owner-only registration keys. Manage-gated 403 is swallowed so non-owners
 * are not signed out by the global forbidden handler.
 */
export function useOrgLicenses(orgId: string, options?: Readonly<{ enabled?: boolean }>) {
  return useQuery({
    queryKey: queryKeys.org(orgId).servers.licenses,
    queryFn: async () => {
      try {
        return await fetchLicenses()
      } catch (err) {
        if (isForbiddenError(err)) {
          return { licenses: [] as LicenseRecord[] }
        }
        throw err
      }
    },
    enabled: (options?.enabled ?? true) && orgId.length > 0,
    retry: false,
    refetchInterval: (query) => {
      const pending = unboundPendingKeys(query.state.data?.licenses ?? [])
      return pending.length > 0 ? SERVERS_REFRESH_MS : false
    },
  })
}

export function useDeleteLicense(orgId: string) {
  const queryClient = useQueryClient()
  return useApiMutation({
    mutationFn: deleteLicense,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: queryKeys.org(orgId).servers.licenses,
        }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.org(orgId).settings.serverCapacity,
        }),
      ])
    },
    fallbackError: 'Failed to delete registration key',
  })
}
