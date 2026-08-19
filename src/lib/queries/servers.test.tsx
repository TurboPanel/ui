// @vitest-environment happy-dom
import { QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MetricsBackendUnavailableError } from '@/lib/instance-api'
import { createAppQueryClient } from '@/lib/query-client'
import {
  useDeleteServer,
  useFleetServerUsage,
  useOrgLicenses,
  useOrgServers,
  usePingDaemon,
  useServerDetail,
  useServerLabels,
  useServerReporting,
  useTimezones,
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
    fetchServersUpdateStatus: vi.fn(),
    fetchServerUpdate: vi.fn(),
    fetchOrgServerCapacity: vi.fn(),
    createLicense: vi.fn(),
    rebootServer: vi.fn(),
    resetServerUpdateStatus: vi.fn(),
    saveServerLabels: vi.fn(),
    setServerHostname: vi.fn(),
    setServerNtp: vi.fn(),
    setServerTimezone: vi.fn(),
    triggerServerUpdate: vi.fn(),
    updateServer: vi.fn(),
  }
})

function createWrapper(client = createAppQueryClient()) {
  return function Wrapper({ children }: Readonly<{ children: React.ReactNode }>) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
}

afterEach(() => {
  vi.clearAllMocks()
})

describe('servers query hooks', () => {
  const orgId = 'org-1'
  const serverId = 'srv-1'

  it('useOrgServers loads fleet list', async () => {
    fetchOrgServers.mockResolvedValueOnce({
      servers: [{ id: serverId, displayName: 'edge' }],
    })

    const { result } = renderHook(() => useOrgServers(orgId), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })
    expect(result.current.data?.servers).toHaveLength(1)
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

  it('useFleetServerUsage returns null when metrics backend is unavailable', async () => {
    fetchFleetMetricsLatest.mockRejectedValueOnce(
      new MetricsBackendUnavailableError('clickhouse'),
    )

    const { result } = renderHook(() => useFleetServerUsage(orgId), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })
    expect(result.current.data).toBeNull()
  })

  it('useServerReporting returns null when metrics backend is unavailable', async () => {
    fetchServerMetricsSeries.mockRejectedValueOnce(
      new MetricsBackendUnavailableError('clickhouse'),
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

  it('useServerDetail loads server record', async () => {
    fetchServer.mockResolvedValueOnce({
      id: serverId,
      displayName: 'edge',
    })

    const { result } = renderHook(() => useServerDetail(orgId, serverId), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })
    expect(result.current.data?.displayName).toBe('edge')
  })

  it('useServerLabels loads label map', async () => {
    fetchServerLabels.mockResolvedValueOnce({
      labels: { role: 'gateway' },
    })

    const { result } = renderHook(() => useServerLabels(orgId, serverId), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })
    expect(result.current.data?.labels).toEqual({ role: 'gateway' })
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
})
