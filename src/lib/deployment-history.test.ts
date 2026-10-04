import { describe, expect, it } from 'vitest'
import type { CommandStatus, DeploymentHistoryRecord } from '@/lib/instance-api'
import {
  canCancelDeployment,
  cancelTooLateNote,
  cancelledDeploymentNote,
  findInFlightDeployment,
  isDeploymentCancelling,
  isDeploymentInFlight,
  deploymentServerLabel,
  deploymentStatusTone,
  deploymentStrategyLabel,
  formatDeployActor,
  formatDeployDuration,
  formatDeployTrigger,
  formatDeployTimestamp,
  groupDeploymentsByGeneration,
  worstDeploymentStatus,
  worstStrategyOutcome,
  stalledDeploymentHint,
} from './deployment-history'

function row(
  overrides: Partial<DeploymentHistoryRecord> & { id: string },
): DeploymentHistoryRecord {
  return {
    commandId: overrides.id,
    generation: 7,
    desiredHash: null,
    replicaCounts: null,
    serverId: 'srv-a',
    serverName: 'web-01',
    status: 'succeeded' as CommandStatus,
    actorEntityType: 'user',
    actorEntityId: 'usr-1',
    queuedAt: '2026-08-21T12:00:00.000Z',
    startedAt: '2026-08-21T12:00:01.000Z',
    finishedAt: '2026-08-21T12:00:05.000Z',
    durationMs: 4000,
    errorCode: null,
    errorMessage: null,
    hasLog: true,
    ...overrides,
  }
}

describe('worstDeploymentStatus', () => {
  it('prefers a failure over a success', () => {
    expect(
      worstDeploymentStatus([
        row({ id: 'a', status: 'succeeded' }),
        row({ id: 'b', status: 'failed' }),
      ]),
    ).toBe('failed')
  })

  it('prefers an in-flight attempt over a success', () => {
    expect(
      worstDeploymentStatus([
        row({ id: 'a', status: 'succeeded' }),
        row({ id: 'b', status: 'running' }),
      ]),
    ).toBe('running')
  })

  it('prefers a running host over one still queued', () => {
    expect(
      worstDeploymentStatus([
        row({ id: 'a', status: 'queued' }),
        row({ id: 'b', status: 'running' }),
      ]),
    ).toBe('running')
    // Row order must not decide the label.
    expect(
      worstDeploymentStatus([
        row({ id: 'a', status: 'running' }),
        row({ id: 'b', status: 'queued' }),
      ]),
    ).toBe('running')
  })

  it('keeps a failure ahead of an in-flight attempt', () => {
    expect(
      worstDeploymentStatus([
        row({ id: 'a', status: 'running' }),
        row({ id: 'b', status: 'failed' }),
        row({ id: 'c', status: 'queued' }),
      ]),
    ).toBe('failed')
  })

  it('falls back to queued for an empty fan-out', () => {
    expect(worstDeploymentStatus([])).toBe('queued')
  })

  it('ranks an unlisted status between succeeded and the pre-run states', () => {
    expect(
      worstDeploymentStatus([
        row({ id: 'a', status: 'succeeded' }),
        row({ id: 'b', status: 'unknown' as CommandStatus }),
      ]),
    ).toBe('unknown')
    expect(
      worstDeploymentStatus([
        row({ id: 'a', status: 'queued' }),
        row({ id: 'b', status: 'unknown' as CommandStatus }),
      ]),
    ).toBe('queued')
  })

  it.each<[CommandStatus, CommandStatus, CommandStatus]>([
    ['succeeded', 'timed_out', 'timed_out'],
    ['running', 'cancelled', 'cancelled'],
    ['cancelled', 'failed', 'failed'],
    ['queued', 'dispatching', 'queued'],
    ['dispatching', 'sent', 'dispatching'],
    ['acked', 'running', 'running'],
    ['timed_out', 'failed', 'timed_out'],
  ])('ranks %s vs %s as %s', (first, second, expected) => {
    expect(
      worstDeploymentStatus([
        row({ id: 'a', status: first }),
        row({ id: 'b', status: second }),
      ]),
    ).toBe(expected)
  })
})

describe('groupDeploymentsByGeneration', () => {
  it('groups rows sharing a generation into one deploy', () => {
    const groups = groupDeploymentsByGeneration([
      row({ id: 'a', serverId: 'srv-a' }),
      row({ id: 'b', serverId: 'srv-b', durationMs: 9000 }),
    ])
    expect(groups).toHaveLength(1)
    expect(groups[0]?.commands).toHaveLength(2)
    expect(groups[0]?.durationMs).toBe(9000)
  })

  it('keeps rows with no generation separate', () => {
    const groups = groupDeploymentsByGeneration([
      row({ id: 'a', generation: null }),
      row({ id: 'b', generation: null }),
    ])
    expect(groups).toHaveLength(2)
  })

  it('reports an unknown duration while any attempt is still running', () => {
    const groups = groupDeploymentsByGeneration([
      row({ id: 'a' }),
      row({ id: 'b', serverId: 'srv-b', status: 'running', durationMs: null }),
    ])
    expect(groups[0]?.durationMs).toBeNull()
    expect(groups[0]?.status).toBe('running')
  })

  it('labels a mixed queued-plus-running fan-out as running', () => {
    const groups = groupDeploymentsByGeneration([
      row({ id: 'a', status: 'queued', startedAt: null, durationMs: null }),
      row({ id: 'b', serverId: 'srv-b', status: 'running', durationMs: null }),
    ])
    expect(groups).toHaveLength(1)
    expect(groups[0]?.status).toBe('running')
    expect(deploymentStatusTone(groups[0]?.status ?? 'queued').label).toBe(
      'Running',
    )
  })

  it('uses the earliest start across the fan-out', () => {
    const groups = groupDeploymentsByGeneration([
      row({ id: 'a', startedAt: '2026-08-21T12:00:09.000Z' }),
      row({ id: 'b', serverId: 'srv-b', startedAt: '2026-08-21T12:00:02.000Z' }),
    ])
    expect(groups[0]?.startedAt).toBe('2026-08-21T12:00:02.000Z')
  })

  it('falls back to queuedAt and skips rows with no timestamp', () => {
    const groups = groupDeploymentsByGeneration([
      row({
        id: 'a',
        startedAt: null,
        queuedAt: '2026-08-21T12:00:04.000Z',
      }),
      row({
        id: 'b',
        serverId: 'srv-b',
        startedAt: null,
        queuedAt: null,
      }),
    ])
    expect(groups[0]?.startedAt).toBe('2026-08-21T12:00:04.000Z')
  })

  it('reports a null start when no attempt carries a stamp', () => {
    const groups = groupDeploymentsByGeneration([
      row({ id: 'a', startedAt: null, queuedAt: null }),
    ])
    expect(groups[0]?.startedAt).toBeNull()
  })

  it('preserves incoming (newest-first) order across groups', () => {
    const groups = groupDeploymentsByGeneration([
      row({ id: 'newer', generation: 8 }),
      row({ id: 'older', generation: 7 }),
    ])
    expect(groups.map((group) => group.generation)).toEqual([8, 7])
  })

  it('returns no groups for an empty list', () => {
    expect(groupDeploymentsByGeneration([])).toEqual([])
  })

  it('keeps a standalone row next to a multi-host generation', () => {
    const groups = groupDeploymentsByGeneration([
      row({ id: 'fan-a', generation: 9, serverId: 'srv-a' }),
      row({ id: 'fan-b', generation: 9, serverId: 'srv-b' }),
      row({ id: 'solo', generation: null, actorEntityType: 'system' }),
    ])
    expect(groups).toHaveLength(2)
    const fan = groups[0]
    const solo = groups[1]
    if (!fan || !solo) throw new TypeError('expected a fan-out and a solo group')
    expect(fan.id).toBe('fan-a')
    expect(fan.generation).toBe(9)
    expect(fan.commands).toHaveLength(2)
    expect(fan.actorEntityType).toBe('user')
    expect(solo.id).toBe('solo')
    expect(solo.generation).toBeNull()
    expect(solo.actorEntityType).toBe('system')
  })

  it('uses startedAt over queuedAt even when start is later', () => {
    const groups = groupDeploymentsByGeneration([
      row({
        id: 'a',
        queuedAt: '2026-08-21T12:00:00.000Z',
        startedAt: '2026-08-21T12:00:08.000Z',
      }),
    ])
    expect(groups[0]?.startedAt).toBe('2026-08-21T12:00:08.000Z')
  })

  it('reports a zero duration when every attempt finished instantly', () => {
    const groups = groupDeploymentsByGeneration([
      row({ id: 'a', durationMs: 0 }),
      row({ id: 'b', serverId: 'srv-b', durationMs: 0 }),
    ])
    expect(groups[0]?.durationMs).toBe(0)
  })

  it('labels a cancelled fan-out from the worst host', () => {
    const groups = groupDeploymentsByGeneration([
      row({ id: 'a', status: 'succeeded' }),
      row({ id: 'b', serverId: 'srv-b', status: 'cancelled' }),
    ])
    expect(groups[0]?.status).toBe('cancelled')
  })

  it('falls back when the anchor row omits id and actor', () => {
    const groups = groupDeploymentsByGeneration([
      {
        ...row({ id: 'a' }),
        id: undefined as unknown as string,
        actorEntityType: undefined as unknown as string,
      },
    ])
    const group = groups[0]
    if (!group) throw new TypeError('expected a grouped deploy')
    expect(group.id).toBe('gen:7')
    expect(group.actorEntityType).toBe('unknown')
  })
})

describe('formatDeployDuration', () => {
  it('formats sub-second, second, and minute scales', () => {
    expect(formatDeployDuration(0)).toBe('0ms')
    expect(formatDeployDuration(420)).toBe('420ms')
    expect(formatDeployDuration(999)).toBe('999ms')
    expect(formatDeployDuration(1000)).toBe('1.0s')
    expect(formatDeployDuration(4200)).toBe('4.2s')
    expect(formatDeployDuration(9999)).toBe('10.0s')
    expect(formatDeployDuration(10_000)).toBe('10s')
    expect(formatDeployDuration(48_000)).toBe('48s')
    expect(formatDeployDuration(59_400)).toBe('59s')
    expect(formatDeployDuration(59_500)).toBe('1m 0s')
    expect(formatDeployDuration(60_000)).toBe('1m 0s')
    expect(formatDeployDuration(61_000)).toBe('1m 1s')
    expect(formatDeployDuration(192_000)).toBe('3m 12s')
  })

  it('renders an em dash when the duration is unknown', () => {
    expect(formatDeployDuration(null)).toBe('—')
    expect(formatDeployDuration(-1)).toBe('—')
  })
})

describe('formatDeployTimestamp', () => {
  it('renders an em dash for a missing or unparseable stamp', () => {
    expect(formatDeployTimestamp(null)).toBe('—')
    expect(formatDeployTimestamp('')).toBe('—')
    expect(formatDeployTimestamp('not-a-date')).toBe('—')
  })

  it('renders a short date and time', () => {
    expect(formatDeployTimestamp('2026-08-21T12:00:00.000Z')).toContain('·')
  })
})

describe('formatDeployActor', () => {
  it('labels known actor kinds and capitalises the rest', () => {
    expect(formatDeployActor('user')).toBe('User')
    expect(formatDeployActor('system')).toBe('System')
    expect(formatDeployActor('daemon')).toBe('Daemon')
    expect(formatDeployActor('x')).toBe('X')
    expect(formatDeployActor('')).toBe('Unknown')
  })
})

describe('deploymentStatusTone', () => {
  it('pairs every status with a label and a tone', () => {
    expect(deploymentStatusTone('succeeded')).toEqual({
      label: 'Succeeded',
      tone: 'success',
    })
    expect(deploymentStatusTone('failed')).toEqual({
      label: 'Failed',
      tone: 'failed',
    })
    expect(deploymentStatusTone('timed_out')).toEqual({
      label: 'Timed out',
      tone: 'failed',
    })
    expect(deploymentStatusTone('cancelled')).toEqual({
      label: 'Cancelled',
      tone: 'failed',
    })
    expect(deploymentStatusTone('running')).toEqual({
      label: 'Running',
      tone: 'pending',
    })
    expect(deploymentStatusTone('queued')).toEqual({
      label: 'Queued',
      tone: 'pending',
    })
    expect(deploymentStatusTone('dispatching')).toEqual({
      label: 'Queued',
      tone: 'pending',
    })
    expect(deploymentStatusTone('sent').label).toBe('Queued')
    expect(deploymentStatusTone('acked').label).toBe('Queued')
  })
})

describe('deploymentServerLabel', () => {
  it('falls back to the server id when there is no name', () => {
    expect(deploymentServerLabel(row({ id: 'a', serverName: null }))).toBe('srv-a')
    expect(deploymentServerLabel(row({ id: 'a', serverName: '  ' }))).toBe('srv-a')
  })

  it('prefers a trimmed display name', () => {
    expect(deploymentServerLabel(row({ id: 'a', serverName: '  web-01  ' }))).toBe(
      'web-01',
    )
  })
})

describe('stalledDeploymentHint', () => {
  it('tells the operator whether deploying again is free', () => {
    // The sweep records which of the two stalls happened; the console turns
    // that into the operator's next move.
    expect(stalledDeploymentHint('stalled_undelivered')).toContain('safe')
    expect(stalledDeploymentHint('stalled')).toContain('check the host')
    // Any other failure speaks for itself through errorMessage.
    expect(stalledDeploymentHint('deploy_failed')).toBeNull()
    expect(stalledDeploymentHint(null)).toBeNull()
  })
})

describe('push-triggered deploys', () => {
  it('carries the trigger of the anchor row onto the group', () => {
    const trigger = {
      kind: 'push' as const,
      branch: 'staging',
      commitSha: 'abc123def456',
      sourceId: 'repo-1',
    }
    const [group] = groupDeploymentsByGeneration([
      row({ id: 'a', actorEntityType: 'system', trigger }),
      row({ id: 'b', actorEntityType: 'system', serverId: 'srv-b', trigger }),
    ])
    expect(group?.trigger).toEqual(trigger)
  })

  it('has no trigger for a person\'s deploy or an older API', () => {
    const [group] = groupDeploymentsByGeneration([row({ id: 'a' })])
    expect(group?.trigger).toBeNull()
  })

  it('formats the branch and a short commit', () => {
    expect(
      formatDeployTrigger({
        kind: 'push',
        branch: 'release/1.4',
        commitSha: 'abc123def456',
        sourceId: null,
      }),
    ).toEqual({ headline: 'Push to release/1.4', detail: 'abc123d' })
  })

  it('degrades when only part of the attribution was recorded', () => {
    expect(
      formatDeployTrigger({ kind: 'push', branch: null, commitSha: 'abc123def', sourceId: null }),
    ).toEqual({ headline: 'Git push', detail: 'abc123d' })
    expect(
      formatDeployTrigger({ kind: 'push', branch: ' ', commitSha: null, sourceId: null }),
    ).toEqual({ headline: 'Git push', detail: null })
    expect(formatDeployTrigger(null)).toBeNull()
    expect(formatDeployTrigger(undefined)).toBeNull()
  })
})

describe('deploy strategy and outcome', () => {
  it('labels a rolled back and a needs attention deploy instead of plain Failed', () => {
    expect(deploymentStatusTone('failed', 'rolled_back')).toEqual({
      label: 'Rolled back',
      tone: 'failed',
    })
    expect(deploymentStatusTone('failed', 'needs_attention')).toEqual({
      label: 'Needs attention',
      tone: 'failed',
    })
    expect(deploymentStatusTone('failed', null).label).toBe('Failed')
    expect(deploymentStatusTone('succeeded').label).toBe('Succeeded')
  })

  it('lets needs attention outrank rolled back across a fan-out', () => {
    expect(
      worstStrategyOutcome([
        row({ id: 'a', strategyOutcome: 'rolled_back' }),
        row({ id: 'b', strategyOutcome: 'needs_attention' }),
      ]),
    ).toBe('needs_attention')
    expect(
      worstStrategyOutcome([
        row({ id: 'a', strategyOutcome: null }),
        row({ id: 'b' }),
      ]),
    ).toBeNull()
  })

  it('carries strategy and outcome onto the group', () => {
    const [group] = groupDeploymentsByGeneration([
      row({
        id: 'a',
        status: 'failed',
        strategy: 'sequential',
        strategyOutcome: 'rolled_back',
      }),
      row({ id: 'b', serverId: 'srv-b', strategy: 'sequential' }),
    ])
    expect(group?.strategy).toBe('sequential')
    expect(group?.strategyOutcome).toBe('rolled_back')
  })

  it('names the engine, and says nothing for older rows', () => {
    expect(deploymentStrategyLabel('sequential')).toBe('Sequential')
    expect(deploymentStrategyLabel('inplace')).toBe('In place')
    expect(deploymentStrategyLabel(null)).toBeNull()
    expect(deploymentStrategyLabel(undefined)).toBeNull()
  })
})

describe('cancelling a deploy', () => {
  const requested = '2026-08-21T12:00:03.000Z'

  it('shows Cancel only for an in-flight deploy nobody asked to cancel', () => {
    const [running] = groupDeploymentsByGeneration([
      row({ id: 'a', status: 'running', durationMs: null }),
    ])
    const [asked] = groupDeploymentsByGeneration([
      row({ id: 'a', status: 'running', durationMs: null, cancelRequestedAt: requested }),
    ])
    const [done] = groupDeploymentsByGeneration([row({ id: 'a' })])
    expect(canCancelDeployment(running!)).toBe(true)
    expect(canCancelDeployment(asked!)).toBe(false)
    expect(canCancelDeployment(done!)).toBe(false)
  })

  it('treats queued, sent and acked hosts as in flight', () => {
    for (const status of ['queued', 'dispatching', 'sent', 'acked', 'running'] as const) {
      expect(isDeploymentInFlight([row({ id: 'a', status })])).toBe(true)
    }
    for (const status of ['succeeded', 'failed', 'timed_out', 'cancelled'] as const) {
      expect(isDeploymentInFlight([row({ id: 'a', status })])).toBe(false)
    }
  })

  it('reads Cancelling while a requested cancel has not finished', () => {
    const [group] = groupDeploymentsByGeneration([
      row({ id: 'a', status: 'running', durationMs: null, cancelRequestedAt: requested }),
    ])
    expect(isDeploymentCancelling(group!)).toBe(true)
    expect(deploymentStatusTone(group!.status, null, true)).toEqual({
      label: 'Cancelling…',
      tone: 'pending',
    })
  })

  it('keeps the earliest cancel request across a fan-out', () => {
    const [group] = groupDeploymentsByGeneration([
      row({ id: 'a', serverId: 's1', cancelRequestedAt: '2026-08-21T12:00:09.000Z' }),
      row({ id: 'b', serverId: 's2', cancelRequestedAt: requested }),
      row({ id: 'c', serverId: 's3' }),
    ])
    expect(group!.cancelRequestedAt).toBe(requested)
  })

  it('labels a cancelled deploy in the failed tone with a plain note', () => {
    const [group] = groupDeploymentsByGeneration([
      row({ id: 'a', status: 'cancelled', errorCode: 'deploy_cancelled' }),
    ])
    expect(deploymentStatusTone(group!.status)).toEqual({ label: 'Cancelled', tone: 'failed' })
    expect(isDeploymentCancelling(group!)).toBe(false)
    expect(cancelledDeploymentNote(group!)).toContain('previous version is still running')
  })

  it('notes a cancel that came too late only on a succeeded deploy', () => {
    const [late] = groupDeploymentsByGeneration([
      row({ id: 'a', cancelRequestedAt: requested }),
    ])
    const [plain] = groupDeploymentsByGeneration([row({ id: 'a' })])
    const [cancelled] = groupDeploymentsByGeneration([
      row({ id: 'a', status: 'cancelled', cancelRequestedAt: requested }),
    ])
    expect(cancelTooLateNote(late!)).toBe('Finished before it could be cancelled.')
    expect(cancelTooLateNote(plain!)).toBeNull()
    expect(cancelTooLateNote(cancelled!)).toBeNull()
    expect(cancelledDeploymentNote(plain!)).toBeNull()
  })

  it('finds the newest in-flight deploy', () => {
    const groups = groupDeploymentsByGeneration([
      row({ id: 'n', generation: 9, status: 'running', durationMs: null }),
      row({ id: 'o', generation: 8 }),
    ])
    expect(findInFlightDeployment(groups)?.id).toBe('n')
    expect(findInFlightDeployment(groups.slice(1))).toBeNull()
  })
})
