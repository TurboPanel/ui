import { describe, expect, it } from 'vitest'
import {
  activityActionLabel,
  activityCommitText,
  activityPushedBy,
  activityRangeLabel,
  activityStartedByLabel,
  activityStateLabel,
  activityStateTone,
  activityTargetLabel,
  isActivityLive,
} from '@/lib/activity'

describe('activity labels', () => {
  it('names actions and states in plain words', () => {
    expect(activityActionLabel('deploy')).toBe('Deploy')
    expect(activityActionLabel('restart')).toBe('Restart')
    expect(activityStateLabel('deploying', 'deploy')).toBe('Deploying')
    expect(activityStateLabel('deploying', 'restart')).toBe('Restarting')
    expect(activityStateLabel('deploying', 'stop')).toBe('Stopping')
    expect(activityStateLabel('deploying', 'start')).toBe('Starting')
    expect(activityStateLabel('queued', 'deploy')).toBe('Queued')
    expect(activityStateTone('queued')).toBe('muted')
    expect(activityStateLabel('failed', 'deploy')).toBe('Failed')
    expect(activityStateTone('failed')).toBe('danger')
    expect(activityStateTone('deploying')).toBe('pending')
  })

  it('names every finished outcome', () => {
    expect(activityStateLabel('succeeded', 'deploy')).toBe('Succeeded')
    expect(activityStateTone('succeeded')).toBe('ok')
    expect(activityStateLabel('cancelled', 'deploy')).toBe('Cancelled')
    expect(activityStateTone('cancelled')).toBe('muted')
    expect(activityStateLabel('failed', 'deploy', 'timed_out')).toBe('Timed Out')
    expect(activityStateLabel('failed', 'deploy', 'rolled_back')).toBe('Rolled Back')
    expect(activityStateTone('failed', 'rolled_back')).toBe('info')
    expect(activityStateLabel('failed', 'deploy', 'needs_attention')).toBe('Needs Attention')
    expect(activityStateLabel('failed', 'deploy', null)).toBe('Failed')
    expect(isActivityLive({ state: 'queued' })).toBe(true)
    expect(isActivityLive({ state: 'succeeded' })).toBe(false)
  })

  it('says who started it and which commit went live', () => {
    expect(activityStartedByLabel({ actorType: 'user', actorName: 'Ada' })).toBe('Ada')
    expect(
      activityStartedByLabel({
        actorType: 'system',
        trigger: { kind: 'push', branch: 'main', commitSha: null, sourceId: null },
      })
    ).toBe('Push to main')
    expect(activityStartedByLabel({ actorType: 'system' })).toBe('System')
    expect(activityStartedByLabel({ actorType: 'user', actorName: null })).toBe('Former Member')
    expect(activityCommitText({ commit: { sha: 'abcdef123456', message: ' Fix it ' } })).toBe(
      'abcdef1 Fix it'
    )
    expect(activityCommitText({ commit: { sha: 'abcdef123456', message: null } })).toBe('abcdef1')
    expect(activityCommitText({})).toBeNull()
  })

  it('names the git login that pushed, and falls back when none was recorded', () => {
    const startedBy = (branch: string | null, pushedBy?: string | null) =>
      activityStartedByLabel({
        actorType: 'system',
        actorName: null,
        trigger: {
          kind: 'push',
          branch,
          commitSha: null,
          sourceId: null,
          ...(pushedBy === undefined ? {} : { pushedBy }),
        },
      })
    expect(startedBy('main', 'octocat')).toBe('octocat (Push to main)')
    expect(startedBy(null, 'octocat')).toBe('octocat (Git push)')
    expect(startedBy(' main ', '  ')).toBe('Push to main')
    expect(startedBy('main', null)).toBe('Push to main')
    // A panel that predates the field sends no pushedBy at all.
    expect(startedBy('main')).toBe('Push to main')
    expect(startedBy(null)).toBe('Git push')
  })

  it('shows the git icon only for a push that named its pusher', () => {
    const trigger = { kind: 'push' as const, branch: 'main', commitSha: null, sourceId: null }
    expect(
      activityPushedBy({ actorName: null, trigger: { ...trigger, pushedBy: 'octocat' } })
    ).toBe('octocat')
    expect(activityPushedBy({ actorName: null, trigger })).toBeNull()
    expect(activityPushedBy({ actorName: null, trigger: null })).toBeNull()
    expect(
      activityPushedBy({ actorName: 'Ada', trigger: { ...trigger, pushedBy: 'x' } })
    ).toBeNull()
  })

  it('keeps members, Platform Admin, Former Member and System as they were', () => {
    const trigger = {
      kind: 'push' as const,
      branch: 'main',
      commitSha: null,
      sourceId: null,
      pushedBy: 'octocat',
    }
    expect(activityStartedByLabel({ actorType: 'user', actorName: 'Ada', trigger })).toBe('Ada')
    expect(activityStartedByLabel({ actorType: 'user', actorName: 'Platform Admin' })).toBe(
      'Platform Admin'
    )
    expect(activityStartedByLabel({ actorType: 'user', actorName: null, trigger: null })).toBe(
      'Former Member'
    )
    expect(activityStartedByLabel({ actorType: 'system', actorName: null, trigger: null })).toBe(
      'System'
    )
  })

  it('joins project and environment, degrading to what is known', () => {
    expect(activityTargetLabel({ projectName: 'My App', environmentName: 'Production' })).toBe(
      'My App / Production'
    )
    expect(activityTargetLabel({ projectName: 'My App', environmentName: null })).toBe('My App')
    expect(activityTargetLabel({ projectName: null, environmentName: null })).toBe('—')
  })

  it('reads the pager range', () => {
    expect(activityRangeLabel(0, 25, 237)).toBe('1–25 of 237')
    expect(activityRangeLabel(225, 12, 237)).toBe('226–237 of 237')
    expect(activityRangeLabel(0, 0, 0)).toBe('0 of 0')
    expect(activityRangeLabel(0, 25, 1025, true)).toBe('1–25 of 1,025+')
  })
})
