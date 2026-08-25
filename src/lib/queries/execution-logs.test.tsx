// @vitest-environment happy-dom
import { QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type {
  CommandLogResponse,
  DeploymentHistoryRecord,
} from '@/lib/instance-api'
import { createAppQueryClient } from '@/lib/query-client'
import {
  accumulateCommandLog,
  classifyCommandLogFailure,
  EMPTY_COMMAND_LOG_SNAPSHOT,
  orderDeploymentsNewestFirst,
  resolveCommandLogState,
  useCommandLog,
  useEnvironmentDeployments,
  type CommandLogSnapshot,
} from './execution-logs'

const { fetchCommandLog, fetchEnvironmentDeployments } = vi.hoisted(() => ({
  fetchCommandLog: vi.fn(),
  fetchEnvironmentDeployments: vi.fn(),
}))

vi.mock('@/lib/instance-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/instance-api')>()
  return {
    ...actual,
    fetchCommandLog,
    fetchEnvironmentDeployments,
  }
})

function createWrapper(client = createAppQueryClient()) {
  return function Wrapper({ children }: Readonly<{ children: React.ReactNode }>) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
}

function logEvent(sequence: number, message: string, stream = 'stdout'): string {
  return `${JSON.stringify({
    commandId: 'cmd-1',
    sequence,
    timestamp: '2026-08-21T12:00:00.000Z',
    stream,
    phase: 'build',
    message,
  })}\n`
}

function response(
  overrides: Partial<CommandLogResponse> = {},
): CommandLogResponse {
  return {
    ok: true,
    text: '',
    nextSeq: 0,
    sealed: false,
    truncated: false,
    exists: true,
    ...overrides,
  }
}

afterEach(() => {
  vi.clearAllMocks()
})

describe('accumulateCommandLog', () => {
  it('appends chunks and advances the cursor', () => {
    const first = accumulateCommandLog(
      EMPTY_COMMAND_LOG_SNAPSHOT,
      response({ text: logEvent(1, 'a'), nextSeq: 1 }),
    )
    const second = accumulateCommandLog(
      first,
      response({ text: logEvent(2, 'b'), nextSeq: 2 }),
    )
    expect(second.lines.map((line) => line.message)).toEqual(['a', 'b'])
    expect(second.nextSeq).toBe(2)
  })

  it('dedupes a replayed chunk instead of doubling the transcript', () => {
    const first = accumulateCommandLog(
      EMPTY_COMMAND_LOG_SNAPSHOT,
      response({ text: logEvent(1, 'a'), nextSeq: 1 }),
    )
    const replayed = accumulateCommandLog(
      first,
      response({ text: logEvent(1, 'a') + logEvent(2, 'b'), nextSeq: 2 }),
    )
    expect(replayed.lines).toHaveLength(2)
  })

  it('never rewinds the cursor on an out-of-order response', () => {
    const first = accumulateCommandLog(
      EMPTY_COMMAND_LOG_SNAPSHOT,
      response({ nextSeq: 5 }),
    )
    expect(accumulateCommandLog(first, response({ nextSeq: 2 })).nextSeq).toBe(5)
  })

  it('keeps truncated and exists sticky across later empty reads', () => {
    const truncated = accumulateCommandLog(
      EMPTY_COMMAND_LOG_SNAPSHOT,
      response({ truncated: true, exists: true }),
    )
    const later = accumulateCommandLog(
      truncated,
      response({ truncated: false, exists: false }),
    )
    expect(later.truncated).toBe(true)
    expect(later.exists).toBe(true)
  })

  it('tracks the seal flag from the latest read', () => {
    const sealed = accumulateCommandLog(
      EMPTY_COMMAND_LOG_SNAPSHOT,
      response({ sealed: true }),
    )
    expect(sealed.sealed).toBe(true)
  })
})

describe('resolveCommandLogState', () => {
  const snapshot = (
    overrides: Partial<CommandLogSnapshot> = {},
  ): CommandLogSnapshot => ({ ...EMPTY_COMMAND_LOG_SNAPSHOT, ...overrides })

  it('is idle when the viewer is not enabled', () => {
    expect(
      resolveCommandLogState({
        enabled: false,
        snapshot: snapshot(),
        error: null,
        hasFetched: false,
      }),
    ).toBe('idle')
  })

  it('waits before the first read lands and while there is no output', () => {
    expect(
      resolveCommandLogState({
        enabled: true,
        snapshot: snapshot(),
        error: null,
        hasFetched: false,
      }),
    ).toBe('waiting')
    expect(
      resolveCommandLogState({
        enabled: true,
        snapshot: snapshot({ exists: false }),
        error: null,
        hasFetched: true,
      }),
    ).toBe('waiting')
  })

  it('streams once lines exist and seals when the transcript is final', () => {
    const lines = [
      {
        seq: 1,
        timestamp: null,
        stream: 'stdout' as const,
        phase: null,
        message: 'a',
      },
    ]
    expect(
      resolveCommandLogState({
        enabled: true,
        snapshot: snapshot({ exists: true, lines }),
        error: null,
        hasFetched: true,
      }),
    ).toBe('streaming')
    expect(
      resolveCommandLogState({
        enabled: true,
        snapshot: snapshot({ exists: true, lines, sealed: true }),
        error: null,
        hasFetched: true,
      }),
    ).toBe('sealed')
  })

  it('reports truncation ahead of the sealed state', () => {
    expect(
      resolveCommandLogState({
        enabled: true,
        snapshot: snapshot({ exists: true, sealed: true, truncated: true }),
        error: null,
        hasFetched: true,
      }),
    ).toBe('truncated')
  })

  it('separates a missing transcript from a permission failure', () => {
    expect(
      resolveCommandLogState({
        enabled: true,
        snapshot: snapshot({ sealed: true, exists: false }),
        error: null,
        hasFetched: true,
      }),
    ).toBe('unavailable')
    expect(
      resolveCommandLogState({
        enabled: true,
        snapshot: snapshot(),
        error: new Error('GET /x failed: HTTP 500'),
        hasFetched: false,
      }),
    ).toBe('unavailable')
    expect(
      resolveCommandLogState({
        enabled: true,
        snapshot: snapshot(),
        error: new Error('GET /x failed: HTTP 403'),
        hasFetched: false,
      }),
    ).toBe('forbidden')
  })

  it('reads a forbidden/unavailable verdict off the snapshot itself', () => {
    expect(
      resolveCommandLogState({
        enabled: true,
        snapshot: snapshot({ access: 'forbidden' }),
        error: null,
        hasFetched: true,
      }),
    ).toBe('forbidden')
    expect(
      resolveCommandLogState({
        enabled: true,
        snapshot: snapshot({ access: 'unavailable' }),
        error: null,
        hasFetched: true,
      }),
    ).toBe('unavailable')
  })
})

describe('classifyCommandLogFailure', () => {
  it('treats a 403 as forbidden and other client errors as unavailable', () => {
    expect(classifyCommandLogFailure(new Error('GET /x failed: HTTP 403'))).toBe(
      'forbidden',
    )
    expect(classifyCommandLogFailure(new Error('GET /x failed: HTTP 404'))).toBe(
      'unavailable',
    )
  })

  it('leaves transient failures to the query retry path', () => {
    expect(classifyCommandLogFailure(new Error('HTTP 500'))).toBeNull()
    expect(classifyCommandLogFailure(new Error('HTTP 429'))).toBeNull()
    expect(classifyCommandLogFailure(new Error('HTTP 408'))).toBeNull()
    expect(classifyCommandLogFailure(new Error('HTTP 425'))).toBeNull()
    expect(classifyCommandLogFailure(new Error('network request failed'))).toBeNull()
    expect(classifyCommandLogFailure('nope')).toBeNull()
  })

  it('treats other 4xx statuses as unavailable', () => {
    expect(classifyCommandLogFailure(new Error('HTTP 410'))).toBe('unavailable')
    expect(classifyCommandLogFailure(new Error('HTTP 422'))).toBe('unavailable')
  })
})

describe('useCommandLog', () => {
  it('resumes from the accumulated cursor and stops once sealed', async () => {
    fetchCommandLog
      .mockResolvedValueOnce(
        response({ text: logEvent(1, 'first'), nextSeq: 1 }),
      )
      .mockResolvedValueOnce(
        response({ text: logEvent(2, 'second'), nextSeq: 2, sealed: true }),
      )

    const { result } = renderHook(
      () => useCommandLog('org-1', 'srv-a', 'cmd-1'),
      { wrapper: createWrapper() },
    )

    await waitFor(() => {
      expect(result.current.snapshot.lines).toHaveLength(1)
    })
    await waitFor(
      () => {
        expect(result.current.snapshot.sealed).toBe(true)
      },
      { timeout: 4000 },
    )

    expect(result.current.snapshot.lines.map((line) => line.message)).toEqual([
      'first',
      'second',
    ])
    expect(fetchCommandLog).toHaveBeenNthCalledWith(1, 'srv-a', 'cmd-1', {
      from: 0,
    })
    expect(fetchCommandLog).toHaveBeenNthCalledWith(2, 'srv-a', 'cmd-1', {
      from: 1,
    })

    const callsAfterSeal = fetchCommandLog.mock.calls.length
    await new Promise((resolve) => setTimeout(resolve, 1300))
    expect(fetchCommandLog.mock.calls).toHaveLength(callsAfterSeal)
  })

  it('renders a local forbidden state and stops polling', async () => {
    const forbidden = new Error('GET /commands/cmd-1/log failed: HTTP 403')
    fetchCommandLog.mockRejectedValue(forbidden)
    const onError = vi.fn()
    const client = createAppQueryClient()
    client.getQueryCache().subscribe((event) => {
      if (event.type === 'updated' && event.query.state.error) onError()
    })

    const { result } = renderHook(
      () => useCommandLog('org-1', 'srv-a', 'cmd-1'),
      { wrapper: createWrapper(client) },
    )

    await waitFor(() => {
      expect(result.current.state).toBe('forbidden')
    })
    // The 403 became viewer state — it never surfaced as a query error, so the
    // app-wide forbidden recovery in query-client.ts is not triggered.
    expect(result.current.error).toBeNull()
    expect(onError).not.toHaveBeenCalled()

    const callsAfterForbidden = fetchCommandLog.mock.calls.length
    await new Promise((resolve) => setTimeout(resolve, 1300))
    expect(fetchCommandLog.mock.calls).toHaveLength(callsAfterForbidden)
  })

  it('stops polling a durably unavailable transcript', async () => {
    fetchCommandLog.mockRejectedValue(new Error('GET /x failed: HTTP 404'))
    const { result } = renderHook(
      () => useCommandLog('org-1', 'srv-a', 'cmd-1'),
      { wrapper: createWrapper() },
    )
    await waitFor(() => {
      expect(result.current.state).toBe('unavailable')
    })
    const calls = fetchCommandLog.mock.calls.length
    await new Promise((resolve) => setTimeout(resolve, 1300))
    expect(fetchCommandLog.mock.calls).toHaveLength(calls)
  })

  it('does not fetch without a command id', () => {
    renderHook(() => useCommandLog('org-1', 'srv-a', null), {
      wrapper: createWrapper(),
    })
    expect(fetchCommandLog).not.toHaveBeenCalled()
  })

  it('reads a terminal transcript once when polling is disabled', async () => {
    fetchCommandLog.mockResolvedValue(
      response({ text: logEvent(1, 'done'), nextSeq: 1, sealed: true }),
    )
    const { result } = renderHook(
      () => useCommandLog('org-1', 'srv-a', 'cmd-1', { poll: false }),
      { wrapper: createWrapper() },
    )
    await waitFor(() => {
      expect(result.current.state).toBe('sealed')
    })
    expect(fetchCommandLog).toHaveBeenCalledTimes(1)
  })

  it('resets the accumulator when the viewer is disabled', async () => {
    fetchCommandLog.mockResolvedValue(
      response({ text: logEvent(1, 'a'), nextSeq: 1 }),
    )
    const { result, rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) =>
        useCommandLog('org-1', 'srv-a', 'cmd-1', { enabled, poll: false }),
      {
        wrapper: createWrapper(),
        initialProps: { enabled: true },
      },
    )
    await waitFor(() => {
      expect(result.current.snapshot.lines).toHaveLength(1)
    })

    rerender({ enabled: false })
    await waitFor(() => {
      expect(result.current.state).toBe('idle')
    })
  })

  it('rethrows transient failures as query errors', async () => {
    fetchCommandLog.mockRejectedValue(new Error('HTTP 500: boom'))
    const client = createAppQueryClient()
    client.setDefaultOptions({ queries: { retry: false } })
    const { result } = renderHook(
      () => useCommandLog('org-1', 'srv-a', 'cmd-1', { poll: false }),
      { wrapper: createWrapper(client) },
    )
    await waitFor(() => {
      expect(result.current.error).not.toBeNull()
    })
    expect(result.current.state).toBe('unavailable')
  })
})

describe('useEnvironmentDeployments', () => {
  it('fetches one page and does not poll', async () => {
    fetchEnvironmentDeployments.mockResolvedValue({
      ok: true,
      deployments: [],
      nextCursor: null,
    })
    const { result } = renderHook(
      () => useEnvironmentDeployments('org-1', 'env-1'),
      { wrapper: createWrapper() },
    )
    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })
    expect(fetchEnvironmentDeployments).toHaveBeenCalledWith('env-1', {})
  })

  it('passes an explicit limit through to the fetch', async () => {
    fetchEnvironmentDeployments.mockResolvedValue({
      ok: true,
      deployments: [],
      nextCursor: null,
    })
    const { result } = renderHook(
      () => useEnvironmentDeployments('org-1', 'env-1', { limit: 25 }),
      { wrapper: createWrapper() },
    )
    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })
    expect(fetchEnvironmentDeployments).toHaveBeenCalledWith('env-1', {
      limit: 25,
    })
  })

  it('stays disabled without an environment', () => {
    renderHook(() => useEnvironmentDeployments('org-1', ''), {
      wrapper: createWrapper(),
    })
    expect(fetchEnvironmentDeployments).not.toHaveBeenCalled()
  })

  it('stays disabled when enabled is false', () => {
    renderHook(
      () => useEnvironmentDeployments('org-1', 'env-1', { enabled: false }),
      { wrapper: createWrapper() },
    )
    expect(fetchEnvironmentDeployments).not.toHaveBeenCalled()
  })
})

describe('orderDeploymentsNewestFirst', () => {
  it('sorts by descending id (UUIDv7 order is time order)', () => {
    const rows = orderDeploymentsNewestFirst([
      { id: 'a' },
      { id: 'c' },
      { id: 'b' },
    ] as unknown as DeploymentHistoryRecord[])
    expect(rows.map((row) => row.id)).toEqual(['c', 'b', 'a'])
  })

  it('handles a missing page', () => {
    expect(orderDeploymentsNewestFirst(undefined)).toEqual([])
  })
})
