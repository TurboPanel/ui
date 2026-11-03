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
  devHostRestarting,
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
      'Control Plane: 1 new commit on trunk',
      'Daemon: restart needed',
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

  it('is hidden when nothing needs doing, even right after a finished job', () => {
    expect(devHostBarVisible({ ...base, host: host() })).toBe(false)
    const done = job({ state: 'done', endedAt: ago(1000) })
    expect(devHostBarVisible({ ...base, host: host({ job: done }) })).toBe(false)
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

  it('shows the step and its place, or the restart while the control plane is away', () => {
    expect(devHostProgressLine(job(), false)).toBe('Pulling… (step 2 of 3)')
    expect(devHostProgressLine(job({ step: '', steps: [] }), false)).toBe('Working…')
    expect(devHostProgressLine(job(), true)).toBe(DEV_HOST_RESTARTING)
  })

  it('the restart gap is a failing read while a host job runs', () => {
    expect(devHostRestarting(job(), true)).toBe(true)
    expect(devHostRestarting(job(), false)).toBe(false)
    expect(devHostRestarting(job({ state: 'failed' }), true)).toBe(false)
    expect(devHostRestarting(null, true)).toBe(false)
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
