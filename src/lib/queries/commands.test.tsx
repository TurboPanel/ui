// @vitest-environment happy-dom
import { QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CommandRecord, CommandStatus } from '@/lib/instance-api'
import { createAppQueryClient } from '@/lib/query-client'
import {
  anyCommandInFlight,
  hasInFlightCommands,
  hasPendingTrackedCommands,
  mergeTrackedCommandEntries,
  useCommandsBatch,
  type TrackedCommandEntry,
} from './commands'

const { fetchCommand } = vi.hoisted(() => ({
  fetchCommand: vi.fn(),
}))

vi.mock('@/lib/instance-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/instance-api')>()
  return {
    ...actual,
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

function command(status: CommandStatus, serverId = 'srv-a'): CommandRecord {
  return {
    id: `cmd-${status}`,
    serverId,
    actorEntityType: 'user',
    actorEntityId: 'user-1',
    type: 'server.fabric.reconcile',
    status,
    payload: null,
    result: null,
    error: null,
    attempts: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    queuedAt: null,
    dispatchStartedAt: null,
    sentAt: null,
    ackedAt: null,
    startedAt: null,
    finishedAt: null,
    expiresAt: null,
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

  it('fetches tracked commands in parallel', async () => {
    fetchCommand
      .mockResolvedValueOnce(command('running', 'srv-a'))
      .mockResolvedValueOnce(command('succeeded', 'srv-b'))

    const entries: TrackedCommandEntry[] = [
      { serverId: 'srv-a', commandId: 'cmd-running' },
      { serverId: 'srv-b', commandId: 'cmd-succeeded' },
    ]

    const { result } = renderHook(() => useCommandsBatch(orgId, entries), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })
    expect(fetchCommand).toHaveBeenCalledTimes(2)
    expect(result.current.data).toHaveLength(2)
  })

  it('stays idle when no entries are tracked', () => {
    const { result } = renderHook(() => useCommandsBatch(orgId, []), {
      wrapper: createWrapper(),
    })
    expect(result.current.fetchStatus).toBe('idle')
    expect(fetchCommand).not.toHaveBeenCalled()
  })
})
