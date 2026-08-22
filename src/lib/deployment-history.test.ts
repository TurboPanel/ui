import { describe, expect, it } from 'vitest'
import type { CommandStatus, DeploymentHistoryRecord } from '@/lib/instance-api'
import {
  deploymentServerLabel,
  deploymentStatusTone,
  formatDeployActor,
  formatDeployDuration,
  formatDeployTimestamp,
  groupDeploymentsByGeneration,
  worstDeploymentStatus,
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

  it('preserves incoming (newest-first) order across groups', () => {
    const groups = groupDeploymentsByGeneration([
      row({ id: 'newer', generation: 8 }),
      row({ id: 'older', generation: 7 }),
    ])
    expect(groups.map((group) => group.generation)).toEqual([8, 7])
  })
})

describe('formatDeployDuration', () => {
  it('formats sub-second, second, and minute scales', () => {
    expect(formatDeployDuration(420)).toBe('420ms')
    expect(formatDeployDuration(4200)).toBe('4.2s')
    expect(formatDeployDuration(48_000)).toBe('48s')
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
    expect(formatDeployActor('')).toBe('Unknown')
  })
})

describe('deploymentStatusTone', () => {
  it('pairs every status with a label and a tone', () => {
    expect(deploymentStatusTone('succeeded')).toEqual({
      label: 'Succeeded',
      tone: 'success',
    })
    expect(deploymentStatusTone('timed_out').tone).toBe('failed')
    expect(deploymentStatusTone('cancelled').tone).toBe('failed')
    expect(deploymentStatusTone('running').tone).toBe('pending')
    expect(deploymentStatusTone('queued').label).toBe('Queued')
  })
})

describe('deploymentServerLabel', () => {
  it('falls back to the server id when there is no name', () => {
    expect(deploymentServerLabel(row({ id: 'a', serverName: null }))).toBe('srv-a')
    expect(deploymentServerLabel(row({ id: 'a', serverName: '  ' }))).toBe('srv-a')
  })
})
