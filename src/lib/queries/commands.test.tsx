// @vitest-environment happy-dom
import { QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CommandStatus, CommandStatusRecord } from '@/lib/instance-api'
import { createAppQueryClient } from '@/lib/query-client'
import {
  anyCommandInFlight,
  commandStatusById,
  hasInFlightCommands,
  hasPendingTrackedCommands,
  isTerminalCommandStatus,
  mergeTrackedCommandEntries,
  useCommandRecordsBatch,
  useCommandsBatch,
  type TrackedCommandEntry,
} from './commands'

const { fetchCommandStatuses, fetchCommand } = vi.hoisted(() => ({
  fetchCommandStatuses: vi.fn(),
  fetchCommand: vi.fn(),
}))

vi.mock('@/lib/instance-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/instance-api')>()
  return {
    ...actual,
    fetchCommandStatuses,
    fetchCommand,
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

function command(
  status: CommandStatus,
  serverId = 'srv-a',
  id = `cmd-${status}`,
): CommandStatusRecord {
  return {
    id,
    serverId,
    type: 'server.fabric.reconcile',
    status,
    queuedAt: null,
    startedAt: null,
    finishedAt: null,
    errorCode: null,
    errorMessage: null,
    hasLog: false,
  }
}

describe('isTerminalCommandStatus', () => {
  it('recognizes every terminal status and rejects in-flight ones', () => {
    expect(isTerminalCommandStatus('succeeded')).toBe(true)
    expect(isTerminalCommandStatus('failed')).toBe(true)
    expect(isTerminalCommandStatus('timed_out')).toBe(true)
    expect(isTerminalCommandStatus('cancelled')).toBe(true)
    expect(isTerminalCommandStatus('queued')).toBe(false)
    expect(isTerminalCommandStatus('running')).toBe(false)
  })
})

describe('hasPendingTrackedCommands', () => {
  it('is idle when nothing is tracked', () => {
    expect(hasPendingTrackedCommands([], undefined)).toBe(false)
    expect(hasPendingTrackedCommands([], [command('running')])).toBe(false)
  })

  it('treats a tracked batch without command data as still in flight', () => {
    const tracked: TrackedCommandEntry[] = [
      { serverId: 'srv-a', commandId: 'cmd-1' },
    ]
    expect(hasPendingTrackedCommands(tracked, undefined)).toBe(true)
    expect(hasPendingTrackedCommands(tracked, [])).toBe(true)
  })

  it('stays pending until every tracked command is terminal', () => {
    const tracked: TrackedCommandEntry[] = [
      { serverId: 'srv-a', commandId: 'cmd-1' },
      { serverId: 'srv-b', commandId: 'cmd-2' },
    ]
    expect(
      hasPendingTrackedCommands(tracked, [
        command('running', 'srv-a'),
        command('succeeded', 'srv-b'),
      ]),
    ).toBe(true)
    expect(
      hasPendingTrackedCommands(tracked, [
        command('succeeded', 'srv-a'),
        command('failed', 'srv-b'),
      ]),
    ).toBe(false)
  })
})

describe('hasInFlightCommands', () => {
  it('is false for empty or terminal-only batches', () => {
    expect(hasInFlightCommands(undefined)).toBe(false)
    expect(hasInFlightCommands([])).toBe(false)
    expect(hasInFlightCommands([command('succeeded')])).toBe(false)
  })

  it('is true when any command is non-terminal', () => {
    expect(hasInFlightCommands([command('running')])).toBe(true)
    expect(
      hasInFlightCommands([command('succeeded'), command('queued')]),
    ).toBe(true)
  })

  it('anyCommandInFlight mirrors hasInFlightCommands', () => {
    expect(anyCommandInFlight([command('running')])).toBe(true)
    expect(anyCommandInFlight([command('failed')])).toBe(false)
  })
})

describe('mergeTrackedCommandEntries', () => {
  it('keeps earlier command ids and appends new ones', () => {
    const first: TrackedCommandEntry[] = [
      { serverId: 'srv-a', commandId: 'cmd-1' },
    ]
    const second: TrackedCommandEntry[] = [
      { serverId: 'srv-a', commandId: 'cmd-1' },
      { serverId: 'srv-b', commandId: 'cmd-2' },
    ]
    expect(mergeTrackedCommandEntries(first, second)).toEqual([
      { serverId: 'srv-a', commandId: 'cmd-1' },
      { serverId: 'srv-b', commandId: 'cmd-2' },
    ])
  })

  it('returns current unchanged when next adds nothing new', () => {
    const current: TrackedCommandEntry[] = [
      { serverId: 'srv-a', commandId: 'cmd-1' },
    ]
    expect(
      mergeTrackedCommandEntries(current, [
        { serverId: 'srv-a', commandId: 'cmd-1' },
      ]),
    ).toEqual(current)
  })
})

describe('useCommandsBatch', () => {
  const orgId = 'org-1'

  it('fetches every tracked command in one batched request', async () => {
    fetchCommandStatuses.mockResolvedValueOnce([
      command('succeeded', 'srv-b', 'cmd-succeeded'),
      command('running', 'srv-a', 'cmd-running'),
    ])

    const entries: TrackedCommandEntry[] = [
      { serverId: 'srv-a', commandId: 'cmd-running' },
      { serverId: 'srv-b', commandId: 'cmd-succeeded' },
      { serverId: 'srv-c', commandId: 'cmd-invisible' },
    ]

    const { result } = renderHook(() => useCommandsBatch(orgId, entries), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })
    expect(fetchCommandStatuses).toHaveBeenCalledTimes(1)
    expect(fetchCommandStatuses).toHaveBeenCalledWith([
      'cmd-running',
      'cmd-succeeded',
      'cmd-invisible',
    ])
    // Ids the session cannot read are omitted entirely, so positions no longer
    // line up with `entries` — consumers must join on `commandId`.
    expect(result.current.data?.map((row) => row.id)).toEqual([
      'cmd-running',
      'cmd-succeeded',
    ])
    const byId = commandStatusById(result.current.data)
    expect(byId.get('cmd-running')?.status).toBe('running')
    expect(byId.get('cmd-succeeded')?.status).toBe('succeeded')
    expect(byId.has('cmd-invisible')).toBe(false)
  })

  it('still issues exactly one request for a large batch', async () => {
    const entries: TrackedCommandEntry[] = Array.from(
      { length: 12 },
      (_, index) => ({ serverId: 'srv-a', commandId: `cmd-${index}` }),
    )
    fetchCommandStatuses.mockResolvedValueOnce(
      entries.map((entry) => command('running', entry.serverId, entry.commandId)),
    )

    const { result } = renderHook(() => useCommandsBatch(orgId, entries), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })
    expect(fetchCommandStatuses).toHaveBeenCalledTimes(1)
    expect(result.current.data).toHaveLength(12)
  })

  it('stays idle when no entries are tracked', () => {
    const { result } = renderHook(() => useCommandsBatch(orgId, []), {
      wrapper: createWrapper(),
    })
    expect(result.current.fetchStatus).toBe('idle')
    expect(fetchCommandStatuses).not.toHaveBeenCalled()
  })

  it('stays idle when enabled is false or org id is empty', () => {
    const entries: TrackedCommandEntry[] = [
      { serverId: 'srv-a', commandId: 'cmd-1' },
    ]
    const disabled = renderHook(
      () => useCommandsBatch(orgId, entries, { enabled: false }),
      { wrapper: createWrapper() },
    )
    const emptyOrg = renderHook(() => useCommandsBatch('', entries), {
      wrapper: createWrapper(),
    })
    expect(disabled.result.current.fetchStatus).toBe('idle')
    expect(emptyOrg.result.current.fetchStatus).toBe('idle')
    expect(fetchCommandStatuses).not.toHaveBeenCalled()
  })
})

describe('useCommandRecordsBatch', () => {
  const orgId = 'org-1'

  it('fetches a full record per tracked entry', async () => {
    fetchCommand
      .mockResolvedValueOnce({
        id: 'cmd-1',
        serverId: 'srv-a',
        status: 'succeeded',
        type: 'daemon.ping',
      })
      .mockResolvedValueOnce({
        id: 'cmd-2',
        serverId: 'srv-b',
        status: 'running',
        type: 'daemon.ping',
      })

    const entries: TrackedCommandEntry[] = [
      { serverId: 'srv-a', commandId: 'cmd-1' },
      { serverId: 'srv-b', commandId: 'cmd-2' },
    ]

    const { result } = renderHook(
      () => useCommandRecordsBatch(orgId, entries),
      { wrapper: createWrapper() },
    )

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })
    expect(fetchCommand).toHaveBeenCalledTimes(2)
    expect(fetchCommand).toHaveBeenNthCalledWith(1, 'srv-a', 'cmd-1')
    expect(fetchCommand).toHaveBeenNthCalledWith(2, 'srv-b', 'cmd-2')
    expect(result.current.data?.map((row) => row.id)).toEqual([
      'cmd-1',
      'cmd-2',
    ])
  })

  it('stays idle without entries', () => {
    const { result } = renderHook(() => useCommandRecordsBatch(orgId, []), {
      wrapper: createWrapper(),
    })
    expect(result.current.fetchStatus).toBe('idle')
    expect(fetchCommand).not.toHaveBeenCalled()
  })
})

describe('commandStatusById', () => {
  it('is empty for missing or empty batches', () => {
    expect(commandStatusById(undefined).size).toBe(0)
    expect(commandStatusById([]).size).toBe(0)
  })

  it('keys every row by command id so gaps cannot shift the join', () => {
    const rows = [
      command('running', 'srv-a', 'cmd-1'),
      command('succeeded', 'srv-c', 'cmd-3'),
    ]
    const byId = commandStatusById(rows)
    expect(byId.get('cmd-1')?.serverId).toBe('srv-a')
    // 'cmd-2' was dropped by the server; 'cmd-3' must not slide into its slot.
    expect(byId.get('cmd-2')).toBeUndefined()
    expect(byId.get('cmd-3')?.serverId).toBe('srv-c')
  })
})
