// @vitest-environment happy-dom
import { QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  MetricsBackendUnavailableError,
  type FetchServerMetricsSeriesOptions,
} from '@/lib/instance-api'
import { createAppQueryClient } from '@/lib/query-client'
import { queryKeys } from '@/lib/query-keys'
import {
  SERVERS_REFRESH_MS,
  UPDATE_PROGRESS_POLL_MS,
  useBatchTriggerServerUpdates,
  useCreateLicense,
  useDeleteLicense,
  useDeleteServer,
  useFleetServerUsage,
  useOrgLicenses,
  useOrgServerCapacity,
  useOrgServers,
  useOrgTemperatureUnit,
  usePatchServer,
  usePingDaemon,
  useRebootServer,
  useResetServerUpdateStatus,
  useSaveOrgTemperatureUnit,
  useSaveServerLabels,
  useSaveServerHardwareProfile,
  useServerDetail,
  useServerLabels,
  useServerMetricsCapabilities,
  useServerMetricsConnection,
  useServerMetricsCpuLimits,
  useServerMetricsEvents,
  useServerMetricsSeries,
  useServerMetricsSeriesBatches,
  useServerNicSlotContext,
  useServerUpdateStatus,
  useServersUpdateStatus,
  useSetServerHostname,
  useSetServerNtp,
  useSetServerTimezone,
  useStartServerMetricsLive,
  useStopServerMetricsLive,
  useTimezones,
  useTriggerServerUpdate,
  useUpdateServer,
} from '@/lib/queries/servers'

const {
  fetchOrgServers,
  fetchLicenses,
  fetchFleetMetricsLatest,
  fetchServerMetricsSeries,
  fetchServerMetricsEvents,
  fetchServerMetricsConnection,
  pingDaemon,
  fetchServer,
  fetchServerLabels,
  fetchTimezones,
  deleteServer,
  fetchServersUpdateStatus,
  fetchServerUpdate,
  fetchOrgServerCapacity,
  triggerServerUpdate,
  resetServerUpdateStatus,
  rebootServer,
  setServerHostname,
  setServerNtp,
  setServerTimezone,
  updateServer,
  saveServerLabels,
  createLicense,
  deleteLicense,
  fetchServerMetricsCapabilities,
  fetchServerMetricsSummary,
  saveServerHardwareProfile,
  startServerMetricsLive,
  stopServerMetricsLive,
  fetchOrgTemperatureUnit,
  saveOrgTemperatureUnit,
} = vi.hoisted(() => ({
  fetchOrgServers: vi.fn(),
  fetchLicenses: vi.fn(),
  fetchFleetMetricsLatest: vi.fn(),
  fetchServerMetricsSeries: vi.fn(),
  fetchServerMetricsEvents: vi.fn(),
  fetchServerMetricsConnection: vi.fn(),
  pingDaemon: vi.fn(),
  fetchServer: vi.fn(),
  fetchServerLabels: vi.fn(),
  fetchTimezones: vi.fn(),
  deleteServer: vi.fn(),
  fetchServersUpdateStatus: vi.fn(),
  fetchServerUpdate: vi.fn(),
  fetchOrgServerCapacity: vi.fn(),
  triggerServerUpdate: vi.fn(),
  resetServerUpdateStatus: vi.fn(),
  rebootServer: vi.fn(),
  setServerHostname: vi.fn(),
  setServerNtp: vi.fn(),
  setServerTimezone: vi.fn(),
  updateServer: vi.fn(),
  saveServerLabels: vi.fn(),
  createLicense: vi.fn(),
  deleteLicense: vi.fn(),
  fetchServerMetricsCapabilities: vi.fn(),
  fetchServerMetricsSummary: vi.fn(),
  saveServerHardwareProfile: vi.fn(),
  startServerMetricsLive: vi.fn(),
  stopServerMetricsLive: vi.fn(),
  fetchOrgTemperatureUnit: vi.fn(),
  saveOrgTemperatureUnit: vi.fn(),
}))

vi.mock('@/lib/instance-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/instance-api')>()
  return {
    ...actual,
    fetchOrgServers,
    fetchLicenses,
    fetchFleetMetricsLatest,
    fetchServerMetricsSeries,
    fetchServerMetricsEvents,
    fetchServerMetricsConnection,
    pingDaemon,
    fetchServer,
    fetchServerLabels,
    fetchTimezones,
    deleteServer,
    fetchServersUpdateStatus,
    fetchServerUpdate,
    fetchOrgServerCapacity,
    triggerServerUpdate,
    resetServerUpdateStatus,
    rebootServer,
    setServerHostname,
    setServerNtp,
    setServerTimezone,
    updateServer,
    saveServerLabels,
    createLicense,
    deleteLicense,
    fetchServerMetricsCapabilities,
    fetchServerMetricsSummary,
    saveServerHardwareProfile,
    startServerMetricsLive,
    stopServerMetricsLive,
    fetchOrgTemperatureUnit,
    saveOrgTemperatureUnit,
  }
})

function createTestQueryClient(): ReturnType<typeof createAppQueryClient> {
  const client = createAppQueryClient()
  client.setDefaultOptions({
    queries: { retry: false },
  })
  return client
}

function createWrapper(client = createAppQueryClient()) {
  return function Wrapper({ children }: Readonly<{ children: React.ReactNode }>) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
}

function resolveRefetchInterval(
  client: ReturnType<typeof createAppQueryClient>,
  queryKey: readonly unknown[],
  data?: unknown
): number | false | undefined {
  const query = client.getQueryCache().find({ queryKey })
  if (!query) throw new TypeError('expected query in cache')
  const interval = (query.options as { refetchInterval?: unknown }).refetchInterval
  if (typeof interval === 'function') {
    if (data !== undefined) {
      query.setState({ ...query.state, data })
    }
    return interval(query) as number | false
  }
  if (typeof interval === 'number' || interval === false) return interval
  return undefined
}

afterEach(() => {
  vi.clearAllMocks()
})

describe('servers query hooks', () => {
  const orgId = 'org-1'
  const serverId = 'srv-1'

  it('useOrgServers loads fleet list', async () => {
    fetchOrgServers.mockResolvedValueOnce({
      servers: [{ id: serverId, name: 'edge' }],
    })

    const { result } = renderHook(() => useOrgServers(orgId), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })
    expect(result.current.data?.servers).toHaveLength(1)
  })

  it('useOrgServers stays idle when orgId is empty', () => {
    const { result } = renderHook(() => useOrgServers(''), {
      wrapper: createWrapper(),
    })

    expect(result.current.fetchStatus).toBe('idle')
    expect(fetchOrgServers).not.toHaveBeenCalled()
  })

  it('useOrgServers respects enabled:false', () => {
    const { result } = renderHook(() => useOrgServers(orgId, { enabled: false }), {
      wrapper: createWrapper(),
    })

    expect(result.current.fetchStatus).toBe('idle')
    expect(fetchOrgServers).not.toHaveBeenCalled()
  })

  it('useOrgLicenses swallows manage-gated 403', async () => {
    fetchLicenses.mockRejectedValueOnce(new Error('HTTP 403: forbidden'))

    const { result } = renderHook(() => useOrgLicenses(orgId), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })
    expect(result.current.data).toEqual({ licenses: [] })
  })

  it('useOrgLicenses stays idle when orgId is empty', () => {
    const { result } = renderHook(() => useOrgLicenses(''), {
      wrapper: createWrapper(),
    })

    expect(result.current.fetchStatus).toBe('idle')
    expect(fetchLicenses).not.toHaveBeenCalled()
  })

  it('useOrgLicenses respects enabled:false', () => {
    const { result } = renderHook(() => useOrgLicenses(orgId, { enabled: false }), {
      wrapper: createWrapper(),
    })
    expect(result.current.fetchStatus).toBe('idle')
    expect(fetchLicenses).not.toHaveBeenCalled()
  })

  it('useOrgLicenses polls while unbound pending keys remain', async () => {
    const client = createAppQueryClient()
    fetchLicenses.mockResolvedValue({
      licenses: [
        {
          id: 'key-1',
          name: 'rack',
          createdAt: '2026-01-01T00:00:00.000Z',
          revocable: true,
          boundServer: null,
        },
      ],
    })

    renderHook(() => useOrgLicenses(orgId), {
      wrapper: createWrapper(client),
    })

    const key = queryKeys.org(orgId).servers.licenses
    await waitFor(() => {
      expect(
        resolveRefetchInterval(client, key, {
          licenses: [
            {
              id: 'key-1',
              name: 'rack',
              createdAt: '2026-01-01T00:00:00.000Z',
              revocable: true,
              boundServer: null,
            },
          ],
        })
      ).toBe(SERVERS_REFRESH_MS)
    })
    expect(
      resolveRefetchInterval(client, key, {
        licenses: [
          {
            id: 'key-1',
            name: 'rack',
            createdAt: '2026-01-01T00:00:00.000Z',
            revocable: true,
            boundServer: { id: 'srv-1', name: 'edge', connected: true },
          },
        ],
      })
    ).toBe(false)
  })

  it('useFleetServerUsage returns null when metrics backend is unavailable', async () => {
    fetchFleetMetricsLatest.mockRejectedValueOnce(new MetricsBackendUnavailableError('duckdb'))

    const { result } = renderHook(() => useFleetServerUsage(orgId), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })
    expect(result.current.data).toBeNull()
  })

  it('useFleetServerUsage propagates non-backend errors', async () => {
    fetchFleetMetricsLatest.mockRejectedValue(new Error('HTTP 500: boom'))

    const { result } = renderHook(() => useFleetServerUsage(orgId), {
      wrapper: createWrapper(createTestQueryClient()),
    })

    await waitFor(() => {
      expect(result.current.isError).toBe(true)
    })
    expect(result.current.error).toBeInstanceOf(Error)
  })

  it('useFleetServerUsage stays idle when disabled', () => {
    const { result } = renderHook(() => useFleetServerUsage(orgId, { enabled: false }), {
      wrapper: createWrapper(),
    })

    expect(result.current.fetchStatus).toBe('idle')
    expect(fetchFleetMetricsLatest).not.toHaveBeenCalled()
  })

  it('useServerMetricsSeries loads metrics for a range', async () => {
    const seriesOptions: FetchServerMetricsSeriesOptions = {
      fromIso: '2026-01-01T00:00:00.000Z',
      toIso: '2026-01-02T00:00:00.000Z',
      metrics: ['host.cpu.userPercent'],
    }
    fetchServerMetricsSeries.mockResolvedValueOnce({
      host: { points: [] },
      entities: [],
    })

    const { result } = renderHook(() => useServerMetricsSeries(orgId, serverId, seriesOptions), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })
    expect(fetchServerMetricsSeries).toHaveBeenCalledWith(serverId, seriesOptions, orgId)
  })

  it('useServerMetricsSeries stays idle when disabled', () => {
    const { result } = renderHook(
      () =>
        useServerMetricsSeries(
          orgId,
          serverId,
          {
            fromIso: '2026-01-01T00:00:00.000Z',
            toIso: '2026-01-02T00:00:00.000Z',
            metrics: ['host.cpu.userPercent'],
          },
          { enabled: false }
        ),
      { wrapper: createWrapper() }
    )

    expect(result.current.fetchStatus).toBe('idle')
    expect(fetchServerMetricsSeries).not.toHaveBeenCalled()
  })

  it('useServerMetricsEvents loads events for a range', async () => {
    const range = {
      fromIso: '2026-01-01T00:00:00.000Z',
      toIso: '2026-01-02T00:00:00.000Z',
    }
    fetchServerMetricsEvents.mockResolvedValueOnce({
      ok: true,
      events: [],
      truncated: false,
    })

    const { result } = renderHook(() => useServerMetricsEvents(orgId, serverId, range), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })
    expect(fetchServerMetricsEvents).toHaveBeenCalledWith(serverId, range, orgId)
  })

  it('useServerMetricsEvents returns null when metrics backend is unavailable', async () => {
    fetchServerMetricsEvents.mockRejectedValueOnce(new MetricsBackendUnavailableError('duckdb'))

    const { result } = renderHook(
      () =>
        useServerMetricsEvents(orgId, serverId, {
          fromIso: '2026-01-01T00:00:00.000Z',
          toIso: '2026-01-02T00:00:00.000Z',
        }),
      { wrapper: createWrapper() }
    )

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })
    expect(result.current.data).toBeNull()
  })

  it('useServerMetricsConnection loads uptime totals for a range', async () => {
    const range = {
      fromIso: '2026-01-01T00:00:00.000Z',
      toIso: '2026-01-02T00:00:00.000Z',
    }
    fetchServerMetricsConnection.mockResolvedValueOnce({
      ok: true,
      uptimeSeconds: 3600,
    })

    const { result } = renderHook(() => useServerMetricsConnection(orgId, serverId, range), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })
    expect(fetchServerMetricsConnection).toHaveBeenCalledWith(serverId, range, orgId)
  })

  it('useServerMetricsConnection returns null when metrics backend is unavailable', async () => {
    fetchServerMetricsConnection.mockRejectedValueOnce(new MetricsBackendUnavailableError('duckdb'))

    const { result } = renderHook(
      () =>
        useServerMetricsConnection(orgId, serverId, {
          fromIso: '2026-01-01T00:00:00.000Z',
          toIso: '2026-01-02T00:00:00.000Z',
        }),
      { wrapper: createWrapper() }
    )

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })
    expect(result.current.data).toBeNull()
  })

  it('useServerMetricsConnection propagates non-backend errors', async () => {
    fetchServerMetricsConnection.mockRejectedValue(new Error('HTTP 500: boom'))

    const { result } = renderHook(
      () =>
        useServerMetricsConnection(orgId, serverId, {
          fromIso: '2026-01-01T00:00:00.000Z',
          toIso: '2026-01-02T00:00:00.000Z',
        }),
      { wrapper: createWrapper(createTestQueryClient()) }
    )

    await waitFor(() => {
      expect(result.current.isError).toBe(true)
    })
    expect(result.current.error).toBeInstanceOf(Error)
  })

  it('useServerMetricsEvents propagates non-backend errors', async () => {
    fetchServerMetricsEvents.mockRejectedValue(new Error('HTTP 500: boom'))

    const { result } = renderHook(
      () =>
        useServerMetricsEvents(orgId, serverId, {
          fromIso: '2026-01-01T00:00:00.000Z',
          toIso: '2026-01-02T00:00:00.000Z',
        }),
      { wrapper: createWrapper(createTestQueryClient()) }
    )

    await waitFor(() => {
      expect(result.current.isError).toBe(true)
    })
    expect(result.current.error).toBeInstanceOf(Error)
  })

  it('useServerMetricsConnection stays idle when disabled', () => {
    const { result } = renderHook(
      () =>
        useServerMetricsConnection(
          orgId,
          serverId,
          {
            fromIso: '2026-01-01T00:00:00.000Z',
            toIso: '2026-01-02T00:00:00.000Z',
          },
          { enabled: false }
        ),
      { wrapper: createWrapper() }
    )

    expect(result.current.fetchStatus).toBe('idle')
    expect(fetchServerMetricsConnection).not.toHaveBeenCalled()
  })

  it('useServerMetricsEvents keys the cache on rangeKey when provided', async () => {
    const range = {
      fromIso: '2026-01-01T00:00:00.000Z',
      toIso: '2026-01-02T00:00:00.000Z',
    }
    fetchServerMetricsEvents.mockResolvedValueOnce({
      ok: true,
      events: [],
      truncated: false,
    })
    const client = createAppQueryClient()

    renderHook(() => useServerMetricsEvents(orgId, serverId, range, { rangeKey: '24h' }), {
      wrapper: createWrapper(client),
    })

    await waitFor(() => {
      expect(
        client.getQueryCache().find({
          queryKey: queryKeys.org(orgId).servers.metricsEvents(serverId, '24h'),
        })?.state.status
      ).toBe('success')
    })
    expect(
      client.getQueryCache().find({
        queryKey: queryKeys.org(orgId).servers.metricsEvents(serverId, range.fromIso),
      })
    ).toBeUndefined()
  })

  it('useServerMetricsSeriesBatches issues one series request per non-empty metric batch', async () => {
    const range = {
      fromIso: '2026-01-01T00:00:00.000Z',
      toIso: '2026-01-02T00:00:00.000Z',
    }
    fetchServerMetricsSeries.mockResolvedValue({
      host: { points: [] },
      entities: [],
    })

    const { result } = renderHook(
      () =>
        useServerMetricsSeriesBatches(
          orgId,
          serverId,
          [['host.cpu.busyPercent'], ['network:mac:eth0.receiveBytesPerSecond']],
          () => range,
          { rangeKey: 'live' }
        ),
      { wrapper: createWrapper() }
    )

    await waitFor(() => {
      expect(result.current.every((query) => query.isSuccess)).toBe(true)
    })
    expect(fetchServerMetricsSeries).toHaveBeenCalledTimes(2)
    expect(fetchServerMetricsSeries).toHaveBeenCalledWith(
      serverId,
      { ...range, metrics: ['host.cpu.busyPercent'] },
      orgId
    )
    expect(fetchServerMetricsSeries).toHaveBeenCalledWith(
      serverId,
      { ...range, metrics: ['network:mac:eth0.receiveBytesPerSecond'] },
      orgId
    )
  })

  it('useServerMetricsSeriesBatches stays idle for empty batches and when disabled', () => {
    const range = {
      fromIso: '2026-01-01T00:00:00.000Z',
      toIso: '2026-01-02T00:00:00.000Z',
    }
    const empty = renderHook(
      () => useServerMetricsSeriesBatches(orgId, serverId, [[]], () => range),
      { wrapper: createWrapper() }
    )
    const disabled = renderHook(
      () =>
        useServerMetricsSeriesBatches(orgId, serverId, [['host.cpu.busyPercent']], () => range, {
          enabled: false,
        }),
      { wrapper: createWrapper() }
    )

    expect(empty.result.current[0]?.fetchStatus).toBe('idle')
    expect(disabled.result.current[0]?.fetchStatus).toBe('idle')
    expect(fetchServerMetricsSeries).not.toHaveBeenCalled()
  })

  it('useServerMetricsCpuLimits reads cpuLimits from a narrow summary window', async () => {
    const cpuLimits = {
      tdpWatts: 65,
      tjMaxCelsius: 100,
      source: 'catalog-exact',
    }
    fetchServerMetricsSummary.mockResolvedValueOnce({
      ok: true,
      cpuLimits,
    })

    const { result } = renderHook(() => useServerMetricsCpuLimits(orgId, serverId), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.data).toEqual(cpuLimits)
    })
    expect(fetchServerMetricsSummary).toHaveBeenCalledWith(
      serverId,
      expect.objectContaining({
        fromIso: expect.any(String),
        toIso: expect.any(String),
      }),
      orgId
    )
    const options = fetchServerMetricsSummary.mock.calls[0]?.[1] as {
      fromIso: string
      toIso: string
    }
    expect(Date.parse(options.toIso) - Date.parse(options.fromIso)).toBe(5 * 60 * 1000)
  })

  it('useServerMetricsCpuLimits returns null when metrics backend is unavailable', async () => {
    fetchServerMetricsSummary.mockRejectedValueOnce(new MetricsBackendUnavailableError('duckdb'))

    const { result } = renderHook(() => useServerMetricsCpuLimits(orgId, serverId), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })
    expect(result.current.data).toBeNull()
  })

  it('useServerMetricsCpuLimits propagates non-backend errors', async () => {
    fetchServerMetricsSummary.mockRejectedValue(new Error('HTTP 500: boom'))

    const { result } = renderHook(() => useServerMetricsCpuLimits(orgId, serverId), {
      wrapper: createWrapper(createTestQueryClient()),
    })

    await waitFor(() => {
      expect(result.current.isError).toBe(true)
    })
    expect(result.current.error).toBeInstanceOf(Error)
  })

  it('useServerMetricsCpuLimits stays idle when disabled or unscoped', () => {
    const disabled = renderHook(
      () => useServerMetricsCpuLimits(orgId, serverId, { enabled: false }),
      { wrapper: createWrapper() }
    )
    const unscoped = renderHook(() => useServerMetricsCpuLimits(orgId, ''), {
      wrapper: createWrapper(),
    })

    expect(disabled.result.current.fetchStatus).toBe('idle')
    expect(unscoped.result.current.fetchStatus).toBe('idle')
    expect(fetchServerMetricsSummary).not.toHaveBeenCalled()
  })

  it('useServerNicSlotContext projects networks and the NIC-slot limit from a series seed', async () => {
    const networks = [
      { deviceId: 'mac:eth0', name: 'eth0', kind: 'uplink', role: 'nic' },
    ]
    fetchServerMetricsSeries.mockResolvedValueOnce({
      ok: true,
      inventory: { networks },
      nicSlotLimit: 2,
    })

    const { result } = renderHook(() => useServerNicSlotContext(orgId, serverId), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isReady).toBe(true)
    })
    expect(result.current.networks).toEqual(networks)
    expect(result.current.nicSlotLimit).toBe(2)
    expect(result.current.error).toBeNull()
    expect(fetchServerMetricsSeries).toHaveBeenCalledWith(
      serverId,
      expect.objectContaining({
        metrics: ['host.cpu.busyPercent'],
      }),
      orgId
    )
  })

  it('useServerNicSlotContext defaults to an empty inventory when the series envelope is thin', async () => {
    fetchServerMetricsSeries.mockResolvedValueOnce({ ok: true })

    const { result } = renderHook(() => useServerNicSlotContext(orgId, serverId), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isReady).toBe(true)
    })
    expect(result.current.networks).toEqual([])
    expect(result.current.nicSlotLimit).toBeNull()
  })

  it('useServerNicSlotContext stays idle when disabled', () => {
    const { result } = renderHook(
      () => useServerNicSlotContext(orgId, serverId, { enabled: false }),
      { wrapper: createWrapper() }
    )

    expect(result.current.isReady).toBe(false)
    expect(result.current.isLoading).toBe(false)
    expect(fetchServerMetricsSeries).not.toHaveBeenCalled()
  })

  it('useFleetServerUsage never takes per-server ids — one batched call regardless of fleet size', async () => {
    fetchFleetMetricsLatest.mockResolvedValueOnce({ ok: true, servers: [] })

    const { result } = renderHook(() => useFleetServerUsage(orgId), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })
    expect(fetchFleetMetricsLatest).toHaveBeenCalledTimes(1)
    expect(fetchFleetMetricsLatest).toHaveBeenCalledWith(orgId)
  })

  it('useServersUpdateStatus loads batch update status', async () => {
    fetchServersUpdateStatus.mockResolvedValueOnce({
      servers: [{ serverId, status: 'idle' }],
    })

    const { result } = renderHook(() => useServersUpdateStatus(orgId), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })
    expect(fetchServersUpdateStatus).toHaveBeenCalled()
  })

  it('useServersUpdateStatus polls only while a server is updating', async () => {
    const client = createAppQueryClient()
    fetchServersUpdateStatus.mockResolvedValue({
      servers: [{ serverId, status: 'updating' }],
    })

    renderHook(() => useServersUpdateStatus(orgId, { pollWhileUpdating: true }), {
      wrapper: createWrapper(client),
    })

    await waitFor(() => {
      expect(resolveRefetchInterval(client, queryKeys.org(orgId).servers.updatesBatch)).toBe(false)
    })

    await waitFor(() => {
      expect(
        resolveRefetchInterval(client, queryKeys.org(orgId).servers.updatesBatch, {
          servers: [{ serverId, status: 'updating' }],
        })
      ).toBe(UPDATE_PROGRESS_POLL_MS)
    })
  })

  it('useServersUpdateStatus stays idle when orgId is empty', () => {
    const { result } = renderHook(() => useServersUpdateStatus(''), {
      wrapper: createWrapper(),
    })

    expect(result.current.fetchStatus).toBe('idle')
    expect(fetchServersUpdateStatus).not.toHaveBeenCalled()
  })

  it('useServerUpdateStatus loads per-server update status', async () => {
    fetchServerUpdate.mockResolvedValueOnce({
      serverId,
      status: 'idle',
      current: null,
      target: null,
      updateAvailable: false,
    })

    const { result } = renderHook(() => useServerUpdateStatus(orgId, serverId), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })
    expect(fetchServerUpdate).toHaveBeenCalledWith(serverId)
  })

  it('useServerUpdateStatus polls while status is updating', async () => {
    const client = createAppQueryClient()
    fetchServerUpdate.mockResolvedValue({
      serverId,
      status: 'updating',
      current: null,
      target: null,
      updateAvailable: false,
    })

    renderHook(() => useServerUpdateStatus(orgId, serverId), {
      wrapper: createWrapper(client),
    })

    await waitFor(() => {
      expect(
        resolveRefetchInterval(client, queryKeys.org(orgId).servers.updateStatus(serverId), {
          serverId,
          status: 'updating',
        })
      ).toBe(UPDATE_PROGRESS_POLL_MS)
    })

    expect(
      resolveRefetchInterval(client, queryKeys.org(orgId).servers.updateStatus(serverId), {
        serverId,
        status: 'idle',
      })
    ).toBe(false)
  })

  it('useServerUpdateStatus stays idle when serverId is empty', () => {
    const { result } = renderHook(() => useServerUpdateStatus(orgId, ''), {
      wrapper: createWrapper(),
    })

    expect(result.current.fetchStatus).toBe('idle')
    expect(fetchServerUpdate).not.toHaveBeenCalled()
  })

  it('useServerUpdateStatus respects enabled:false', () => {
    const { result } = renderHook(
      () => useServerUpdateStatus(orgId, serverId, { enabled: false }),
      { wrapper: createWrapper() },
    )
    expect(result.current.fetchStatus).toBe('idle')
    expect(fetchServerUpdate).not.toHaveBeenCalled()
  })

  it('useOrgServerCapacity loads seat cap', async () => {
    fetchOrgServerCapacity.mockResolvedValueOnce({ maxServers: 5 })

    const { result } = renderHook(() => useOrgServerCapacity(orgId), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })
    expect(fetchOrgServerCapacity).toHaveBeenCalledWith(orgId)
    expect(result.current.data?.maxServers).toBe(5)
  })

  it('useOrgServerCapacity respects enabled:false', () => {
    const { result } = renderHook(() => useOrgServerCapacity(orgId, { enabled: false }), {
      wrapper: createWrapper(),
    })

    expect(result.current.fetchStatus).toBe('idle')
    expect(fetchOrgServerCapacity).not.toHaveBeenCalled()
  })

  it('usePingDaemon enqueues ping command', async () => {
    pingDaemon.mockResolvedValueOnce({
      ok: true,
      commandId: 'cmd-ping',
      status: 'queued',
    })

    const { result } = renderHook(() => usePingDaemon(orgId, serverId), {
      wrapper: createWrapper(),
    })

    await expect(result.current.run()).resolves.toMatchObject({ ok: true })
    expect(pingDaemon).toHaveBeenCalledWith(serverId)
  })

  it('useTriggerServerUpdate invalidates update queries', async () => {
    triggerServerUpdate.mockResolvedValueOnce({
      ok: true,
      commandId: 'cmd-update',
      status: 'queued',
    })
    const client = createAppQueryClient()
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries')

    const { result } = renderHook(() => useTriggerServerUpdate(orgId, serverId), {
      wrapper: createWrapper(client),
    })

    await result.current.run()
    expect(triggerServerUpdate).toHaveBeenCalledWith(serverId)
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: queryKeys.org(orgId).servers.updateStatus(serverId),
    })
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: queryKeys.org(orgId).servers.updatesBatch,
    })
  })

  it('useResetServerUpdateStatus clears update progress', async () => {
    resetServerUpdateStatus.mockResolvedValueOnce({ ok: true })
    const client = createAppQueryClient()
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries')

    const { result } = renderHook(() => useResetServerUpdateStatus(orgId, serverId), {
      wrapper: createWrapper(client),
    })

    await result.current.run()
    expect(resetServerUpdateStatus).toHaveBeenCalledWith(serverId)
    expect(invalidateSpy).toHaveBeenCalled()
  })

  it('useRebootServer enqueues reboot and invalidates server queries', async () => {
    rebootServer.mockResolvedValueOnce({
      ok: true,
      commandId: 'cmd-reboot',
      status: 'queued',
    })
    const client = createAppQueryClient()
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries')

    const { result } = renderHook(() => useRebootServer(orgId, serverId), {
      wrapper: createWrapper(client),
    })

    await result.current.run()
    expect(rebootServer).toHaveBeenCalledWith(serverId)
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: queryKeys.org(orgId).servers.list,
    })
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: queryKeys.org(orgId).commands.all,
    })
  })

  it('useSetServerHostname enqueues hostname change', async () => {
    setServerHostname.mockResolvedValueOnce({
      ok: true,
      commandId: 'cmd-hostname',
      status: 'queued',
    })
    const client = createAppQueryClient()
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries')

    const { result } = renderHook(() => useSetServerHostname(orgId, serverId), {
      wrapper: createWrapper(client),
    })

    await result.current.run('edge.example')
    expect(setServerHostname).toHaveBeenCalledWith(serverId, 'edge.example')
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: queryKeys.org(orgId).servers.detail(serverId),
    })
  })

  it('useSetServerTimezone enqueues timezone change', async () => {
    setServerTimezone.mockResolvedValueOnce({
      ok: true,
      commandId: 'cmd-tz',
      status: 'queued',
    })

    const { result } = renderHook(() => useSetServerTimezone(orgId, serverId), {
      wrapper: createWrapper(),
    })

    await result.current.run('America/Chicago')
    expect(setServerTimezone).toHaveBeenCalledWith(serverId, 'America/Chicago')
  })

  it('useSetServerNtp enqueues NTP change', async () => {
    setServerNtp.mockResolvedValueOnce({
      ok: true,
      commandId: 'cmd-ntp',
      status: 'queued',
    })

    const { result } = renderHook(() => useSetServerNtp(orgId, serverId), {
      wrapper: createWrapper(),
    })

    await result.current.run({ enabled: true, servers: ['203.0.113.10'] })
    expect(setServerNtp).toHaveBeenCalledWith(serverId, {
      enabled: true,
      servers: ['203.0.113.10'],
    })
  })

  it('useUpdateServer patches server record', async () => {
    updateServer.mockResolvedValueOnce({ ok: true })
    const client = createAppQueryClient()
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries')

    const { result } = renderHook(() => useUpdateServer(orgId, serverId), {
      wrapper: createWrapper(client),
    })

    await result.current.run({ name: 'edge-renamed' })
    expect(updateServer).toHaveBeenCalledWith(serverId, {
      name: 'edge-renamed',
    })
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: queryKeys.org(orgId).servers.detail(serverId),
    })
  })

  it('useSaveServerLabels replaces label map', async () => {
    saveServerLabels.mockResolvedValueOnce({ ok: true })
    const client = createAppQueryClient()
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries')

    const { result } = renderHook(() => useSaveServerLabels(orgId, serverId), {
      wrapper: createWrapper(client),
    })

    await result.current.run({ role: 'gateway' })
    expect(saveServerLabels).toHaveBeenCalledWith(serverId, {
      role: 'gateway',
    })
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: queryKeys.org(orgId).servers.labels(serverId),
    })
  })

  it('usePatchServer updates a server and invalidates topology', async () => {
    updateServer.mockResolvedValueOnce({ ok: true })
    const client = createAppQueryClient()
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries')

    const { result } = renderHook(() => usePatchServer(orgId), {
      wrapper: createWrapper(client),
    })

    await result.current.run({
      serverId,
      body: { name: 'patched' },
    })
    expect(updateServer).toHaveBeenCalledWith(serverId, { name: 'patched' })
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: queryKeys.org(orgId).topology.all,
    })
  })

  it('useBatchTriggerServerUpdates fans out updates', async () => {
    triggerServerUpdate.mockResolvedValue({
      ok: true,
      commandId: 'cmd-batch',
      status: 'queued',
    })
    const client = createAppQueryClient()
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries')

    const { result } = renderHook(() => useBatchTriggerServerUpdates(orgId), {
      wrapper: createWrapper(client),
    })

    await result.current.run(['srv-1', 'srv-2'])
    expect(triggerServerUpdate).toHaveBeenCalledTimes(2)
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: queryKeys.org(orgId).servers.updatesBatch,
    })
  })

  it('useCreateLicense mints a key and invalidates capacity', async () => {
    createLicense.mockResolvedValueOnce({
      ok: true,
      license: 'lic-token',
      name: 'edge',
    })
    const client = createAppQueryClient()
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries')

    const { result } = renderHook(() => useCreateLicense(orgId), {
      wrapper: createWrapper(client),
    })

    await result.current.run({
      name: 'edge',
      installBaseUrl: 'https://203.0.113.1:8443',
    })
    expect(createLicense).toHaveBeenCalledWith('edge', 'https://203.0.113.1:8443')
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: queryKeys.org(orgId).settings.serverCapacity,
    })
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: queryKeys.org(orgId).servers.licenses,
    })
  })

  it('useDeleteLicense revokes a key', async () => {
    deleteLicense.mockResolvedValueOnce({ ok: true })
    const client = createAppQueryClient()
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries')

    const { result } = renderHook(() => useDeleteLicense(orgId), {
      wrapper: createWrapper(client),
    })

    await result.current.run('lic-1')
    expect(deleteLicense.mock.calls[0]?.[0]).toBe('lic-1')
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: queryKeys.org(orgId).servers.licenses,
    })
  })

  it('useServerDetail loads server record', async () => {
    fetchServer.mockResolvedValueOnce({
      id: serverId,
      name: 'edge',
    })

    const { result } = renderHook(() => useServerDetail(orgId, serverId), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })
    expect(result.current.data?.name).toBe('edge')
  })

  it('useServerDetail stays idle when serverId is empty', () => {
    const { result } = renderHook(() => useServerDetail(orgId, ''), {
      wrapper: createWrapper(),
    })

    expect(result.current.fetchStatus).toBe('idle')
    expect(fetchServer).not.toHaveBeenCalled()
  })

  it('useServerDetail respects enabled:false', () => {
    const { result } = renderHook(
      () => useServerDetail(orgId, serverId, { enabled: false }),
      { wrapper: createWrapper() },
    )
    expect(result.current.fetchStatus).toBe('idle')
    expect(fetchServer).not.toHaveBeenCalled()
  })

  it('useServerDetail uses an explicit refetchInterval when provided', async () => {
    fetchServer.mockResolvedValue({ id: serverId, name: 'edge' })
    const client = createTestQueryClient()

    renderHook(
      () => useServerDetail(orgId, serverId, { refetchInterval: 12_000 }),
      { wrapper: createWrapper(client) },
    )

    await waitFor(() => {
      expect(
        resolveRefetchInterval(
          client,
          queryKeys.org(orgId).servers.detail(serverId),
        ),
      ).toBe(12_000)
    })
  })

  it('useServerLabels loads label map', async () => {
    fetchServerLabels.mockResolvedValueOnce([{ key: 'role', value: 'gateway' }])

    const { result } = renderHook(() => useServerLabels(orgId, serverId), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })
    expect(result.current.data).toEqual([{ key: 'role', value: 'gateway' }])
  })

  it('useServerLabels respects enabled:false', () => {
    const { result } = renderHook(() => useServerLabels(orgId, serverId, { enabled: false }), {
      wrapper: createWrapper(),
    })

    expect(result.current.fetchStatus).toBe('idle')
    expect(fetchServerLabels).not.toHaveBeenCalled()
  })

  it('useTimezones loads timezone list when enabled', async () => {
    fetchTimezones.mockResolvedValueOnce({ timezones: ['UTC', 'America/Chicago'] })

    const { result } = renderHook(() => useTimezones({ enabled: true }), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })
    expect(result.current.data?.timezones).toContain('UTC')
  })

  it('useTimezones stays idle when disabled', () => {
    const { result } = renderHook(() => useTimezones({ enabled: false }), {
      wrapper: createWrapper(),
    })

    expect(result.current.fetchStatus).toBe('idle')
    expect(fetchTimezones).not.toHaveBeenCalled()
  })

  it('useTimezones fetches when options are omitted', async () => {
    fetchTimezones.mockResolvedValueOnce({ timezones: ['UTC'] })

    const { result } = renderHook(() => useTimezones(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })
    expect(fetchTimezones).toHaveBeenCalled()
  })

  it('useDeleteServer removes a server and invalidates fleet list', async () => {
    deleteServer.mockResolvedValueOnce({ ok: true })
    const client = createAppQueryClient()
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries')

    const { result } = renderHook(() => useDeleteServer(orgId), {
      wrapper: createWrapper(client),
    })

    await result.current.run(serverId)
    expect(deleteServer).toHaveBeenCalledWith(serverId, orgId)
    expect(invalidateSpy).toHaveBeenCalled()
  })

  it('useOrgLicenses rethrows non-403 failures as query errors', async () => {
    fetchLicenses.mockRejectedValue(new Error('licenses failed: HTTP 500'))
    const client = createTestQueryClient()

    renderHook(() => useOrgLicenses(orgId), {
      wrapper: createWrapper(client),
    })

    await waitFor(() => {
      const query = client.getQueryCache().find({ queryKey: queryKeys.org(orgId).servers.licenses })
      expect(query?.state.status).toBe('error')
    })
  })

  it('useServerMetricsCapabilities fetches while the panel is open', async () => {
    fetchServerMetricsCapabilities.mockResolvedValueOnce({
      ok: true,
      capabilities: { sensors: [] },
    })
    const { result } = renderHook(() => useServerMetricsCapabilities(orgId, serverId), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.data).toEqual({
        ok: true,
        capabilities: { sensors: [] },
      })
    })
    expect(fetchServerMetricsCapabilities).toHaveBeenCalledWith(serverId, orgId)
  })

  it('useServerMetricsCapabilities stays idle while disabled or unscoped', () => {
    const disabled = renderHook(
      () => useServerMetricsCapabilities(orgId, serverId, { enabled: false }),
      { wrapper: createWrapper() }
    )
    const unscoped = renderHook(() => useServerMetricsCapabilities(orgId, ''), {
      wrapper: createWrapper(),
    })

    expect(disabled.result.current.fetchStatus).toBe('idle')
    expect(unscoped.result.current.fetchStatus).toBe('idle')
    expect(fetchServerMetricsCapabilities).not.toHaveBeenCalled()
  })

  it('useSaveServerHardwareProfile saves and refreshes the metrics subtree + detail reads', async () => {
    saveServerHardwareProfile.mockResolvedValueOnce({ ok: true })
    const client = createAppQueryClient()
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries')

    const { result } = renderHook(() => useSaveServerHardwareProfile(orgId, serverId), {
      wrapper: createWrapper(client),
    })

    const overrides = { disabledSensors: ['coretemp'] }
    await result.current.run(overrides as Parameters<typeof result.current.run>[0])

    expect(saveServerHardwareProfile).toHaveBeenCalledWith(serverId, overrides, orgId)
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: queryKeys.org(orgId).servers.detail(serverId),
    })
    // One prefix invalidation covers series/summary/capabilities/connection —
    // all of them depend on the hardware profile (cpuLimits, disk/NIC
    // labels, hardware-profile generation).
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: queryKeys.org(orgId).servers.metrics(serverId),
    })
    expect(queryKeys.org(orgId).servers.metricsCapabilities(serverId)).toEqual([
      ...queryKeys.org(orgId).servers.metrics(serverId),
      'capabilities',
    ])
    expect(queryKeys.org(orgId).servers.metricsSummary(serverId, 'cpu-limits')).toEqual([
      ...queryKeys.org(orgId).servers.metrics(serverId),
      'summary',
      'cpu-limits',
    ])
  })

  it('useStartServerMetricsLive starts or renews a lease', async () => {
    startServerMetricsLive.mockResolvedValueOnce({
      ok: true,
      leaseId: 'lease-1',
    })

    const { result } = renderHook(() => useStartServerMetricsLive(orgId, serverId), {
      wrapper: createWrapper(),
    })

    const outcome = await result.current.run('lease-1')
    expect(startServerMetricsLive).toHaveBeenCalledWith(serverId, 'lease-1', orgId)
    expect(outcome).toEqual({
      ok: true,
      value: { ok: true, leaseId: 'lease-1' },
    })
  })

  it('useStopServerMetricsLive releases the lease', async () => {
    stopServerMetricsLive.mockResolvedValueOnce({ ok: true })

    const { result } = renderHook(() => useStopServerMetricsLive(orgId, serverId), {
      wrapper: createWrapper(),
    })

    await result.current.run('lease-1')
    expect(stopServerMetricsLive).toHaveBeenCalledWith(serverId, 'lease-1', orgId)
  })

  it('useOrgTemperatureUnit loads the org display setting', async () => {
    fetchOrgTemperatureUnit.mockResolvedValueOnce({
      temperatureUnit: 'fahrenheit',
    })

    const { result } = renderHook(() => useOrgTemperatureUnit(orgId), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.data).toEqual({ temperatureUnit: 'fahrenheit' })
    })
    expect(fetchOrgTemperatureUnit).toHaveBeenCalledWith(orgId)
  })

  it('useOrgTemperatureUnit respects enabled:false', () => {
    const { result } = renderHook(
      () => useOrgTemperatureUnit(orgId, { enabled: false }),
      { wrapper: createWrapper() },
    )
    expect(result.current.fetchStatus).toBe('idle')
    expect(fetchOrgTemperatureUnit).not.toHaveBeenCalled()
  })

  it('useSaveOrgTemperatureUnit saves and invalidates every server metrics subtree in the org', async () => {
    saveOrgTemperatureUnit.mockResolvedValueOnce({
      temperatureUnit: 'fahrenheit',
    })
    const client = createAppQueryClient()
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries')

    const { result } = renderHook(() => useSaveOrgTemperatureUnit(orgId), {
      wrapper: createWrapper(client),
    })

    await result.current.run({ temperatureUnit: 'fahrenheit' })

    expect(saveOrgTemperatureUnit).toHaveBeenCalledWith(orgId, {
      temperatureUnit: 'fahrenheit',
    })
    expect(client.getQueryData(queryKeys.org(orgId).settings.temperatureUnit)).toEqual({
      temperatureUnit: 'fahrenheit',
    })

    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ predicate: expect.any(Function) })
    )
    const call = invalidateSpy.mock.calls.find(
      ([opts]) => typeof (opts as { predicate?: unknown })?.predicate === 'function'
    )
    const predicate = (call?.[0] as { predicate: (q: { queryKey: readonly unknown[] }) => boolean })
      .predicate
    // Matches this server's metrics subtree regardless of which server...
    expect(
      predicate({
        queryKey: queryKeys.org(orgId).servers.metrics(serverId),
      })
    ).toBe(true)
    expect(
      predicate({
        queryKey: queryKeys.org(orgId).servers.metricsSeries('other-server', 'range-1'),
      })
    ).toBe(true)
    // The CPU-limits summary read (useServerMetricsCpuLimits) carries
    // temperatureUnit too via buildCpuLimitsEnvelope — its TDP/Tjmax prefill
    // must go stale-free on a unit change same as the charts do.
    expect(
      predicate({
        queryKey: queryKeys.org(orgId).servers.metricsSummary(serverId, 'cpu-limits'),
      })
    ).toBe(true)
    // ...but not an unrelated subtree (labels) or another org's server.
    expect(predicate({ queryKey: queryKeys.org(orgId).servers.labels(serverId) })).toBe(false)
    expect(
      predicate({
        queryKey: queryKeys.org('other-org').servers.metrics(serverId),
      })
    ).toBe(false)
  })
})
