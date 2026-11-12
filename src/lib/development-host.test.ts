import { describe, expect, it } from 'vitest'
import {
  DEV_HOST_DONE_SHOWN_MS,
  DEV_HOST_FAILED_SHOWN_MS,
  DEV_HOST_LOG_LINE_MAX_CHARS,
  DEV_HOST_LOG_TAIL_MAX_LINES,
  DEV_HOST_RESTARTING,
  devHostActionError,
  devHostActionsLocked,
  devHostBarVisible,
  devHostDatabaseLine,
  devHostFailure,
  devHostJobEndedWithin,
  devHostJobJustDone,
  devHostJobJustFailed,
  devHostJobJustFinished,
  devHostJobRunning,
  devHostLines,
  devHostMigratePending,
  devHostPartLabel,
  devHostPartLine,
  devHostPartNeedsWork,
  devHostProgressLine,
  devHostWait,
  carryDevHostJob,
  devHostDoneHidesInMs,
  DEV_HOST_RECONNECT_CEILING_MS,
  DEV_HOST_START_CEILING_MS,
  DEV_HOST_RECONNECTING,
  DEV_HOST_LOST,
  type DevelopmentView,
  devHostStartedJob,
  devHostStepLabel,
  developmentViewPollInterval,
} from '@/lib/development-host'
import type { DevHostJob, DevHostPart, DevHostView, DevelopmentJob } from '@/lib/instance-api'

const NOW = Date.parse('2026-11-03T12:00:00Z')

function part(overrides: Partial<DevHostPart> = {}): DevHostPart {
  return {
    name: 'control-plane',
    unit: 'turbopanel-instance.service',
    branch: 'trunk',
    onTrunk: true,
    headCommit: 'abc',
    runningCommit: 'abc',
    behindBy: 0,
    dirty: { files: 0, blocking: false, kinds: [] },
    restartNeeded: false,
    setupNeeded: {},
    active: true,
    ...overrides,
  }
}

function job(overrides: Partial<DevHostJob> = {}): DevHostJob {
  return {
    id: 'h1',
    action: 'update',
    state: 'running',
    step: 'pull',
    steps: [
      { name: 'fetch', state: 'done' },
      { name: 'pull', state: 'running' },
      { name: 'install', state: 'pending' },
    ],
    startedAt: '2026-11-03T11:59:00Z',
    endedAt: null,
    logTail: [],
    ...overrides,
  }
}

function host(overrides: Partial<DevHostView> = {}): DevHostView {
  return { parts: [part()], lastFetchAt: null, job: null, migrate: null, ...overrides }
}

function ago(ms: number): string {
  return new Date(NOW - ms).toISOString()
}

describe('devHostPartLabel', () => {
  it('names the four parts in title case', () => {
    expect(devHostPartLabel('control-plane')).toBe('Control Plane')
    expect(devHostPartLabel('web-interface')).toBe('Web Interface')
    expect(devHostPartLabel('website')).toBe('Website')
    expect(devHostPartLabel('daemon')).toBe('Daemon')
  })

  it('title-cases a name from a newer daemon, and never reads empty', () => {
    expect(devHostPartLabel('docs-site')).toBe('Docs Site')
    expect(devHostPartLabel('--')).toBe('Unknown Part')
  })
})

describe('devHostMigratePending', () => {
  it('takes the larger of the part count and, for the control plane, the top-level count', () => {
    expect(devHostMigratePending(part({ setupNeeded: { migrate: { pending: 2 } } }))).toBe(2)
    expect(devHostMigratePending(part(), { pending: 3 })).toBe(3)
    expect(devHostMigratePending(part({ name: 'website' }), { pending: 3 })).toBe(0)
    expect(devHostMigratePending(part(), null)).toBe(0)
  })
})

describe('devHostPartNeedsWork and devHostPartLine', () => {
  it('a clean part needs nothing and has no line', () => {
    expect(devHostPartNeedsWork(part())).toBe(false)
    expect(devHostPartLine(part())).toBeNull()
  })

  it('non-blocking changes alone are not mentioned', () => {
    const quiet = part({
      dirty: { files: 2, blocking: false, kinds: [{ path: 'next-env.d.ts', kind: 'generated' }] },
    })
    expect(devHostPartLine(quiet)).toBeNull()
  })

  it('counts new commits and pending migrations', () => {
    expect(devHostPartLine(part({ behindBy: 3, setupNeeded: { migrate: { pending: 1 } } }))).toBe(
      'Control Plane: 3 new commits on trunk, 1 migration pending'
    )
    expect(devHostPartLine(part({ behindBy: 1 }), { pending: 2 })).toBe(
      'Control Plane: 1 new commit on trunk, 2 migrations pending'
    )
  })

  it("uses the daemon's exact reason when it sent one", () => {
    expect(
      devHostPartLine(
        part({
          onTrunk: false,
          branch: '',
          behindBy: 19,
          blockedReason: 'detached at 4f7b5ed, 19 behind trunk; not pulled',
        })
      )
    ).toBe('Control Plane: detached at 4f7b5ed, 19 behind trunk, will not pull')
    expect(
      devHostPartLine(
        part({
          name: 'website',
          dirty: { files: 1, blocking: true, kinds: [{ path: 'a.ts', kind: 'content' }] },
          blockedReason: 'local changes in a.ts; not pulled',
        })
      )
    ).toBe('Website: local changes in a.ts, will not pull')
    // A refused fast-forward names git's line; the count of new commits stays.
    expect(
      devHostPartLine(
        part({ behindBy: 2, blockedReason: 'fatal: Not possible to fast-forward, aborting.' })
      )
    ).toBe(
      'Control Plane: fatal: Not possible to fast-forward, aborting, will not pull, 2 new commits on trunk'
    )
  })

  it('reads the database line from the counts', () => {
    expect(devHostDatabaseLine({ pending: 2, applied: 23, total: 25 })).toBe(
      'Database: 23 of 25 migrations applied'
    )
    expect(devHostDatabaseLine({ pending: 0, applied: 1, total: 1 })).toBe(
      'Database: 1 of 1 migration applied'
    )
    expect(devHostDatabaseLine({ pending: 0 })).toBeNull()
    expect(devHostDatabaseLine(null)).toBeNull()
    expect(
      devHostLines(
        host({ parts: [part({ behindBy: 1 })], migrate: { pending: 0, applied: 25, total: 26 } })
      )
    ).toEqual([
      { name: 'control-plane', text: 'Control Plane: 1 new commit on trunk' },
      { name: 'database', text: 'Database: 25 of 26 migrations applied' },
    ])
  })

  it('says a restart or packages are needed', () => {
    expect(devHostPartLine(part({ name: 'daemon', restartNeeded: true }))).toBe(
      'Daemon: restart needed'
    )
    expect(devHostPartLine(part({ name: 'website', setupNeeded: { install: true } }))).toBe(
      'Website: packages to install'
    )
  })

  it('reports content changes, and that they keep a pull out when trunk moved', () => {
    const dirty = { files: 1, blocking: true, kinds: [{ path: 'a.ts', kind: 'content' as const }] }
    expect(devHostPartLine(part({ name: 'website', dirty, behindBy: 2 }))).toBe(
      'Website: local changes, will not pull'
    )
    expect(devHostPartLine(part({ name: 'website', dirty }))).toBe('Website: local changes')
  })

  it('reports a checkout on another branch only when trunk moved', () => {
    const branch = part({ name: 'web-interface', onTrunk: false, branch: 'fix/x' })
    expect(devHostPartLine({ ...branch, behindBy: 4 })).toBe(
      'Web Interface: on branch fix/x, will not pull'
    )
    expect(devHostPartLine(branch)).toBeNull()
    expect(devHostPartLine({ ...branch, branch: '', behindBy: 1 })).toBe(
      'Web Interface: on branch unknown, will not pull'
    )
  })

  it('devHostLines keeps the daemon order and drops parts with nothing to do', () => {
    const view = host({
      parts: [
        part({ behindBy: 1 }),
        part({ name: 'website' }),
        part({ name: 'daemon', restartNeeded: true }),
      ],
    })
    expect(devHostLines(view)).toEqual([
      { name: 'control-plane', text: 'Control Plane: 1 new commit on trunk' },
      { name: 'daemon', text: 'Daemon: restart needed' },
    ])
  })
})

describe('job timing', () => {
  it('a job with no or an unreadable end time is not recent', () => {
    expect(devHostJobEndedWithin({ endedAt: null }, NOW, 1000)).toBe(false)
    expect(devHostJobEndedWithin({ endedAt: 'soon' }, NOW, 1000)).toBe(false)
    expect(devHostJobEndedWithin({ endedAt: ago(500) }, NOW, 1000)).toBe(true)
    expect(devHostJobEndedWithin({ endedAt: ago(1500) }, NOW, 1000)).toBe(false)
  })

  it('a failure shows for a while, a finished job reads Updated for a shorter while', () => {
    const failed = job({ state: 'failed', endedAt: ago(DEV_HOST_FAILED_SHOWN_MS - 1) })
    expect(devHostJobJustFailed(failed, NOW)).toBe(true)
    expect(
      devHostJobJustFailed({ ...failed, endedAt: ago(DEV_HOST_FAILED_SHOWN_MS + 1) }, NOW)
    ).toBe(false)
    expect(devHostJobJustFailed(null, NOW)).toBe(false)
    const done = job({ state: 'done', endedAt: ago(DEV_HOST_DONE_SHOWN_MS - 1) })
    expect(devHostJobJustDone(done, NOW)).toBe(true)
    expect(devHostJobJustDone({ ...done, endedAt: ago(DEV_HOST_DONE_SHOWN_MS + 1) }, NOW)).toBe(
      false
    )
    expect(devHostJobJustDone(failed, NOW)).toBe(false)
  })

  it('only a running job runs; an unknown state does not', () => {
    expect(devHostJobRunning(job())).toBe(true)
    expect(devHostJobRunning(job({ state: 'queued' as DevHostJob['state'] }))).toBe(false)
    expect(devHostJobRunning(undefined)).toBe(false)
  })
})

describe('devHostBarVisible', () => {
  const base = { development: true, superadmin: true, now: NOW }

  it('is hidden on a release install, for a plain admin, or without a host', () => {
    const busy = host({ parts: [part({ behindBy: 1 })] })
    expect(devHostBarVisible({ ...base, development: false, host: busy })).toBe(false)
    expect(devHostBarVisible({ ...base, superadmin: false, host: busy })).toBe(false)
    expect(devHostBarVisible({ ...base, host: null })).toBe(false)
  })

  it('is hidden when nothing needs doing, except for a minute after a finished job', () => {
    expect(devHostBarVisible({ ...base, host: host() })).toBe(false)
    const done = job({ state: 'done', endedAt: ago(1000) })
    expect(devHostBarVisible({ ...base, host: host({ job: done }) })).toBe(true)
    const old = job({ state: 'done', endedAt: ago(DEV_HOST_DONE_SHOWN_MS + 1) })
    expect(devHostBarVisible({ ...base, host: host({ job: old }) })).toBe(false)
  })

  it('says when a finished job stops keeping the bar up', () => {
    expect(devHostDoneHidesInMs(job({ state: 'done', endedAt: ago(1000) }), NOW)).toBe(
      DEV_HOST_DONE_SHOWN_MS - 1000
    )
    expect(
      devHostDoneHidesInMs(job({ state: 'done', endedAt: ago(DEV_HOST_DONE_SHOWN_MS * 2) }), NOW)
    ).toBe(0)
    expect(devHostDoneHidesInMs(job({ state: 'done', endedAt: 'soon' }), NOW)).toBeNull()
    expect(devHostDoneHidesInMs(job({ state: 'done', endedAt: null }), NOW)).toBeNull()
    expect(devHostDoneHidesInMs(job(), NOW)).toBeNull()
    expect(devHostDoneHidesInMs(null, NOW)).toBeNull()
  })

  it('shows when a part needs something, a job runs or one just failed', () => {
    expect(devHostBarVisible({ ...base, host: host({ parts: [part({ behindBy: 1 })] }) })).toBe(
      true
    )
    expect(devHostBarVisible({ ...base, host: host({ migrate: { pending: 1 } }) })).toBe(true)
    expect(devHostBarVisible({ ...base, host: host({ job: job() }) })).toBe(true)
    const failed = job({ state: 'failed', endedAt: ago(1000) })
    expect(devHostBarVisible({ ...base, host: host({ job: failed }) })).toBe(true)
  })
})

describe('steps and progress', () => {
  it('names every known step in plain words', () => {
    expect(devHostStepLabel('fetch')).toBe('Fetching')
    expect(devHostStepLabel('pull')).toBe('Pulling')
    expect(devHostStepLabel('install')).toBe('Installing')
    expect(devHostStepLabel('migrate')).toBe('Migrating (backup first)')
    expect(devHostStepLabel('restart-control-plane')).toBe('Restarting Control Plane')
    expect(devHostStepLabel('restart-web')).toBe('Restarting Web Interface and Website')
    expect(devHostStepLabel('restart-daemon')).toBe('Restarting Daemon')
  })

  it('reads an unknown step as its words, and an empty one as Working', () => {
    expect(devHostStepLabel('warm-cache')).toBe('Warm cache')
    expect(devHostStepLabel('')).toBe('Working')
  })

  it('shows the step and its place, or why the progress is away', () => {
    expect(devHostProgressLine(job(), null)).toBe('Pulling… (step 2 of 3)')
    expect(devHostProgressLine(job({ step: '', steps: [] }), null)).toBe('Working…')
    expect(devHostProgressLine(job(), 'restarting')).toBe(DEV_HOST_RESTARTING)
    expect(devHostProgressLine(job(), 'reconnecting')).toBe(DEV_HOST_RECONNECTING)
    expect(devHostProgressLine(job(), 'lost')).toBe(DEV_HOST_LOST)
  })

  it('names the wait during a running job only', () => {
    const running = { job: null, host: host({ job: job() }) }
    expect(devHostWait(running, false, 0)).toBeNull()
    expect(devHostWait(running, true, 1000)).toBe('restarting')
    expect(devHostWait(running, true, DEV_HOST_RECONNECT_CEILING_MS + 1)).toBe('lost')
    const carry = { jobId: 'h1', since: NOW, reason: 'host-missing' as const, expired: false }
    expect(devHostWait({ ...running, hostCarry: carry }, false, 0)).toBe('reconnecting')
    expect(devHostWait({ ...running, hostCarry: { ...carry, expired: true } }, false, 0)).toBe(
      'lost'
    )
    expect(
      devHostWait({ job: null, host: host({ job: job({ state: 'failed' }) }) }, true, 0)
    ).toBeNull()
    expect(devHostWait(null, true, 0)).toBeNull()
  })
})

describe('devHostFailure', () => {
  it('names the failed step, its detail and a bounded log tail', () => {
    const long = 'x'.repeat(DEV_HOST_LOG_LINE_MAX_CHARS + 10)
    const lines = Array.from({ length: DEV_HOST_LOG_TAIL_MAX_LINES + 5 }, (_, i) => `line ${i}`)
    const failure = devHostFailure(
      job({
        state: 'failed',
        step: 'restart-control-plane',
        steps: [{ name: 'migrate', state: 'failed', detail: ' backup failed ' }],
        logTail: [...lines, long],
      })
    )
    expect(failure.title).toBe('Failed while migrating (backup first)')
    expect(failure.detail).toBe('backup failed')
    expect(failure.logTail).toHaveLength(DEV_HOST_LOG_TAIL_MAX_LINES)
    expect(failure.logTail.at(-1)).toBe(`${'x'.repeat(DEV_HOST_LOG_LINE_MAX_CHARS)}…`)
    expect(failure.logTail.at(-2)).toBe(`line ${DEV_HOST_LOG_TAIL_MAX_LINES + 4}`)
  })

  it('falls back to the job step when no step is marked failed', () => {
    const failure = devHostFailure(job({ state: 'failed', step: 'install', steps: [] }))
    expect(failure).toEqual({ title: 'Failed while installing', detail: null, logTail: [] })
  })
})

describe('locks and polling', () => {
  const push = (state: DevelopmentJob['state']): DevelopmentJob => ({
    id: 'p1',
    state,
    startedAt: null,
    endedAt: null,
    message: null,
    servers: [],
  })

  it('locks the buttons and polls at 2 s while either job runs', () => {
    expect(devHostActionsLocked({ job: null, host: host({ job: job() }) })).toBe(true)
    expect(devHostActionsLocked({ job: push('building'), host: null })).toBe(true)
    expect(devHostActionsLocked({ job: push('done'), host: host() })).toBe(false)
    expect(devHostActionsLocked(undefined)).toBe(false)
    expect(developmentViewPollInterval({ job: null, host: host({ job: job() }) })).toBe(2000)
    expect(developmentViewPollInterval({ job: push('pushing') })).toBe(2000)
    expect(developmentViewPollInterval({ job: null, host: host() })).toBe(false)
    expect(developmentViewPollInterval(null)).toBe(false)
  })

  it('stops polling 3 minutes after the last good read, and once a wait expired', () => {
    const running = { job: null, host: host({ job: job() }) }
    expect(developmentViewPollInterval(running, NOW - 1000, NOW)).toBe(2000)
    expect(developmentViewPollInterval(running, NOW - DEV_HOST_RECONNECT_CEILING_MS - 1, NOW)).toBe(
      false
    )
    const expired = { jobId: 'h1', since: NOW, reason: 'host-missing' as const, expired: true }
    expect(developmentViewPollInterval({ ...running, hostCarry: expired })).toBe(false)
    expect(devHostActionsLocked({ ...running, hostCarry: expired })).toBe(false)
  })

  it('a running host job that finishes is noticed once', () => {
    expect(devHostJobJustFinished(job(), job({ state: 'done' }))).toBe(true)
    expect(devHostJobJustFinished(job(), job({ state: 'failed' }))).toBe(true)
    expect(devHostJobJustFinished(job(), job())).toBe(false)
    expect(devHostJobJustFinished(job(), job({ id: 'other', state: 'done' }))).toBe(false)
    expect(devHostJobJustFinished(job({ state: 'done' }), job({ state: 'done' }))).toBe(false)
    expect(devHostJobJustFinished(job(), null)).toBe(false)
  })

  it('a started job reads as running with no steps yet', () => {
    expect(devHostStartedJob({ id: 'h9', action: 'restart' }, '2026-11-03T12:00:00Z')).toEqual({
      id: 'h9',
      action: 'restart',
      state: 'running',
      step: '',
      steps: [],
      startedAt: '2026-11-03T12:00:00Z',
      endedAt: null,
      logTail: [],
    })
  })
})

describe('devHostActionError', () => {
  it('says nothing when the job started', () => {
    expect(devHostActionError({ ok: true, job: { id: 'h1', action: 'update' } })).toBeNull()
  })

  it('explains each refusal', () => {
    expect(devHostActionError({ ok: false, error: 'job_running' })).toBe(
      'An update, restart or build and push is already running.'
    )
    expect(devHostActionError({ ok: false, error: 'daemon_unavailable' })).toBe(
      'The daemon on this server is not reachable. Try again in a moment.'
    )
    expect(
      devHostActionError({ ok: false, error: 'daemon_unavailable', reason: 'not_development' })
    ).toBe('The daemon on this server is not running in development mode.')
    expect(devHostActionError({ ok: false, error: 'daemon_unavailable', reason: 'timeout' })).toBe(
      'The daemon on this server did not answer. Try again.'
    )
    expect(devHostActionError({ ok: false, error: 'Database unavailable' })).toBe(
      'The action could not start.'
    )
  })
})

describe('carryDevHostJob', () => {
  function view(h: DevHostView | null, extra: Partial<DevelopmentView> = {}): DevelopmentView {
    return {
      ok: true,
      daemonBuild: { built: null, sourceFingerprint: 'fp', sourceChanged: false },
      servers: [],
      job: null,
      pendingDaemonChanges: false,
      host: h,
      ...extra,
    }
  }
  const running = view(host({ job: job() }))

  it('passes the answer through when nothing was running', () => {
    const fresh = view(null)
    expect(carryDevHostJob(undefined, fresh, NOW)).toBe(fresh)
    expect(carryDevHostJob(view(host()), fresh, NOW)).toBe(fresh)
    expect(carryDevHostJob(view(host({ job: job({ state: 'done' }) })), fresh, NOW)).toBe(fresh)
    expect(carryDevHostJob(running, null, NOW)).toBeNull()
  })

  it('an answer naming the job, or another running job, ends the wait', () => {
    const same = view(host({ job: job({ state: 'done' }) }))
    expect(carryDevHostJob(running, same, NOW)).toBe(same)
    const other = view(host({ job: job({ id: 'h2' }) }))
    expect(carryDevHostJob(running, other, NOW)).toBe(other)
  })

  it('keeps the running job while the restarted control plane has no host, up to 3 minutes', () => {
    const first = carryDevHostJob(running, view(null), NOW)
    expect(first?.host?.job).toEqual(job())
    expect(first?.hostCarry).toEqual({
      jobId: 'h1',
      since: NOW,
      reason: 'host-missing',
      expired: false,
    })
    const later = carryDevHostJob(first, view(null), NOW + DEV_HOST_RECONNECT_CEILING_MS)
    expect(later?.hostCarry).toMatchObject({ since: NOW, expired: false })
    const expired = carryDevHostJob(later, view(null), NOW + DEV_HOST_RECONNECT_CEILING_MS + 1)
    expect(expired?.hostCarry).toMatchObject({ expired: true })
    expect(expired?.host?.job?.state).toBe('running')
    const still = carryDevHostJob(expired, view(null), NOW + DEV_HOST_RECONNECT_CEILING_MS * 2)
    expect(still?.hostCarry).toMatchObject({ expired: true })
    const back = view(host())
    expect(carryDevHostJob(still, back, NOW + DEV_HOST_RECONNECT_CEILING_MS * 3)).toBe(back)
  })

  it('keeps a job the daemon has not reported for up to 30 s, on the fresh parts', () => {
    const stale = view(
      host({ parts: [part({ behindBy: 2 })], job: job({ id: 'old', state: 'done' }) })
    )
    const kept = carryDevHostJob(running, stale, NOW)
    expect(kept?.host?.job?.id).toBe('h1')
    expect(kept?.host?.parts[0]?.behindBy).toBe(2)
    expect(kept?.hostCarry).toMatchObject({ reason: 'job-missing', since: NOW })
    const swap = carryDevHostJob(kept, view(null), NOW + 1000)
    expect(swap?.hostCarry).toMatchObject({ reason: 'host-missing', since: NOW + 1000 })
    const keptAgain = carryDevHostJob(running, stale, NOW)
    expect(carryDevHostJob(keptAgain, stale, NOW + DEV_HOST_START_CEILING_MS + 1)).toBe(stale)
  })
})
