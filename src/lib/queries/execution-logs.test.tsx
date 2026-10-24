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
  COMMAND_LOG_MAX_PAGES_PER_READ,
  COMMAND_LOG_POLL_MS,
  commandLogRefetchInterval,
  EMPTY_COMMAND_LOG_SNAPSHOT,
  orderDeploymentsNewestFirst,
  resolveCommandLogState,
  shouldReadNextPage,
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
      // Sealed and the cursor moved: one more read confirms nothing is left.
      .mockResolvedValueOnce(response({ nextSeq: 2, sealed: true }))

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
      { timeout: 8000 },
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

  it('does not fetch when both identities are missing', () => {
    const { result } = renderHook(() => useCommandLog('org-1', null, null), {
      wrapper: createWrapper(),
    })
    expect(result.current.snapshot).toEqual(EMPTY_COMMAND_LOG_SNAPSHOT)
    expect(fetchCommandLog).not.toHaveBeenCalled()
  })

  it('reads a terminal transcript to the end once when polling is disabled', async () => {
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
    // The second read (from 1) returns the same cursor, so reading stops there.
    expect(fetchCommandLog).toHaveBeenCalledTimes(2)
    expect(fetchCommandLog).toHaveBeenLastCalledWith('srv-a', 'cmd-1', { from: 1 })
    expect(result.current.snapshot.lines).toHaveLength(1)
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

/**
 * A fake log endpoint that, like the real one, returns one chunk per call from
 * `from` and reports `sealed` for the whole log, not for the slice returned.
 */
function pagedEndpoint(messages: readonly string[], sealed = true) {
  return async (_server: string, _command: string, options?: { from?: number }) => {
    const from = options?.from ?? 0
    if (from >= messages.length) return response({ nextSeq: from, sealed })
    return response({
      text: logEvent(from + 1, messages[from] ?? ''),
      nextSeq: from + 1,
      sealed,
    })
  }
}

describe('paged transcript reads', () => {
  it('reads every page of a finished log, not just the first', async () => {
    fetchCommandLog.mockImplementation(pagedEndpoint(['one', 'two', 'three']))
    const { result } = renderHook(
      () => useCommandLog('org-1', 'srv-a', 'cmd-1', { poll: false }),
      { wrapper: createWrapper() },
    )
    await waitFor(() => {
      expect(result.current.snapshot.lines.map((line) => line.message)).toEqual([
        'one',
        'two',
        'three',
      ])
    })
    // Three pages plus the read that found the cursor had stopped.
    expect(fetchCommandLog).toHaveBeenCalledTimes(4)
    expect(result.current.snapshot.moreToRead).toBe(false)
    const calls = fetchCommandLog.mock.calls.length
    await new Promise((resolve) => setTimeout(resolve, 1300))
    expect(fetchCommandLog.mock.calls).toHaveLength(calls)
  })

  it('a live log takes one page per poll and drains the rest once sealed', async () => {
    fetchCommandLog.mockImplementation(pagedEndpoint(['a', 'b', 'c'], false))
    const { result } = renderHook(() => useCommandLog('org-1', 'srv-a', 'cmd-1'), {
      wrapper: createWrapper(),
    })
    await waitFor(() => {
      expect(result.current.snapshot.lines).toHaveLength(1)
    })
    expect(fetchCommandLog).toHaveBeenCalledTimes(1)
    // The deploy ends: the next poll sees `sealed` and reads to the end at once.
    fetchCommandLog.mockImplementation(pagedEndpoint(['a', 'b', 'c'], true))
    await waitFor(
      () => {
        expect(result.current.snapshot.lines).toHaveLength(3)
      },
      { timeout: 4000 },
    )
    expect(result.current.snapshot.sealed).toBe(true)
  })

  it('keeps reading on the next poll when the page cap cuts a read short', async () => {
    const messages = Array.from(
      { length: COMMAND_LOG_MAX_PAGES_PER_READ + 2 },
      (_, index) => `line ${index + 1}`,
    )
    fetchCommandLog.mockImplementation(pagedEndpoint(messages))
    const { result } = renderHook(
      () => useCommandLog('org-1', 'srv-a', 'cmd-1', { poll: false }),
      { wrapper: createWrapper() },
    )
    await waitFor(
      () => {
        expect(result.current.snapshot.lines).toHaveLength(messages.length)
      },
      { timeout: 4000 },
    )
    expect(result.current.snapshot.moreToRead).toBe(false)
  })

  it('keeps what it read when a later page fails, and carries on', async () => {
    const endpoint = pagedEndpoint(['one', 'two'])
    fetchCommandLog
      .mockImplementationOnce(endpoint)
      .mockRejectedValueOnce(new Error('HTTP 503: busy'))
      .mockImplementation(endpoint)
    const { result } = renderHook(
      () => useCommandLog('org-1', 'srv-a', 'cmd-1', { poll: false }),
      { wrapper: createWrapper() },
    )
    await waitFor(() => {
      expect(result.current.snapshot.lines).toHaveLength(1)
    })
    await waitFor(
      () => {
        expect(result.current.snapshot.lines).toHaveLength(2)
      },
      { timeout: 4000 },
    )
    expect(result.current.error).toBeNull()
  })
})

describe('shouldReadNextPage', () => {
  it('reads on only when the cursor moved and the log is sealed or not polled', () => {
    expect(shouldReadNextPage(0, { nextSeq: 1, sealed: true }, true)).toBe(true)
    expect(shouldReadNextPage(0, { nextSeq: 1, sealed: false }, false)).toBe(true)
    expect(shouldReadNextPage(0, { nextSeq: 1, sealed: false }, true)).toBe(false)
    expect(shouldReadNextPage(1, { nextSeq: 1, sealed: true }, false)).toBe(false)
  })
})

describe('commandLogRefetchInterval', () => {
  const sealed: CommandLogSnapshot = { ...EMPTY_COMMAND_LOG_SNAPSHOT, sealed: true }
  it('stops a sealed or unpolled log unless there is more to read', () => {
    expect(commandLogRefetchInterval(undefined, true)).toBe(COMMAND_LOG_POLL_MS)
    expect(commandLogRefetchInterval(sealed, true)).toBe(false)
    expect(commandLogRefetchInterval(undefined, false)).toBe(false)
    expect(commandLogRefetchInterval({ ...sealed, moreToRead: true }, false)).toBe(
      COMMAND_LOG_POLL_MS,
    )
    expect(
      commandLogRefetchInterval({ ...sealed, moreToRead: true, access: 'forbidden' }, true),
    ).toBe(false)
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
