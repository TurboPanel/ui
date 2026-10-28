import { describe, expect, it } from 'vitest'
import {
  fleetComponentLabel,
  fleetStatusBadge,
  fleetProgressText,
  formatUpgradeBuildDisplayName,
  installedBuildLabel,
  mapStepStatusToPipeline,
  offlineWaitingNotice,
  pieceIdentityLines,
  stepInFlight,
  platformUpgradeHeadlineCopy,
  resolvePlatformUpgradeHeadline,
  runWaitsOnlyOnOffline,
  stepHasStarted,
  summarizeFleetSteps,
  updateAvailabilityBadge,
  updateAvailableSentence,
  upgradeBuildDetailLines,
  upgradeBuildVersionLabel,
  upgradeChannelTitle,
  upgradePhaseLabel,
  upgradeRunErrorLabel,
  upgradeServerLabel,
  upgradeStepLabel,
  upgradeStepNote,
  upgradeStepErrorLabel,
  upgradeStepOutcome,
  retryLaterText,
  stepMessageText,
} from '@/lib/upgrade-display'

describe('formatUpgradeBuildDisplayName', () => {
  it('formats channel and builtAt', () => {
    const label = formatUpgradeBuildDisplayName(
      {
        channel: 'canary',
        builtAt: '2026-09-19T19:30:00.000Z',
        commit: 'abc',
        buildId: 'b1',
      },
      { locale: 'en-US', timeZone: 'UTC' }
    )
    expect(label).toBe('abc · Sep 19, 07:30 PM')
  })

  it('falls back to version when builtAt is invalid', () => {
    expect(
      formatUpgradeBuildDisplayName({
        channel: 'release',
        builtAt: '',
        version: '0.1.2',
        commit: 'unknown',
        buildId: '',
      })
    ).toBe('v0.1.2')
  })
})

describe('mapStepStatusToPipeline', () => {
  it('maps active install stages', () => {
    expect(mapStepStatusToPipeline('downloading')).toBe('downloading')
    expect(mapStepStatusToPipeline('dispatched')).toBe('preparing')
    expect(mapStepStatusToPipeline('done')).toBe('done')
    expect(mapStepStatusToPipeline('needs_attention')).toBe('verifying')
  })
})

describe('summarizeFleetSteps', () => {
  it('counts fleet terminals', () => {
    const summary = summarizeFleetSteps([
      { phase: 'fleet', status: 'done' },
      { phase: 'fleet', status: 'done' },
      { phase: 'fleet', status: 'needs_attention' },
      { phase: 'control_plane', status: 'installing' },
    ])
    expect(summary).toEqual({
      upToDate: 2,
      total: 3,
      needsAttention: 1,
      inProgress: 0,
      skippedOffline: 0,
      skippedOther: 0,
    })
  })

  it('counts skipped servers separately, never as up to date', () => {
    const summary = summarizeFleetSteps([
      { phase: 'fleet', status: 'done' },
      { phase: 'fleet', status: 'done' },
      { phase: 'fleet', status: 'skipped', errorCode: 'server_offline' },
      { phase: 'fleet', status: 'skipped' },
    ])
    expect(summary).toMatchObject({ upToDate: 2, total: 4, skippedOffline: 1, skippedOther: 1 })
    expect(fleetProgressText(summary, 'servers')).toBe(
      '2 of 4 servers up to date, 1 skipped (offline), 1 skipped'
    )
    expect(fleetProgressText({ ...summary, skippedOffline: 0, skippedOther: 0 }, 'servers')).toBe(
      '2 of 4 servers up to date'
    )
  })
})

describe('resolvePlatformUpgradeHeadline', () => {
  it('prefers needs attention over updating', () => {
    expect(
      resolvePlatformUpgradeHeadline({
        activeRunStatus: 'running',
        updateAvailable: true,
        needsAttentionCount: 1,
      })
    ).toBe('needs_attention')
  })

  it('marks an active run as updating', () => {
    expect(
      resolvePlatformUpgradeHeadline({
        activeRunStatus: 'running',
        updateAvailable: false,
        needsAttentionCount: 0,
      })
    ).toBe('updating')
  })

  it('falls back to update available and up to date', () => {
    expect(
      resolvePlatformUpgradeHeadline({
        activeRunStatus: null,
        updateAvailable: true,
        needsAttentionCount: 0,
      })
    ).toBe('update_available')
    expect(
      resolvePlatformUpgradeHeadline({
        activeRunStatus: 'succeeded',
        updateAvailable: false,
        needsAttentionCount: 0,
      })
    ).toBe('up_to_date')
    expect(platformUpgradeHeadlineCopy('needs_attention')).toBe('Needs Attention')
    expect(platformUpgradeHeadlineCopy('update_available')).toBe('Update Waiting')
  })

  it('leads with a pause over everything else', () => {
    expect(
      resolvePlatformUpgradeHeadline({
        activeRunStatus: 'running',
        updateAvailable: true,
        needsAttentionCount: 2,
        paused: true,
      })
    ).toBe('paused')
    expect(platformUpgradeHeadlineCopy('paused')).toBe('Updates Paused')
  })
})

describe('upgrade display helpers', () => {
  it('titles channels and builds detail lines', () => {
    expect(upgradeChannelTitle('')).toBe('Build')
    expect(upgradeChannelTitle('canary')).toBe('Canary')
    expect(formatUpgradeBuildDisplayName(null)).toBe('No package on this channel')
    expect(
      formatUpgradeBuildDisplayName({
        channel: 'rc',
        builtAt: 'not-a-date',
        version: '1.0.0',
        commit: 'unknown',
        buildId: 'build-abcdef123456',
      })
    ).toBe('v1.0.0')
    expect(
      upgradeBuildDetailLines({
        version: ' 1.2 ',
        commit: 'unknown',
        buildId: 'bid-1',
        manifestUrl: ' https://example/manifest.json ',
      })
    ).toEqual({
      version: '1.2',
      commit: 'bid-1',
      manifestUrl: 'https://example/manifest.json',
    })
  })

  it('labels phases and maps pipeline edge cases', () => {
    expect(upgradePhaseLabel('fleet')).toBe('Server updates')
    expect(upgradePhaseLabel(null)).toBe('Update')
    expect(mapStepStatusToPipeline(null)).toBe('preparing')
    expect(mapStepStatusToPipeline('failed')).toBe('verifying')
    expect(mapStepStatusToPipeline('installing')).toBe('installing')
    expect(mapStepStatusToPipeline('pending')).toBe('preparing')
  })
})

describe('upgradeStepOutcome', () => {
  it('shows a failed or rolled-back step as that, never as "Verifying"', () => {
    expect(upgradeStepOutcome({ status: 'failed' }).label).toBe('Failed')
    expect(upgradeStepOutcome({ status: 'failed' }).tone).toBe('danger')
    expect(upgradeStepOutcome({ status: 'rolled_back', errorCode: 'rolled_back' })).toEqual({
      tone: 'danger',
      label: 'Rolled Back',
      detail: 'Rolled back to the previous build',
    })
    expect(upgradeStepOutcome({ status: 'needs_attention', errorCode: 'server_offline' })).toEqual({
      tone: 'pending',
      label: 'Needs Attention',
      detail: 'Server offline for over an hour',
    })
    expect(upgradeStepOutcome({ status: 'skipped', errorCode: 'server_offline' })).toEqual({
      tone: 'muted',
      label: 'Skipped: Offline',
      detail: 'It was offline when the update started. It updates on its own when it reconnects.',
    })
  })

  it('shows the panel message for a skipped offline step, else the fixed text', () => {
    const own =
      'It stayed offline for 15 minutes during the update. It updates on its own when it reconnects.'
    expect(
      upgradeStepOutcome({ status: 'skipped', errorCode: 'server_offline', errorMessage: own })
    ).toMatchObject({ label: 'Skipped: Offline', detail: own })
    expect(
      upgradeStepOutcome({ status: 'skipped', errorCode: 'server_offline', errorMessage: ' ' })
    ).toMatchObject({
      detail: 'It was offline when the update started. It updates on its own when it reconnects.',
    })
  })

  it('words a failed update delivery in plain language, not as the raw code', () => {
    const outcome = upgradeStepOutcome({ status: 'needs_attention', errorCode: 'dispatch_failed' })
    expect(outcome.detail).toBe("Couldn't reach the server")
    expect(outcome.detail).not.toContain('dispatch_failed')
  })

  it('explains a skipped server that is already newer than the target', () => {
    expect(upgradeStepOutcome({ status: 'skipped', errorCode: 'downgrade_refused' }).detail).toBe(
      'Already newer than the target'
    )
  })

  it('calls a step that has not started queued, not preparing', () => {
    expect(upgradeStepOutcome({ status: 'pending' })).toEqual({
      tone: 'pending',
      label: 'Queued',
      detail: null,
    })
    expect(upgradeStepOutcome({ status: 'waiting' }).label).toBe('Waiting for Server')
    expect(upgradeStepOutcome({ status: 'preparing' }).label).toBe('Preparing')
  })

  it('keeps showing the stage for a step still in progress', () => {
    expect(upgradeStepOutcome({ status: 'downloading' })).toEqual({
      tone: 'active',
      label: 'Downloading',
      detail: null,
    })
    expect(upgradeStepOutcome({ status: 'done' }).label).toBe('Done')
  })

  it("shows a daemon's own reason code verbatim", () => {
    expect(upgradeStepErrorLabel('health_check_failed')).toBe('health_check_failed')
    expect(upgradeStepErrorLabel(null)).toBeNull()
  })

  it('names the run errors the control plane ends a run with', () => {
    expect(upgradeRunErrorLabel('colocated_daemon_failed')).toBe('The daemon step failed')
    expect(upgradeRunErrorLabel('control_plane_failed')).toBe('The control plane step failed')
    expect(upgradeRunErrorLabel('updates_paused')).toBe('Stopped because updates were paused')
    expect(upgradeRunErrorLabel('')).toBeNull()
  })

  it('names the automatic update step codes in plain words', () => {
    expect(upgradeStepErrorLabel('updates_paused')).toBe('Not started because updates were paused')
    expect(upgradeStepErrorLabel('retry_later')).toBe('Failed before; tries again later')
    expect(upgradeStepOutcome({ status: 'skipped', errorCode: 'updates_paused' })).toMatchObject({
      label: 'Skipped: Paused',
      detail: 'Not started because updates were paused',
    })
    expect(
      upgradeStepOutcome({
        status: 'skipped',
        errorCode: 'retry_later',
        errorMessage: RETRY_MESSAGE,
      })
    ).toMatchObject({ tone: 'pending', label: 'Tries Again Later' })
  })
})

describe('build names', () => {
  const at = { builtAt: '2026-09-29T09:10:00.000Z', commit: 'abc', buildId: 'b' }
  const opts = { locale: 'en-US', timeZone: 'UTC' }

  it('names canary, rc and release builds by their version, with the date', () => {
    expect(
      formatUpgradeBuildDisplayName({ ...at, channel: 'canary', version: '0.1.5-canary.1' }, opts)
    ).toBe('v0.1.5-canary.1 · Sep 29, 09:10 AM')
    expect(
      formatUpgradeBuildDisplayName({ ...at, channel: 'rc', version: '0.1.5-rc.2' }, opts)
    ).toBe('v0.1.5-rc.2 · Sep 29, 09:10 AM')
    expect(
      formatUpgradeBuildDisplayName({ ...at, channel: 'release', version: '0.1.5' }, opts)
    ).toBe('v0.1.5 · Sep 29, 09:10 AM')
  })

  it('names an older timestamp canary by its version too', () => {
    expect(
      formatUpgradeBuildDisplayName(
        {
          channel: 'canary',
          builtAt: '2026-09-19T19:30:00.000Z',
          version: '0.1.1-canary.20260919-143000-abc1234',
          commit: 'abc',
          buildId: 'b',
        },
        opts
      )
    ).toBe('v0.1.1-canary.20260919-143000-abc1234 · Sep 19, 07:30 PM')
  })

  it('names the version alone without a date, and never says Canary # or RC n', () => {
    const noDate = { ...at, builtAt: '' }
    expect(
      formatUpgradeBuildDisplayName({ ...noDate, channel: 'canary', version: '0.1.3-canary.417' })
    ).toBe('v0.1.3-canary.417')
    expect(formatUpgradeBuildDisplayName({ ...noDate, channel: 'rc', version: '0.1.3-rc.2' })).toBe(
      'v0.1.3-rc.2'
    )
    expect(upgradeChannelTitle('rc')).toBe('RC')
  })

  it('keeps a single v on a version that already has one', () => {
    expect(
      upgradeBuildVersionLabel({ version: 'v0.1.5-canary.1', commit: 'abc', buildId: 'b' })
    ).toBe('v0.1.5-canary.1')
    expect(upgradeBuildVersionLabel({ version: ' 0.1.5 ', commit: 'abc', buildId: 'b' })).toBe(
      'v0.1.5'
    )
    expect(upgradeBuildVersionLabel({ commit: 'unknown', buildId: '' })).toBeNull()
  })
})

describe('build identity fallback', () => {
  const noDate = { builtAt: '', commit: '', buildId: '' }

  it('names a build with no date by version, then commit, then build id', () => {
    expect(
      formatUpgradeBuildDisplayName({ ...noDate, channel: 'canary', version: ' 0.1.1 ' })
    ).toBe('v0.1.1')
    expect(
      formatUpgradeBuildDisplayName({
        ...noDate,
        channel: 'canary',
        commit: 'a96b655123456789abcdef',
        buildId: 'b1',
      })
    ).toBe('a96b65512345')
    expect(
      formatUpgradeBuildDisplayName({
        ...noDate,
        channel: 'canary',
        commit: 'unknown',
        buildId: 'build-abcdef123456',
      })
    ).toBe('build-abcdef')
    expect(formatUpgradeBuildDisplayName({ ...noDate, channel: 'canary', commit: 'unknown' })).toBe(
      'Canary'
    )
    expect(formatUpgradeBuildDisplayName({ ...noDate, channel: '' })).toBe('Build')
  })

  it('names a plain version the same on every channel', () => {
    expect(
      formatUpgradeBuildDisplayName({ ...noDate, channel: ' Release ', version: 'v0.1.3' })
    ).toBe('v0.1.3')
    expect(formatUpgradeBuildDisplayName({ ...noDate, channel: 'rc', version: '0.1.3' })).toBe(
      'v0.1.3'
    )
  })

  it('shows the date for a plain release', () => {
    expect(
      formatUpgradeBuildDisplayName(
        { ...noDate, channel: 'release', version: '0.1.3', builtAt: ' 2026-09-29T09:10:00.000Z ' },
        { locale: 'en-US', timeZone: 'UTC' }
      )
    ).toBe('v0.1.3 · Sep 29, 09:10 AM')
  })
})

describe('installedBuildLabel', () => {
  const target = { commit: 'a96b6551234567890abcdef1234567890abcdef', version: '0.1.3-canary.417' }

  it("prefers the unit's own label", () => {
    expect(
      installedBuildLabel({ version: '0.1.3', commit: 'a96b655', label: 'v0.1.3-rc.2' }, target)
    ).toBe('0.1.3-rc.2 · a96b655')
  })

  it("takes the target's version when the installed commit is the target's commit", () => {
    expect(installedBuildLabel({ version: '0.1.3', commit: 'a96b655' }, target)).toBe(
      '0.1.3-canary.417 · a96b655'
    )
  })

  it('falls back to the plain version when it is some other build', () => {
    expect(installedBuildLabel({ version: '0.1.2', commit: 'ea1d63a' }, target)).toBe(
      '0.1.2 · ea1d63a'
    )
    expect(installedBuildLabel({ version: '0.1.2', commit: null }, null)).toBe('0.1.2')
    expect(installedBuildLabel({ version: null, commit: 'ea1d63a1234' }, null)).toBe('ea1d63a')
    expect(installedBuildLabel(null, target)).toBe('Unknown')
  })

  it('does not match short or missing commits', () => {
    expect(
      installedBuildLabel(
        { version: '0.1.2', commit: 'abc' },
        { commit: 'abc', version: '0.1.3-canary.1' }
      )
    ).toBe('0.1.2 · abc')
  })

  it('drops the commit with hideCommit, leaving the version alone', () => {
    expect(
      installedBuildLabel({ version: '0.1.4', commit: '3f7eb36' }, null, { hideCommit: true })
    ).toBe('0.1.4')
    expect(
      installedBuildLabel({ version: '0.1.4', commit: '3f7eb36' }, null, { hideCommit: false })
    ).toBe('0.1.4 · 3f7eb36')
    // No version at all: a hidden commit never falls back to a bare hash.
    expect(
      installedBuildLabel({ version: null, commit: '3f7eb36' }, null, { hideCommit: true })
    ).toBe('Unknown')
  })
})

describe('a run that has not started reads as not started', () => {
  it('has no started step for a missing, pending or waiting status', () => {
    expect(stepHasStarted(null)).toBe(false)
    expect(stepHasStarted('pending')).toBe(false)
    expect(stepHasStarted('waiting')).toBe(false)
    expect(stepHasStarted('preparing')).toBe(true)
    expect(stepHasStarted('done')).toBe(true)
    expect(stepHasStarted('failed')).toBe(true)
  })

  it('says "Not started" for a step with no status, never "Preparing"', () => {
    expect(upgradeStepOutcome({ status: null })).toEqual({
      tone: 'muted',
      label: 'Not Started',
      detail: null,
    })
  })
})

describe('updateAvailabilityBadge', () => {
  it('names each state in words', () => {
    expect(updateAvailabilityBadge(null)).toEqual({ tone: 'muted', label: 'Not Connected' })
    expect(updateAvailabilityBadge(true)).toEqual({ tone: 'pending', label: 'Update Waiting' })
    expect(updateAvailabilityBadge(false)).toEqual({ tone: 'ok', label: 'Up to Date' })
  })
})

describe('fleetStatusBadge', () => {
  it('names what the rollout is doing with a server', () => {
    expect(fleetStatusBadge('pending')).toEqual({ tone: 'muted', label: 'Waiting' })
    expect(fleetStatusBadge('waiting')).toEqual({ tone: 'pending', label: 'Offline' })
    expect(fleetStatusBadge('installing')).toEqual({ tone: 'info', label: 'Updating' })
    expect(fleetStatusBadge('done')).toEqual({ tone: 'ok', label: 'Updated' })
    expect(fleetStatusBadge('failed')).toEqual({ tone: 'danger', label: 'Failed' })
    expect(fleetStatusBadge('rolled_back')).toEqual({ tone: 'danger', label: 'Rolled Back' })
    expect(fleetStatusBadge('needs_attention')).toEqual({
      tone: 'pending',
      label: 'Needs Attention',
    })
    expect(fleetStatusBadge('skipped')).toEqual({ tone: 'muted', label: 'Skipped' })
    expect(fleetStatusBadge('skipped', 'server_offline')).toEqual({
      tone: 'muted',
      label: 'Skipped: Offline',
    })
  })

  it('names the automatic update codes in the Status column, whatever the message says', () => {
    expect(fleetStatusBadge('skipped', 'updates_paused')).toEqual({
      tone: 'muted',
      label: 'Skipped: Paused',
    })
    expect(fleetStatusBadge('skipped', 'retry_later')).toEqual({
      tone: 'pending',
      label: 'Tries Again Later',
    })
    expect(fleetStatusBadge('failed', 'retry_later')).toEqual({ tone: 'danger', label: 'Failed' })
  })
})

describe('offlineWaitingNotice', () => {
  it('says offline only for steps the panel reports as not connected', () => {
    expect(
      offlineWaitingNotice([
        { status: 'done', connected: true },
        { status: 'waiting', connected: false, attempts: 0 },
        { status: 'waiting', connected: false, attempts: 0 },
      ])
    ).toBe(
      '2 servers are offline, so this update is waiting for them. They are skipped if they stay offline, and they update on their own when they reconnect.'
    )
    expect(offlineWaitingNotice([{ status: 'waiting', connected: false, attempts: 0 }])).toBe(
      '1 server is offline, so this update is waiting for it. It is skipped if it stays offline, and it updates on its own when it reconnects.'
    )
  })

  it('makes no offline claim when connected is missing, in flight, or nothing waits', () => {
    expect(offlineWaitingNotice([{ status: 'done' }, { status: 'waiting' }])).toBeNull()
    expect(offlineWaitingNotice([{ status: 'waiting', phase: 'fleet' }])).toBeNull()
    expect(
      offlineWaitingNotice([
        { status: 'waiting', connected: false, attempts: 0 },
        { status: 'installing', connected: true },
      ])
    ).toBeNull()
    expect(offlineWaitingNotice([{ status: 'done' }])).toBeNull()
    expect(offlineWaitingNotice([])).toBeNull()
  })
})

describe('runWaitsOnlyOnOffline', () => {
  it('is true when leftover fleet steps are on servers reported not connected', () => {
    expect(
      runWaitsOnlyOnOffline({
        steps: [
          { status: 'done', phase: 'fleet', connected: true },
          { status: 'waiting', phase: 'fleet', connected: false, attempts: 0 },
          { status: 'waiting', phase: 'fleet', connected: false, attempts: 0 },
        ],
      })
    ).toBe(true)
  })

  it('stays blocked for in-flight, connected, platform-phase or unknown steps', () => {
    expect(
      runWaitsOnlyOnOffline({
        steps: [
          { status: 'waiting', connected: false, attempts: 0 },
          { status: 'installing', connected: true },
        ],
      })
    ).toBe(false)
    expect(runWaitsOnlyOnOffline({ steps: [{ status: 'pending', connected: true }] })).toBe(false)
    expect(
      runWaitsOnlyOnOffline({
        steps: [{ status: 'waiting', phase: 'colocated_daemon', connected: false, attempts: 0 }],
      })
    ).toBe(false)
    expect(runWaitsOnlyOnOffline({ steps: [] })).toBe(false)
    expect(runWaitsOnlyOnOffline(null)).toBe(false)
  })

  it('blocks a pending step, a step already tried, and a panel that omits attempts', () => {
    expect(
      runWaitsOnlyOnOffline({ steps: [{ status: 'pending', connected: false, attempts: 0 }] })
    ).toBe(false)
    expect(
      runWaitsOnlyOnOffline({ steps: [{ status: 'waiting', connected: false, attempts: 1 }] })
    ).toBe(false)
    expect(runWaitsOnlyOnOffline({ steps: [{ status: 'waiting', connected: false }] })).toBe(false)
    expect(offlineWaitingNotice([{ status: 'waiting', connected: false }])).toBeNull()
    expect(offlineWaitingNotice([{ status: 'waiting', connected: false, attempts: 1 }])).toBeNull()
  })

  it('treats an older panel that omits connected or phase as unknown and stays blocked', () => {
    expect(runWaitsOnlyOnOffline({ steps: [{ status: 'waiting' }] })).toBe(false)
    expect(runWaitsOnlyOnOffline({ steps: [{ status: 'pending' }] })).toBe(false)
    expect(runWaitsOnlyOnOffline({ steps: [{ status: 'waiting', phase: 'fleet' }] })).toBe(false)
    expect(
      runWaitsOnlyOnOffline({ steps: [{ status: 'waiting', connected: false, attempts: 0 }] })
    ).toBe(true)
  })
})

describe('updateAvailableSentence', () => {
  it('names the pieces with their versions in reading order', () => {
    expect(updateAvailableSentence([])).toBeNull()
    expect(updateAvailableSentence(['daemon v0.1.6-canary.3'])).toBe(
      'Daemon v0.1.6-canary.3 can be updated.'
    )
    expect(updateAvailableSentence(['control plane v0.1.5-canary.1', 'UI v0.1.5-canary.2'])).toBe(
      'Control plane v0.1.5-canary.1 and UI v0.1.5-canary.2 can be updated.'
    )
    expect(
      updateAvailableSentence([
        'control plane v0.1.5-canary.1',
        'UI v0.1.5-canary.2',
        'daemon v0.1.6-canary.3',
      ])
    ).toBe(
      'Control plane v0.1.5-canary.1, UI v0.1.5-canary.2 and daemon v0.1.6-canary.3 can be updated.'
    )
  })
})

describe('upgrade step wording', () => {
  it('says which version runs at each step', () => {
    expect(upgradeStepLabel('installing')).toBe('Writing new files (still running the old version)')
    expect(upgradeStepLabel('restarting')).toBe('Restarting onto the new version')
    expect(upgradeStepLabel('verifying')).toBe('Checking the new version is running')
    expect(upgradeStepLabel('preparing')).toBe('Preparing')
  })

  it('is in flight until the step ends', () => {
    expect(stepInFlight('installing')).toBe(true)
    expect(stepInFlight('pending')).toBe(true)
    expect(stepInFlight('done')).toBe(false)
    expect(stepInFlight('failed')).toBe(false)
    expect(stepInFlight(null)).toBe(false)
  })

  it('never says Up to date while a run is working on the piece', () => {
    expect(updateAvailabilityBadge(false, true)).toEqual({ tone: 'pending', label: 'Updating' })
    expect(updateAvailabilityBadge(false)).toEqual({ tone: 'ok', label: 'Up to Date' })
  })
})

describe('pieceIdentityLines', () => {
  const running = { version: '0.1.4', commit: 'aaaaaaa1111' }
  const to = { toVersion: '0.1.5', toCommit: 'bbbbbbb2222' }

  it('shows only the running line with no run', () => {
    expect(pieceIdentityLines({ running, runningLabel: '0.1.4 · aaaaaaa', step: null })).toEqual({
      installedOnDisk: null,
      runningNow: '0.1.4 · aaaaaaa',
      updatingTo: null,
      restartPending: false,
    })
  })

  it('names the target as Updating to before the files are written', () => {
    const lines = pieceIdentityLines({
      running,
      runningLabel: '0.1.4 · aaaaaaa',
      step: { status: 'installing', ...to },
    })
    expect(lines.updatingTo).toBe('0.1.5 · bbbbbbb')
    expect(lines.installedOnDisk).toBeNull()
    expect(lines.restartPending).toBe(false)
  })

  it('shows the new files on disk and a pending restart once restarting', () => {
    const lines = pieceIdentityLines({
      running,
      runningLabel: '0.1.4 · aaaaaaa',
      step: { status: 'restarting', ...to },
    })
    expect(lines.installedOnDisk).toBe('0.1.5 · bbbbbbb')
    expect(lines.updatingTo).toBeNull()
    expect(lines.restartPending).toBe(true)
  })

  it('has no pending restart once the running commit is the target', () => {
    const lines = pieceIdentityLines({
      running: { version: '0.1.5', commit: 'bbbbbbb2222' },
      runningLabel: '0.1.5 · bbbbbbb',
      step: { status: 'verifying', ...to },
    })
    expect(lines.installedOnDisk).toBe('0.1.5 · bbbbbbb')
    expect(lines.restartPending).toBe(false)
  })

  it('shows nothing about disk when the step has ended', () => {
    const lines = pieceIdentityLines({
      running,
      runningLabel: 'x',
      step: { status: 'done', ...to },
    })
    expect(lines.installedOnDisk).toBeNull()
    expect(lines.updatingTo).toBeNull()
  })
})

describe('fleetComponentLabel', () => {
  it('names the daemon for server rows', () => {
    expect(fleetComponentLabel({ unit: 'daemon' })).toBe('Daemon')
    expect(fleetComponentLabel({})).toBe('Daemon')
  })
  it('names the control plane for an instance row', () => {
    expect(fleetComponentLabel({ unit: 'instance' })).toBe('Control plane')
  })
})

describe('runWaitsOnlyOnOffline platform phases', () => {
  it('does not treat a waiting platform-phase step as skippable', () => {
    expect(
      runWaitsOnlyOnOffline({
        steps: [{ status: 'waiting', phase: 'colocated_daemon', connected: false, attempts: 0 }],
      })
    ).toBe(false)
    expect(
      runWaitsOnlyOnOffline({
        steps: [{ status: 'waiting', phase: 'fleet', connected: false, attempts: 0 }],
      })
    ).toBe(true)
  })
})

describe('upgradeServerLabel', () => {
  const serverId = '01a163c1-aaaa-7bbb-8ccc-0123456789ab'

  it('puts the name first and keeps the short id as secondary text', () => {
    expect(upgradeServerLabel({ serverId, serverName: ' w ', hostname: 'w.lan' })).toEqual({
      primary: 'w',
      shortId: '01a163c1',
    })
  })

  it('falls back to the hostname when the server has no name', () => {
    expect(upgradeServerLabel({ serverId, serverName: null, hostname: 'w.lan' })).toEqual({
      primary: 'w.lan',
      shortId: '01a163c1',
    })
  })

  it('shows only the id fragment, once, when nothing names the server', () => {
    expect(upgradeServerLabel({ serverId })).toEqual({ primary: '01a163c1', shortId: null })
    expect(upgradeServerLabel({ serverId, serverName: '  ', hostname: '' })).toEqual({
      primary: '01a163c1',
      shortId: null,
    })
  })
})

describe('upgradeStepNote', () => {
  it('returns the saved restart note and nothing otherwise', () => {
    expect(upgradeStepNote({ detail: { restartNote: ' came back ' } })).toBe('came back')
    expect(upgradeStepNote({ detail: {} })).toBeNull()
    expect(upgradeStepNote({ detail: null })).toBeNull()
    expect(upgradeStepNote({})).toBeNull()
  })
})

const RETRY_MESSAGE =
  'It failed to update to this build 3 times. It tries again automatically after 2026-10-27T15:40:00.000Z.'

describe('retryLaterText', () => {
  const utc = { timeZone: 'UTC' }

  it('says the time alone when the retry is today, never the raw message', () => {
    const text = retryLaterText(RETRY_MESSAGE, { ...utc, now: new Date('2026-10-27T09:00:00Z') })
    expect(text).toMatch(/^Tries again at 3:40\sPM$/)
    expect(text).not.toContain('2026-10-27T')
  })

  it('adds the date when the retry is another day', () => {
    expect(
      retryLaterText(RETRY_MESSAGE, { ...utc, now: new Date('2026-10-26T09:00:00Z') })
    ).toMatch(/^Tries again on Oct 27 at 3:40\sPM$/)
  })

  it('says later when the message has no time', () => {
    expect(retryLaterText('It tries again automatically soon.')).toBe('Tries again later')
    expect(retryLaterText(null)).toBe('Tries again later')
    expect(retryLaterText('after 2026-13-45T99:99Z')).toBe('Tries again later')
  })
})

describe('stepMessageText', () => {
  it('turns a retry into local words and keeps other messages plain', () => {
    expect(stepMessageText({ errorCode: 'retry_later', errorMessage: RETRY_MESSAGE })).toMatch(
      /^Tries again (at|on) /
    )
    expect(stepMessageText({ errorCode: 'step_timeout', errorMessage: ' timed out ' })).toBe(
      'timed out'
    )
    expect(stepMessageText({ errorCode: null, errorMessage: null })).toBeNull()
  })
})
