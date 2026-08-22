// @vitest-environment happy-dom
import { QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type {
  ContainerLogPageResponse,
  OrgContainerLogSettings,
} from '@/lib/instance-api'
import { createAppQueryClient, queryKeys } from '@/lib/query-client'
import {
  CONTAINER_LOG_LIVE_POLL_MS,
  classifyContainerLogFailure,
  containerLogAvailability,
  containerLogLivePollInterval,
  flattenContainerLogPages,
  useContainerLogsQuery,
  useSaveContainerLogSettings,
} from './container-logs'

const { fetchContainerLogs, saveOrgContainerLogSettings } = vi.hoisted(() => ({
  fetchContainerLogs: vi.fn(),
  saveOrgContainerLogSettings: vi.fn(),
}))

vi.mock('@/lib/instance-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/instance-api')>()
  return {
    ...actual,
    fetchContainerLogs,
    saveOrgContainerLogSettings,
  }
})

function createWrapper(client = createAppQueryClient()) {
  return function Wrapper({ children }: Readonly<{ children: React.ReactNode }>) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
}

const FILTER = {
  from: '2026-08-22T11:45:00.000Z',
  to: '2026-08-22T12:00:00.000Z',
  limit: 200,
} as const

function page(
  overrides: Partial<ContainerLogPageResponse> = {},
): ContainerLogPageResponse {
  return { events: [], nextCursor: null, ...overrides }
}

function event(message: string) {
  return {
    timestamp: '2026-08-22T11:59:00.000Z',
    organizationId: 'org-1',
    serverId: 'srv-1',
    environmentId: null,
    serviceId: null,
    containerId: 'container-1',
    stream: 'stdout' as const,
    message,
  }
}

afterEach(() => {
  vi.clearAllMocks()
})

describe('classifyContainerLogFailure', () => {
  it('reads the disabled and unavailable codes out of the 503 message', () => {
    expect(
      classifyContainerLogFailure(
        new Error('/container-logs failed: HTTP 503: container_logs_disabled'),
      ),
    ).toBe('disabled')
    expect(
      classifyContainerLogFailure(
        new Error(
          '/container-logs failed: HTTP 503: container_logs_unavailable',
        ),
      ),
    ).toBe('unavailable')
  })

  it('leaves every other failure to the query layer', () => {
    expect(
      classifyContainerLogFailure(new Error('failed: HTTP 500')),
    ).toBeNull()
    expect(classifyContainerLogFailure('not an error')).toBeNull()
  })
})

describe('useContainerLogsQuery', () => {
  it('folds a disabled 503 into local state instead of erroring or retrying', async () => {
    fetchContainerLogs.mockRejectedValue(
      new Error('/container-logs failed: HTTP 503: container_logs_disabled'),
    )
    const { result } = renderHook(
      () => useContainerLogsQuery('org-1', FILTER),
      { wrapper: createWrapper() },
    )

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.isError).toBe(false)
    expect(containerLogAvailability(result.current.data?.pages)).toBe(
      'disabled',
    )
    expect(fetchContainerLogs).toHaveBeenCalledTimes(1)
  })

  it('accumulates pages newest-first across a cursor fetch', async () => {
    fetchContainerLogs
      .mockResolvedValueOnce(
        page({ events: [event('newest')], nextCursor: 'cursor-1' }),
      )
      .mockResolvedValueOnce(page({ events: [event('older')] }))

    const { result } = renderHook(
      () => useContainerLogsQuery('org-1', FILTER),
      { wrapper: createWrapper() },
    )
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.hasNextPage).toBe(true)

    await result.current.fetchNextPage()
    await waitFor(() =>
      expect(flattenContainerLogPages(result.current.data?.pages)).toHaveLength(
        2,
      ),
    )
    expect(
      flattenContainerLogPages(result.current.data?.pages).map(
        (row) => row.message,
      ),
    ).toEqual(['newest', 'older'])
    expect(fetchContainerLogs).toHaveBeenLastCalledWith('org-1', {
      ...FILTER,
      cursor: 'cursor-1',
    })
    expect(result.current.hasNextPage).toBe(false)
  })
})

describe('useSaveContainerLogSettings', () => {
  it('writes the saved switch straight into the settings cache', async () => {
    const saved: OrgContainerLogSettings & { ok: true } = {
      ok: true,
      containerLogsEnabled: true,
      retentionDays: 30,
    }
    saveOrgContainerLogSettings.mockResolvedValue(saved)
    const client = createAppQueryClient()
    const onFailure = vi.fn()

    const { result } = renderHook(
      () => useSaveContainerLogSettings('org-1', onFailure, 'fallback'),
      { wrapper: createWrapper(client) },
    )

    await result.current.run({ containerLogsEnabled: true })

    await waitFor(() =>
      expect(
        client.getQueryData(queryKeys.org('org-1').containerLogs.settings),
      ).toEqual({ containerLogsEnabled: true, retentionDays: 30 }),
    )
    expect(onFailure).not.toHaveBeenCalled()
  })

  it('reports a failure message rather than throwing at the caller', async () => {
    saveOrgContainerLogSettings.mockRejectedValue(new Error('nope'))
    const onFailure = vi.fn()

    const { result } = renderHook(
      () => useSaveContainerLogSettings('org-1', onFailure, 'fallback'),
      { wrapper: createWrapper() },
    )

    const outcome = await result.current.run({ containerLogsEnabled: false })
    expect(outcome).toEqual({ ok: false, error: 'nope' })
    await waitFor(() => expect(onFailure).toHaveBeenCalledWith('nope'))
  })
})

describe('containerLogLivePollInterval', () => {
  // The cadence is React Query's, not a component timer's — these assertions
  // pin *when* it is allowed to run at all.
  it('polls while the feature is answering normally', () => {
    expect(
      containerLogLivePollInterval([
        { events: [], nextCursor: null, availability: 'ok' },
      ]),
    ).toBe(CONTAINER_LOG_LIVE_POLL_MS)
  })

  it('honours an explicit cadence', () => {
    expect(
      containerLogLivePollInterval(
        [{ events: [], nextCursor: null, availability: 'ok' }],
        1234,
      ),
    ).toBe(1234)
  })

  it('stops polling once the read reports disabled or unavailable', () => {
    for (const availability of ['disabled', 'unavailable'] as const) {
      expect(
        containerLogLivePollInterval([
          { events: [], nextCursor: null, availability },
        ]),
      ).toBe(false)
    }
  })
})

describe('useContainerLogsQuery live mode', () => {
  it('enables polling only in live mode', async () => {
    fetchContainerLogs.mockResolvedValue(page())
    const now = vi.fn(() => Date.parse('2026-08-22T12:00:00.000Z'))

    const idle = renderHook(() => useContainerLogsQuery('org-1', FILTER), {
      wrapper: createWrapper(),
    })
    await waitFor(() => expect(idle.result.current.isSuccess).toBe(true))
    // A pinned window is read once; nothing schedules a second fetch.
    expect(fetchContainerLogs).toHaveBeenCalledTimes(1)
    expect(fetchContainerLogs).toHaveBeenLastCalledWith('org-1', FILTER)

    fetchContainerLogs.mockClear()
    const tail = renderHook(
      () =>
        useContainerLogsQuery('org-1', FILTER, {
          live: true,
          liveRangeId: '15m',
          now,
          pollMs: 20,
        }),
      { wrapper: createWrapper() },
    )
    await waitFor(() => expect(tail.result.current.isSuccess).toBe(true))
    // The window is re-resolved from the range id, not read off the filter.
    expect(fetchContainerLogs).toHaveBeenLastCalledWith('org-1', {
      ...FILTER,
      from: '2026-08-22T11:45:00.000Z',
      to: '2026-08-22T12:00:00.000Z',
    })
    await waitFor(() =>
      expect(fetchContainerLogs.mock.calls.length).toBeGreaterThan(1),
    )
    expect(now.mock.calls.length).toBeGreaterThan(1)
  })

  it('stops polling when the read comes back disabled', async () => {
    fetchContainerLogs.mockRejectedValue(
      new Error('/container-logs failed: HTTP 503: container_logs_disabled'),
    )
    const { result } = renderHook(
      () =>
        useContainerLogsQuery('org-1', FILTER, {
          live: true,
          liveRangeId: '15m',
          pollMs: 10,
        }),
      { wrapper: createWrapper() },
    )
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(containerLogAvailability(result.current.data?.pages)).toBe(
      'disabled',
    )

    const afterFirst = fetchContainerLogs.mock.calls.length
    await new Promise((resolve) => setTimeout(resolve, 80))
    expect(fetchContainerLogs.mock.calls).toHaveLength(afterFirst)
  })

  it('does not poll when live mode is off', async () => {
    fetchContainerLogs.mockResolvedValue(page())
    const { result } = renderHook(
      () =>
        useContainerLogsQuery('org-1', FILTER, {
          live: false,
          liveRangeId: '15m',
          pollMs: 10,
        }),
      { wrapper: createWrapper() },
    )
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    await new Promise((resolve) => setTimeout(resolve, 80))
    expect(fetchContainerLogs).toHaveBeenCalledTimes(1)
  })
})
