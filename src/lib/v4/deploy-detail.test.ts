import { describe, expect, it } from 'vitest'
import { groupDeploymentsByGeneration } from '@/lib/deployment-history'
import type { LogTranscriptLine } from '@/lib/execution-log-lines'
import type { DeploymentHistoryRecord } from '@/lib/instance-api'
import {
  commandStatusKey,
  deployHosts,
  deployNote,
  deployRibbon,
  deploySteps,
  stepStatusKey,
  tailLines,
} from './deploy-detail'

const NOW = Date.parse('2026-10-05T12:00:00Z')

function row(id: string, extra: Partial<DeploymentHistoryRecord> = {}): DeploymentHistoryRecord {
  return {
    id,
    commandId: id,
    generation: 4,
    desiredHash: null,
    replicaCounts: null,
    serverId: `srv-${id}`,
    serverName: null,
    status: 'succeeded',
    actorEntityType: 'user',
    actorEntityId: 'u',
    queuedAt: '2026-10-05T11:56:00Z',
    startedAt: '2026-10-05T11:56:00Z',
    finishedAt: '2026-10-05T11:56:48Z',
    durationMs: 48_000,
    errorCode: null,
    errorMessage: null,
    hasLog: true,
    ...extra,
  }
}

function group(...rows: DeploymentHistoryRecord[]) {
  const [first] = groupDeploymentsByGeneration(rows)
  if (first === undefined) throw new Error('fixture')
  return first
}

function ln(seq: number, phase: string | null): LogTranscriptLine {
  return { seq, timestamp: null, stream: 'stdout', phase, message: `m${seq}` }
}

describe('commandStatusKey', () => {
  it.each([
    ['succeeded', 'deployed'],
    ['failed', 'failed'],
    ['timed_out', 'failed'],
    ['cancelled', 'cancelled'],
    ['running', 'deploying'],
    ['queued', 'queued'],
    ['acked', 'queued'],
  ] as const)('%s reads as %s', (status, key) => {
    expect(commandStatusKey(row('a', { status }))).toBe(key)
  })

  it('says rolled back when the engine put the old version back', () => {
    expect(commandStatusKey(row('a', { status: 'failed', strategyOutcome: 'rolled_back' }))).toBe('rolledback')
  })
})

describe('deployHosts', () => {
  it('lists each server with its own status and the line that says why it failed', () => {
    const hosts = deployHosts(
      group(
        row('a', { serverName: 'alpha' }),
        row('b', { status: 'failed', errorMessage: 'pulling\nimage not found', serverName: 'beta', hasLog: false }),
      ),
    )
    expect(hosts).toEqual([
      { serverId: 'srv-a', commandId: 'a', label: 'alpha', statusKey: 'deployed', failure: null, hasLog: true },
      { serverId: 'srv-b', commandId: 'b', label: 'beta', statusKey: 'failed', failure: 'image not found', hasLog: false },
    ])
  })

  it('prefers the engine reason for a rolled-back server and names a server by its id when it has no name', () => {
    const [host] = deployHosts(
      group(row('a', { status: 'succeeded', strategyOutcome: 'rolled_back', strategyOutcomeReason: 'Health check failed' })),
    )
    expect(host).toMatchObject({ label: 'srv-a', failure: 'Health check failed', statusKey: 'rolledback' })
  })
})

describe('deployNote', () => {
  it('is null for a deploy that went fine', () => {
    expect(deployNote(group(row('a')))).toBeNull()
  })

  it('says a cancelled deploy changed nothing', () => {
    expect(deployNote(group(row('a', { status: 'cancelled' })))).toEqual({
      tone: 'info',
      title: 'Cancelled',
      body: 'Stopped before it changed anything. The previous version is still running.',
    })
  })

  it('says a deploy finished before it could be cancelled', () => {
    expect(deployNote(group(row('a', { cancelRequestedAt: '2026-10-05T11:56:10Z' })))).toEqual({
      tone: 'info',
      title: 'Finished before it could be cancelled.',
    })
  })

  it('shows the error line of a failed deploy and what a stall means', () => {
    const note = deployNote(group(row('a', { status: 'timed_out', errorCode: 'stalled_undelivered', errorMessage: 'no answer' })))
    expect(note).toMatchObject({
      tone: 'bad',
      title: 'It did not finish',
      errorLine: 'no answer',
    })
    expect(note?.body).toContain('Deploying again is safe')
  })

  it('warns, not alarms, for a rollback, and copes with a failure that has no text', () => {
    expect(
      deployNote(group(row('a', { status: 'failed', strategyOutcome: 'rolled_back', strategyOutcomeReason: 'Health check failed' }))),
    ).toEqual({ tone: 'warn', title: 'Rolled back', errorLine: 'Health check failed' })
    expect(deployNote(group(row('a', { status: 'failed' })))).toEqual({ tone: 'bad', title: 'It did not finish' })
  })
})

describe('deployRibbon', () => {
  it('says who started it, when and how long it took', () => {
    expect(deployRibbon(group(row('a')), NOW)).toEqual({
      statusKey: 'deployed',
      title: 'Started in the console',
      sha: null,
      sub: 'Started 4m ago · took 48s',
      who: 'User',
      cancelling: false,
      inFlight: false,
    })
  })

  it('names a push by its branch and commit', () => {
    const pushed = row('a', { trigger: { kind: 'push', branch: 'main', commitSha: 'abcdef1234567', sourceId: null } })
    expect(deployRibbon(group(pushed), NOW)).toMatchObject({ title: 'Push to main', sha: 'abcdef1' })
  })

  it('says it is running while a server is still going, and cancelling once asked to stop', () => {
    const running = row('a', { status: 'running', durationMs: null, finishedAt: null })
    expect(deployRibbon(group(running), NOW)).toMatchObject({ statusKey: 'deploying', sub: 'Started 4m ago · running', inFlight: true })
    const cancelling = row('a', { status: 'running', durationMs: null, cancelRequestedAt: '2026-10-05T11:58:00Z' })
    expect(deployRibbon(group(cancelling), NOW)).toMatchObject({ cancelling: true, statusKey: 'deploying' })
  })

  it('leaves the start out when the time is unknown', () => {
    const unknown = row('a', { startedAt: null, queuedAt: null })
    expect(deployRibbon(group(unknown), NOW).sub).toBe('took 48s')
  })
})

describe('deploySteps', () => {
  const LINES = [ln(1, null), ln(2, 'fetch'), ln(3, 'build'), ln(4, 'build'), ln(5, 'compose-up')]

  it('lists the phases reached, each before the last done', () => {
    expect(deploySteps(LINES, 'succeeded').map((s) => [s.label, s.state])).toEqual([
      ['Fetch source', 'done'],
      ['Build', 'done'],
      ['Compose up', 'done'],
    ])
  })

  it('shows the last phase going while the deploy runs, failed when it failed, and not finished when cancelled', () => {
    expect(deploySteps(LINES, 'running').at(-1)?.state).toBe('now')
    expect(deploySteps(LINES, 'queued').at(-1)?.state).toBe('now')
    expect(deploySteps(LINES, 'failed').at(-1)?.state).toBe('bad')
    expect(deploySteps(LINES, 'timed_out').at(-1)?.state).toBe('bad')
    expect(deploySteps(LINES, 'cancelled').at(-1)?.state).toBe('pending')
  })

  it('has no steps before the log has reached a phase', () => {
    expect(deploySteps([], 'running')).toEqual([])
    expect(deploySteps([ln(1, null)], 'running')).toEqual([])
  })

  it('maps a step to a key of the status vocabulary', () => {
    expect(stepStatusKey('done')).toBe('deployed')
    expect(stepStatusKey('now')).toBe('deploying')
    expect(stepStatusKey('pending')).toBe('queued')
    expect(stepStatusKey('bad')).toBe('failed')
  })
})

describe('tailLines', () => {
  it('keeps the last five lines by default', () => {
    const lines = [1, 2, 3, 4, 5, 6, 7].map((n) => ln(n, null))
    expect(tailLines(lines).map((l) => l.seq)).toEqual([3, 4, 5, 6, 7])
    expect(tailLines(lines, 2).map((l) => l.seq)).toEqual([6, 7])
    expect(tailLines([ln(1, null)])).toHaveLength(1)
  })
})
