import { describe, expect, it } from 'vitest'
import type { DeploymentHistoryRecord } from '@/lib/instance-api'
import { deployRows, firstErrorLine, groupStatusKey, problemNotice } from './overview-deploys'
import { groupDeploymentsByGeneration } from '@/lib/deployment-history'

const NOW = Date.parse('2026-10-05T12:00:00Z')

function deploy(id: string, generation: number | null, extra: Partial<DeploymentHistoryRecord> = {}): DeploymentHistoryRecord {
  return {
    id,
    commandId: id,
    generation,
    desiredHash: null,
    replicaCounts: null,
    serverId: 'srv',
    serverName: null,
    status: 'succeeded',
    actorEntityType: 'user',
    actorEntityId: 'u',
    queuedAt: '2026-10-05T11:00:00Z',
    startedAt: '2026-10-05T11:00:00Z',
    finishedAt: '2026-10-05T11:01:00Z',
    durationMs: 48_000,
    errorCode: null,
    errorMessage: null,
    hasLog: true,
    ...extra,
  }
}

const push = { kind: 'push' as const, branch: 'main', commitSha: 'abcdef1234567', sourceId: null }

describe('groupStatusKey', () => {
  const key = (extra: Partial<DeploymentHistoryRecord>) =>
    groupStatusKey(groupDeploymentsByGeneration([deploy('d1', 1, extra)])[0]!)
  it.each([
    [{ status: 'succeeded' as const }, 'deployed'],
    [{ status: 'failed' as const }, 'failed'],
    [{ status: 'timed_out' as const }, 'failed'],
    [{ status: 'cancelled' as const }, 'cancelled'],
    [{ status: 'running' as const }, 'deploying'],
    [{ status: 'queued' as const }, 'queued'],
    [{ status: 'failed' as const, strategyOutcome: 'rolled_back' as const }, 'rolledback'],
  ])('%j -> %s', (extra, expected) => {
    expect(key(extra)).toBe(expected)
  })
})

describe('deployRows', () => {
  const rows = [
    deploy('d4', 4, { status: 'failed', errorMessage: 'boom', trigger: push }),
    deploy('d3', 3, { trigger: { ...push, branch: null, commitSha: null } }),
    deploy('d2', 2, { actorEntityType: 'system', durationMs: null, status: 'running' }),
    deploy('d1', 1),
  ]

  it('lists the newest three, with how each started and ended', () => {
    const list = deployRows(rows, NOW, true)
    expect(list.map((r) => [r.id, r.statusKey, r.title, r.sha, r.sub, r.when])).toEqual([
      ['d4', 'failed', 'Push to main', 'abcdef1', '48s', '1h ago'],
      ['d3', 'deployed', 'Git push', null, '48s', '1h ago'],
      ['d2', 'deploying', 'Started by the system', null, 'In progress', '1h ago'],
    ])
  })

  it('reads In progress only for a deploy that is running', () => {
    const sub = (extra: Parameters<typeof deploy>[2]) =>
      deployRows([deploy('d1', null, extra)], NOW, false)[0]?.sub
    expect(sub({ durationMs: null, status: 'running' })).toBe('In progress')
    expect(sub({ durationMs: null, status: 'queued' })).toBe('Waiting to start')
    expect(sub({ durationMs: null, status: 'cancelled' })).toBe('—')
    expect(sub({ durationMs: null, status: 'failed' })).toBe('—')
    expect(sub({ durationMs: null, status: 'succeeded' })).toBe('—')
  })

  it('marks the newest good deploy live only while the environment runs', () => {
    expect(deployRows(rows, NOW, true).find((r) => r.live)?.id).toBe('d3')
    expect(deployRows(rows, NOW, false).some((r) => r.live)).toBe(false)
  })

  it('says a console deploy was started in the console, and has no time when none is recorded', () => {
    const [row] = deployRows([deploy('d1', null, { startedAt: null, queuedAt: null })], NOW, false)
    expect(row).toMatchObject({ title: 'Started in the console', when: '' })
  })

  it('has no rows without history', () => {
    expect(deployRows([], NOW, true)).toEqual([])
  })
})

describe('firstErrorLine', () => {
  it('takes the first non-empty line and cuts a long one', () => {
    expect(firstErrorLine('\n  Build stopped  \nmore')).toBe('Build stopped')
    expect(firstErrorLine('x'.repeat(300))?.length).toBe(240)
    expect(firstErrorLine('x'.repeat(300))?.endsWith('…')).toBe(true)
  })
  it('is absent for nothing', () => {
    expect(firstErrorLine(null)).toBeUndefined()
    expect(firstErrorLine(undefined)).toBeUndefined()
    expect(firstErrorLine(' \n ')).toBeUndefined()
  })
})

describe('problemNotice', () => {
  it('is absent without history or when the newest deploy is fine or still going', () => {
    expect(problemNotice([], true)).toBeNull()
    expect(problemNotice([deploy('d1', 1)], true)).toBeNull()
    expect(problemNotice([deploy('d1', 1, { status: 'running' })], true)).toBeNull()
    expect(problemNotice([deploy('d1', 1, { status: 'cancelled' })], true)).toBeNull()
  })

  it('names a failed deploy with its error line, and says the old version serves only when it does', () => {
    const history = [
      deploy('d2', 2, { status: 'failed', errorMessage: 'Build stopped with an error\ndetails', trigger: push }),
      deploy('d1', 1),
    ]
    expect(problemNotice(history, true)).toEqual({
      tone: 'bad',
      title: 'The last deploy (abcdef1) failed',
      body: 'It did not go live. The previous version is still serving.',
      errorLine: 'Build stopped with an error',
    })
    expect(problemNotice(history, false)?.body).toBe('It did not go live.')
    expect(problemNotice([history[0]!], true)?.body).toBe('It did not go live.')
  })

  it('has no error line when the control plane gave none', () => {
    const notice = problemNotice([deploy('d1', 1, { status: 'timed_out' })], true)
    expect(notice).toEqual({ tone: 'bad', title: 'The last deploy failed', body: 'It did not go live.' })
  })

  it('reads the error from any server of the deploy', () => {
    const notice = problemNotice(
      [deploy('a', 5, { status: 'failed' }), deploy('b', 5, { status: 'failed', errorMessage: 'second server' })],
      true,
    )
    expect(notice?.errorLine).toBe('second server')
  })

  it('warns about a rollback and gives the reason when there is one', () => {
    const notice = problemNotice(
      [deploy('d1', 1, { status: 'failed', strategyOutcome: 'rolled_back', strategyOutcomeReason: 'Health check failed' })],
      true,
    )
    expect(notice).toMatchObject({ tone: 'warn', title: 'The last deploy was rolled back', body: 'Health check failed' })
    expect(problemNotice([deploy('d1', 1, { strategyOutcome: 'rolled_back' })], true)?.body).toBe(
      'The previous version is back in place.',
    )
  })
})
