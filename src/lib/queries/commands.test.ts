import { describe, expect, it } from 'vitest'
import type { CommandRecord, CommandStatus } from '@/lib/instance-api'
import {
  hasPendingTrackedCommands,
  mergeTrackedCommandEntries,
  type TrackedCommandEntry,
} from './commands'

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
