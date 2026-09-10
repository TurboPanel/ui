// @vitest-environment happy-dom
import { QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createAppQueryClient } from '@/lib/query-client'
import { queryKeys } from '@/lib/query-keys'
import {
  SERVERS_REFRESH_MS,
  UPDATE_PROGRESS_POLL_MS,
  useOrgServers,
  useServerDetail,
  useServerMetricsSeries,
  useServerMetricsSeriesBatches,
  useServersUpdateStatus,
} from '@/lib/queries/servers'
import { SERVER_INITIALIZING_POLL_MS } from '@/lib/server-connection-status'

const {
  fetchOrgServers,
  fetchServer,
  fetchServerMetricsSeries,
  fetchServersUpdateStatus,
} = vi.hoisted(() => ({
  fetchOrgServers: vi.fn(),
  fetchServer: vi.fn(),
  fetchServerMetricsSeries: vi.fn(),
  fetchServersUpdateStatus: vi.fn(),
}))

vi.mock('@/lib/instance-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/instance-api')>()
  return {
    ...actual,
    fetchOrgServers,
    fetchServer,
    fetchServerMetricsSeries,
    fetchServersUpdateStatus,
  }
})

function createTestQueryClient(): ReturnType<typeof createAppQueryClient> {
  const client = createAppQueryClient()
  client.setDefaultOptions({
    queries: { retry: false },
  })
  return client
}

function createWrapper(client = createTestQueryClient()) {
  return function Wrapper({ children }: Readonly<{ children: ReactNode }>) {
    return createElement(QueryClientProvider, { client }, children)
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

describe('servers interval and option branches', () => {
  const orgId = 'org-1'
  const serverId = 'srv-1'

  it('useOrgServers forwards staleTime, retry, and refetchInterval', async () => {
    fetchOrgServers.mockResolvedValue({ servers: [] })
    const client = createTestQueryClient()

    renderHook(
      () =>
        useOrgServers(orgId, {
          staleTime: 12_000,
          retry: 0,
          refetchInterval: 7_000,
        }),
      { wrapper: createWrapper(client) },
    )

    await waitFor(() => {
      expect(
        resolveRefetchInterval(client, queryKeys.org(orgId).servers.list),
      ).toBe(7_000)
    })
    const query = client.getQueryCache().find({
      queryKey: queryKeys.org(orgId).servers.list,
    })
    if (!query) throw new TypeError('expected org servers query')
    expect((query.options as { staleTime?: number }).staleTime).toBe(12_000)
    expect(query.options.retry).toBe(0)
  })

  it('useServerDetail polls faster while the host is initializing', async () => {
    fetchServer.mockResolvedValue({
      id: serverId,
      connected: false,
      statusChangedAt: null,
    })
    const client = createTestQueryClient()

    renderHook(() => useServerDetail(orgId, serverId), {
      wrapper: createWrapper(client),
    })

    const key = queryKeys.org(orgId).servers.detail(serverId)
    await waitFor(() => {
      expect(client.getQueryCache().find({ queryKey: key })).toBeTruthy()
    })
    expect(
      resolveRefetchInterval(client, key, {
        id: serverId,
        connected: false,
        statusChangedAt: null,
      }),
    ).toBe(SERVER_INITIALIZING_POLL_MS)
    expect(resolveRefetchInterval(client, key, null)).toBe(SERVERS_REFRESH_MS)
    expect(
      resolveRefetchInterval(client, key, {
        id: serverId,
        connected: true,
        statusChangedAt: '2026-01-01T00:00:00.000Z',
      }),
    ).toBe(SERVERS_REFRESH_MS)
  })

  it('useServersUpdateStatus does not poll unless asked', async () => {
    fetchServersUpdateStatus.mockResolvedValue({
      servers: [{ serverId, status: 'updating' }],
    })
    const client = createTestQueryClient()

    renderHook(() => useServersUpdateStatus(orgId), {
      wrapper: createWrapper(client),
    })

    const key = queryKeys.org(orgId).servers.updatesBatch
    await waitFor(() => {
      expect(client.getQueryCache().find({ queryKey: key })).toBeTruthy()
    })
    expect(
      resolveRefetchInterval(client, key, {
        servers: [{ serverId, status: 'updating' }],
      }),
    ).toBe(false)
  })

  it('useServersUpdateStatus stops polling when no host is updating', async () => {
    fetchServersUpdateStatus.mockResolvedValue({
      servers: [{ serverId, status: 'idle' }],
    })
    const client = createTestQueryClient()

    renderHook(
      () => useServersUpdateStatus(orgId, { pollWhileUpdating: true }),
      { wrapper: createWrapper(client) },
    )

    const key = queryKeys.org(orgId).servers.updatesBatch
    await waitFor(() => {
      expect(
        resolveRefetchInterval(client, key, {
          servers: [{ serverId, status: 'idle' }],
        }),
      ).toBe(false)
    })
    expect(
      resolveRefetchInterval(client, key, {
        servers: [{ serverId, status: 'updating' }],
      }),
    ).toBe(UPDATE_PROGRESS_POLL_MS)
  })

  it('useServerMetricsSeries evaluates a getter at fetch time', async () => {
    const range = {
      fromIso: '2026-01-01T00:00:00.000Z',
      toIso: '2026-01-02T00:00:00.000Z',
      metrics: ['host.cpu.busyPercent'],
    }
    fetchServerMetricsSeries.mockResolvedValue({
      host: { points: [] },
      entities: [],
    })

    const { result } = renderHook(
      () => useServerMetricsSeries(orgId, serverId, () => range),
      { wrapper: createWrapper() },
    )

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })
    expect(fetchServerMetricsSeries).toHaveBeenCalledWith(
      serverId,
      range,
      orgId,
    )
  })

  it('useServerMetricsSeriesBatches keys on fromIso when rangeKey is omitted', async () => {
    const range = {
      fromIso: '2026-03-01T00:00:00.000Z',
      toIso: '2026-03-02T00:00:00.000Z',
    }
    fetchServerMetricsSeries.mockResolvedValue({
      host: { points: [] },
      entities: [],
    })
    const client = createTestQueryClient()

    renderHook(
      () =>
        useServerMetricsSeriesBatches(
          orgId,
          serverId,
          [['host.cpu.busyPercent']],
          () => range,
        ),
      { wrapper: createWrapper(client) },
    )

    await waitFor(() => {
      expect(
        client.getQueryCache().find({
          queryKey: queryKeys
            .org(orgId)
            .servers.metricsSeries(
              serverId,
              `${range.fromIso}:entities:0`,
            ),
        }),
      ).toBeTruthy()
    })
    expect(fetchServerMetricsSeries).toHaveBeenCalledWith(
      serverId,
      { ...range, metrics: ['host.cpu.busyPercent'] },
      orgId,
    )
  })
})
