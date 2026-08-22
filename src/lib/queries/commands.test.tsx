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
  mergeTrackedCommandEntries,
  useCommandsBatch,
  type TrackedCommandEntry,
} from './commands'

const { fetchCommandStatuses } = vi.hoisted(() => ({
  fetchCommandStatuses: vi.fn(),
}))

vi.mock('@/lib/instance-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/instance-api')>()
  return {
    ...actual,
    fetchCommandStatuses,
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
