import { describe, expect, it } from 'vitest'
import {
  DEVELOPMENT_BANNER_TITLE,
  DEVELOPMENT_JOB_POLL_MS,
  developmentBanner,
  developmentChangesPending,
  developmentDaemonLabel,
  developmentJobJustFinished,
  developmentJobRunning,
  developmentJobServerResult,
  developmentJobView,
  developmentPollInterval,
  developmentPushLabel,
  developmentServerStatus,
  isDevelopmentInstall,
  runningFromCheckoutLine,
} from '@/lib/development-updates'
import type { DevelopmentJob } from '@/lib/instance-api'

const BUILT = { commit: 'abc1234def567890', buildId: 'b1', builtAt: '', source: '/src' }

function job(state: DevelopmentJob['state'], id = 'job-1'): DevelopmentJob {
  return { id, state, startedAt: null, endedAt: null, message: null, servers: [] }
}

describe('isDevelopmentInstall', () => {
  it('is true only when the control plane says so; missing reads as a release install', () => {
    expect(isDevelopmentInstall({ development: true })).toBe(true)
    expect(isDevelopmentInstall({ development: false })).toBe(false)
    expect(isDevelopmentInstall({})).toBe(false)
    expect(isDevelopmentInstall(null)).toBe(false)
    expect(isDevelopmentInstall(undefined)).toBe(false)
  })
})

describe('developmentChangesPending', () => {
  it('follows pendingDaemonChanges and is off before the view is read', () => {
    expect(developmentChangesPending({ pendingDaemonChanges: true })).toBe(true)
    expect(developmentChangesPending({ pendingDaemonChanges: false })).toBe(false)
    expect(developmentChangesPending(null)).toBe(false)
  })
})

describe('developmentBanner', () => {
  const daemonBuild = { built: BUILT, sourceFingerprint: 'fp-1', sourceChanged: false }

  it('shows only while servers lack daemon changes, and never says it installs on its own', () => {
    const banner = developmentBanner({
      development: { pendingDaemonChanges: true, daemonBuild },
      dismissedKey: null,
    })
    expect(banner?.title).toBe(DEVELOPMENT_BANNER_TITLE)
    expect(banner?.body).not.toMatch(/on its own/)
    expect(
      developmentBanner({
        development: { pendingDaemonChanges: false, daemonBuild },
        dismissedKey: null,
      })
    ).toBeNull()
    expect(developmentBanner({ development: null, dismissedKey: null })).toBeNull()
  })

  it('stays dismissed for this checkout and comes back after a new change', () => {
    const development = { pendingDaemonChanges: true, daemonBuild }
    const key = developmentBanner({ development, dismissedKey: null })?.key ?? ''
    expect(developmentBanner({ development, dismissedKey: key })).toBeNull()
    expect(
      developmentBanner({
        development: { ...development, daemonBuild: { ...daemonBuild, sourceFingerprint: 'fp-2' } },
        dismissedKey: key,
      })
    ).not.toBeNull()
  })
})

describe('developmentPushLabel', () => {
  it('says Push Daemon only when a build exists and the checkout has not changed', () => {
    expect(developmentPushLabel({ built: BUILT, sourceChanged: false })).toBe('Push Daemon')
    expect(developmentPushLabel({ built: BUILT, sourceChanged: true })).toBe(
      'Build and Push Daemon'
    )
    expect(developmentPushLabel({ built: null, sourceChanged: false })).toBe(
      'Build and Push Daemon'
    )
    expect(developmentPushLabel(undefined)).toBe('Build and Push Daemon')
  })
})

describe('developmentServerStatus', () => {
  it('maps each server to one status word', () => {
    expect(developmentServerStatus({ connected: true, onLatestBuild: true })).toEqual({
      label: 'On Latest Build',
      tone: 'ok',
    })
    expect(developmentServerStatus({ connected: true, onLatestBuild: false })).toEqual({
      label: 'Behind',
      tone: 'pending',
    })
    expect(developmentServerStatus({ connected: false, onLatestBuild: true })).toEqual({
      label: 'Not Connected',
      tone: 'muted',
    })
  })
})

describe('developmentDaemonLabel', () => {
  it('names the version and short commit, either alone, or says nothing was reported', () => {
    expect(developmentDaemonLabel({ daemonVersion: '0.1.5', daemonCommit: BUILT.commit })).toBe(
      'v0.1.5 · abc1234def56'
    )
    expect(developmentDaemonLabel({ daemonVersion: '0.1.5', daemonCommit: null })).toBe('v0.1.5')
    expect(developmentDaemonLabel({ daemonVersion: null, daemonCommit: 'abc' })).toBe('abc')
    expect(developmentDaemonLabel({ daemonVersion: ' ', daemonCommit: null })).toBe('Not reported')
  })
})

describe('development job', () => {
  it('runs while building or pushing', () => {
    expect(developmentJobRunning(job('building'))).toBe(true)
    expect(developmentJobRunning(job('pushing'))).toBe(true)
    expect(developmentJobRunning(job('done'))).toBe(false)
    expect(developmentJobRunning(job('failed'))).toBe(false)
    expect(developmentJobRunning(null)).toBe(false)
  })

  it('polls every 2 s only while the job runs', () => {
    expect(DEVELOPMENT_JOB_POLL_MS).toBe(2_000)
    expect(developmentPollInterval({ job: job('building') })).toBe(2_000)
    expect(developmentPollInterval({ job: job('pushing') })).toBe(2_000)
    expect(developmentPollInterval({ job: job('done') })).toBe(false)
    expect(developmentPollInterval({ job: job('failed') })).toBe(false)
    expect(developmentPollInterval({ job: null })).toBe(false)
    expect(developmentPollInterval(null)).toBe(false)
  })

  it('reads each state in words', () => {
    expect(developmentJobView(job('building')).label).toBe('Building…')
    expect(developmentJobView(job('pushing')).label).toBe('Pushing…')
    expect(developmentJobView(job('done'))).toEqual({ label: 'Done', tone: 'ok' })
    expect(developmentJobView(job('failed'))).toEqual({ label: 'Failed', tone: 'danger' })
  })

  it('reads each server result, with the error when it failed', () => {
    expect(developmentJobServerResult({ ok: true, skipped: false, error: null }).label).toBe(
      'Updated'
    )
    expect(developmentJobServerResult({ ok: false, skipped: true, error: null }).label).toBe(
      'Skipped'
    )
    expect(developmentJobServerResult({ ok: false, skipped: false, error: 'timed out' })).toEqual({
      label: 'Failed',
      tone: 'danger',
      detail: 'timed out',
    })
  })

  it('counts as just finished only when the same job leaves building or pushing', () => {
    expect(developmentJobJustFinished(job('pushing'), job('done'))).toBe(true)
    expect(developmentJobJustFinished(job('building'), job('failed'))).toBe(true)
    expect(developmentJobJustFinished(job('building'), job('pushing'))).toBe(false)
    expect(developmentJobJustFinished(job('done'), job('done'))).toBe(false)
    expect(developmentJobJustFinished(null, job('done'))).toBe(false)
    expect(developmentJobJustFinished(job('pushing'), job('done', 'job-2'))).toBe(false)
    expect(developmentJobJustFinished(job('pushing'), null)).toBe(false)
  })
})

describe('runningFromCheckoutLine', () => {
  it('names the short commit when known', () => {
    expect(runningFromCheckoutLine(BUILT.commit)).toBe('Commit abc1234def56')
    expect(runningFromCheckoutLine('unknown')).toBeNull()
    expect(runningFromCheckoutLine(null)).toBeNull()
  })
})
