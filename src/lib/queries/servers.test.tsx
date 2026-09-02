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
  usePatchServer,
  usePingDaemon,
  useRebootServer,
  useResetServerUpdateStatus,
  useSaveServerLabels,
  useSaveServerMetricsSensorOverrides,
  useServerDetail,
  useServerLabels,
  useServerMetricsCapabilities,
  useServerMetricsSeries,
  useServerReporting,
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
  saveServerMetricsSensorOverrides,
  startServerMetricsLive,
  stopServerMetricsLive,
} = vi.hoisted(() => ({
  fetchOrgServers: vi.fn(),
  fetchLicenses: vi.fn(),
  fetchFleetMetricsLatest: vi.fn(),
  fetchServerMetricsSeries: vi.fn(),
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
  saveServerMetricsSensorOverrides: vi.fn(),
  startServerMetricsLive: vi.fn(),
  stopServerMetricsLive: vi.fn(),
}))

vi.mock('@/lib/instance-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/instance-api')>()
  return {
    ...actual,
    fetchOrgServers,
    fetchLicenses,
    fetchFleetMetricsLatest,
    fetchServerMetricsSeries,
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
    saveServerMetricsSensorOverrides,
    startServerMetricsLive,
    stopServerMetricsLive,
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
  data?: unknown,
): number | false | undefined {
  const query = client.getQueryCache().find({ queryKey })
  if (!query) throw new TypeError('expected query in cache')
  const interval = (
    query.options as { refetchInterval?: unknown }
  ).refetchInterval
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
    const { result } = renderHook(
      () => useOrgServers(orgId, { enabled: false }),
      { wrapper: createWrapper() },
    )

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
        }),
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
      }),
    ).toBe(false)
  })

  it('useFleetServerUsage returns null when metrics backend is unavailable', async () => {
    fetchFleetMetricsLatest.mockRejectedValueOnce(
      new MetricsBackendUnavailableError('duckdb'),
    )

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
    const { result } = renderHook(
      () => useFleetServerUsage(orgId, { enabled: false }),
      { wrapper: createWrapper() },
    )

    expect(result.current.fetchStatus).toBe('idle')
    expect(fetchFleetMetricsLatest).not.toHaveBeenCalled()
  })

  it('useServerReporting returns null when metrics backend is unavailable', async () => {
    fetchServerMetricsSeries.mockRejectedValueOnce(
      new MetricsBackendUnavailableError('duckdb'),
    )

    const { result } = renderHook(
      () => useServerReporting(orgId, serverId),
      { wrapper: createWrapper() },
    )

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })
    expect(result.current.data).toBeNull()
  })

  it('useServerReporting loads uptime series when backend is available', async () => {
    fetchServerMetricsSeries.mockResolvedValueOnce({
      series: [{ metric: 'uptimeSeconds', points: [] }],
    })

    const { result } = renderHook(
      () => useServerReporting(orgId, serverId),
      { wrapper: createWrapper() },
    )

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })
    expect(fetchServerMetricsSeries).toHaveBeenCalledWith(
      serverId,
      expect.objectContaining({ metrics: ['uptimeSeconds'] }),
      orgId,
    )
    if (!result.current.data || !('series' in result.current.data)) {
      throw new TypeError('expected metrics series response')
    }
    expect(result.current.data.series).toHaveLength(1)
  })

  it('useServerReporting propagates non-backend errors', async () => {
    fetchServerMetricsSeries.mockRejectedValue(new Error('HTTP 500: boom'))

    const { result } = renderHook(
      () => useServerReporting(orgId, serverId),
      { wrapper: createWrapper(createTestQueryClient()) },
    )

    await waitFor(() => {
      expect(result.current.isError).toBe(true)
    })
  })

  it('useServerReporting stays idle when serverId is empty', () => {
    const { result } = renderHook(() => useServerReporting(orgId, ''), {
      wrapper: createWrapper(),
    })

    expect(result.current.fetchStatus).toBe('idle')
    expect(fetchServerMetricsSeries).not.toHaveBeenCalled()
  })

  it('useServerMetricsSeries loads metrics for a range', async () => {
    const seriesOptions: FetchServerMetricsSeriesOptions = {
      fromIso: '2026-01-01T00:00:00.000Z',
      toIso: '2026-01-02T00:00:00.000Z',
      metrics: ['cpuUserPercent'],
    }
    fetchServerMetricsSeries.mockResolvedValueOnce({
      series: [{ metric: 'cpuUserPercent', points: [] }],
    })

    const { result } = renderHook(
      () => useServerMetricsSeries(orgId, serverId, seriesOptions),
      { wrapper: createWrapper() },
    )

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })
    expect(fetchServerMetricsSeries).toHaveBeenCalledWith(
      serverId,
      seriesOptions,
      orgId,
    )
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
            metrics: ['cpuUserPercent'],
          },
          { enabled: false },
        ),
      { wrapper: createWrapper() },
    )

    expect(result.current.fetchStatus).toBe('idle')
    expect(fetchServerMetricsSeries).not.toHaveBeenCalled()
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

    renderHook(
      () => useServersUpdateStatus(orgId, { pollWhileUpdating: true }),
      { wrapper: createWrapper(client) },
    )

    await waitFor(() => {
      expect(
        resolveRefetchInterval(
          client,
          queryKeys.org(orgId).servers.updatesBatch,
        ),
      ).toBe(false)
    })

    await waitFor(() => {
      expect(
        resolveRefetchInterval(
          client,
          queryKeys.org(orgId).servers.updatesBatch,
          { servers: [{ serverId, status: 'updating' }] },
        ),
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

    const { result } = renderHook(
      () => useServerUpdateStatus(orgId, serverId),
      { wrapper: createWrapper() },
    )

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
        resolveRefetchInterval(
          client,
          queryKeys.org(orgId).servers.updateStatus(serverId),
          { serverId, status: 'updating' },
        ),
      ).toBe(UPDATE_PROGRESS_POLL_MS)
    })

    expect(
      resolveRefetchInterval(
        client,
        queryKeys.org(orgId).servers.updateStatus(serverId),
        { serverId, status: 'idle' },
      ),
    ).toBe(false)
  })

  it('useServerUpdateStatus stays idle when serverId is empty', () => {
    const { result } = renderHook(() => useServerUpdateStatus(orgId, ''), {
      wrapper: createWrapper(),
    })

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
    const { result } = renderHook(
      () => useOrgServerCapacity(orgId, { enabled: false }),
      { wrapper: createWrapper() },
    )

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

    const { result } = renderHook(
      () => useTriggerServerUpdate(orgId, serverId),
      { wrapper: createWrapper(client) },
    )

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

    const { result } = renderHook(
      () => useResetServerUpdateStatus(orgId, serverId),
      { wrapper: createWrapper(client) },
    )

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

    const { result } = renderHook(
      () => useSetServerHostname(orgId, serverId),
      { wrapper: createWrapper(client) },
    )

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

    const { result } = renderHook(
      () => useSetServerTimezone(orgId, serverId),
      { wrapper: createWrapper() },
    )

    await result.current.run('America/Chicago')
    expect(setServerTimezone).toHaveBeenCalledWith(
      serverId,
      'America/Chicago',
    )
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

    const { result } = renderHook(
      () => useSaveServerLabels(orgId, serverId),
      { wrapper: createWrapper(client) },
    )

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

    const { result } = renderHook(
      () => useBatchTriggerServerUpdates(orgId),
      { wrapper: createWrapper(client) },
    )

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
    expect(createLicense).toHaveBeenCalledWith(
      'edge',
      'https://203.0.113.1:8443',
    )
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

  it('useServerLabels loads label map', async () => {
    fetchServerLabels.mockResolvedValueOnce([
      { key: 'role', value: 'gateway' },
    ])

    const { result } = renderHook(() => useServerLabels(orgId, serverId), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })
    expect(result.current.data).toEqual([{ key: 'role', value: 'gateway' }])
  })

  it('useServerLabels respects enabled:false', () => {
    const { result } = renderHook(
      () => useServerLabels(orgId, serverId, { enabled: false }),
      { wrapper: createWrapper() },
    )

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
      const query = client
        .getQueryCache()
        .find({ queryKey: queryKeys.org(orgId).servers.licenses })
      expect(query?.state.status).toBe('error')
    })
  })

  it('useServerMetricsCapabilities fetches while the panel is open', async () => {
    fetchServerMetricsCapabilities.mockResolvedValueOnce({
      ok: true,
      capabilities: { sensors: [] },
    })
    const { result } = renderHook(
      () => useServerMetricsCapabilities(orgId, serverId),
      { wrapper: createWrapper() },
    )

    await waitFor(() => {
      expect(result.current.data).toEqual({
        ok: true,
        capabilities: { sensors: [] },
      })
    })
    expect(fetchServerMetricsCapabilities).toHaveBeenCalledWith(
      serverId,
      orgId,
    )
  })

  it('useServerMetricsCapabilities stays idle while disabled or unscoped', () => {
    const disabled = renderHook(
      () => useServerMetricsCapabilities(orgId, serverId, { enabled: false }),
      { wrapper: createWrapper() },
    )
    const unscoped = renderHook(() => useServerMetricsCapabilities(orgId, ''), {
      wrapper: createWrapper(),
    })

    expect(disabled.result.current.fetchStatus).toBe('idle')
    expect(unscoped.result.current.fetchStatus).toBe('idle')
    expect(fetchServerMetricsCapabilities).not.toHaveBeenCalled()
  })

  it('useSaveServerMetricsSensorOverrides saves and refreshes capability + detail reads', async () => {
    saveServerMetricsSensorOverrides.mockResolvedValueOnce({ ok: true })
    const client = createAppQueryClient()
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries')

    const { result } = renderHook(
      () => useSaveServerMetricsSensorOverrides(orgId, serverId),
      { wrapper: createWrapper(client) },
    )

    const overrides = { disabledSensors: ['coretemp'] }
    await result.current.run(
      overrides as Parameters<typeof result.current.run>[0],
    )

    expect(saveServerMetricsSensorOverrides).toHaveBeenCalledWith(
      serverId,
      overrides,
      orgId,
    )
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: queryKeys.org(orgId).servers.metricsCapabilities(serverId),
    })
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: queryKeys.org(orgId).servers.detail(serverId),
    })
  })

  it('useStartServerMetricsLive starts or renews a lease', async () => {
    startServerMetricsLive.mockResolvedValueOnce({
      ok: true,
      leaseId: 'lease-1',
    })

    const { result } = renderHook(
      () => useStartServerMetricsLive(orgId, serverId),
      { wrapper: createWrapper() },
    )

    const outcome = await result.current.run('lease-1')
    expect(startServerMetricsLive).toHaveBeenCalledWith(
      serverId,
      'lease-1',
      orgId,
    )
    expect(outcome).toEqual({
      ok: true,
      value: { ok: true, leaseId: 'lease-1' },
    })
  })

  it('useStopServerMetricsLive releases the lease', async () => {
    stopServerMetricsLive.mockResolvedValueOnce({ ok: true })

    const { result } = renderHook(
      () => useStopServerMetricsLive(orgId, serverId),
      { wrapper: createWrapper() },
    )

    await result.current.run('lease-1')
    expect(stopServerMetricsLive).toHaveBeenCalledWith(
      serverId,
      'lease-1',
      orgId,
    )
  })
})
