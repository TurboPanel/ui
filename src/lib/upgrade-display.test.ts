import { describe, expect, it } from 'vitest'
import {
  buildCounterLabel,
  fleetStatusBadge,
  formatUpgradeBuildDisplayName,
  installedBuildLabel,
  parseBuildCounter,
  mapStepStatusToPipeline,
  platformUpgradeHeadlineCopy,
  resolvePlatformUpgradeHeadline,
  stepHasStarted,
  summarizeFleetSteps,
  updateAvailableSentence,
  upgradeBuildDetailLines,
  upgradeChannelTitle,
  upgradePhaseLabel,
  upgradeRunErrorLabel,
  upgradeStepErrorLabel,
  upgradeStepOutcome,
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
    expect(label).toMatch(/^Canary · Sep 19/)
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
    ).toBe('Release 0.1.2')
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
    })
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
    expect(platformUpgradeHeadlineCopy('needs_attention')).toBe('Needs attention')
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
    ).toBe('RC · v1.0.0')
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
    expect(upgradePhaseLabel('fleet')).toBe('Fleet')
    expect(upgradePhaseLabel(null)).toBe('Upgrade')
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
      label: 'Rolled back',
      detail: 'Rolled back to the previous build',
    })
    expect(upgradeStepOutcome({ status: 'needs_attention', errorCode: 'server_offline' })).toEqual({
      tone: 'pending',
      label: 'Needs attention',
      detail: 'Server offline for over an hour',
    })
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
    expect(upgradeStepOutcome({ status: 'waiting' }).label).toBe('Waiting for server')
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
    expect(upgradeRunErrorLabel('colocated_daemon_failed')).toBe(
      'The co-located daemon step failed'
    )
    expect(upgradeRunErrorLabel('control_plane_failed')).toBe('The control-plane step failed')
    expect(upgradeRunErrorLabel('')).toBeNull()
  })
})

describe('build numbers', () => {
  it('reads the counter from canary and rc versions only', () => {
    expect(parseBuildCounter('0.1.3-canary.417')).toEqual({
      base: '0.1.3',
      channel: 'canary',
      number: 417,
    })
    expect(parseBuildCounter('v0.1.3-rc.2')).toEqual({ base: '0.1.3', channel: 'rc', number: 2 })
    expect(parseBuildCounter('0.1.3')).toBeNull()
    expect(parseBuildCounter('0.1.1-canary.20260919-143000-abc1234')).toBeNull()
    expect(parseBuildCounter(undefined)).toBeNull()
    expect(buildCounterLabel('0.1.3-canary.417')).toBe('Canary #417')
    expect(buildCounterLabel('0.1.3-rc.2')).toBe('RC 2')
  })

  it('puts the build number in the target line for canary, rc and release', () => {
    const at = { builtAt: '2026-09-29T09:10:00.000Z', commit: 'abc', buildId: 'b' }
    const opts = { locale: 'en-US', timeZone: 'UTC' }
    expect(
      formatUpgradeBuildDisplayName({ ...at, channel: 'canary', version: '0.1.3-canary.417' }, opts)
    ).toBe('Canary #417 · Sep 29, 09:10 AM')
    expect(
      formatUpgradeBuildDisplayName({ ...at, channel: 'rc', version: '0.1.3-rc.2' }, opts)
    ).toBe('RC 2 (0.1.3) · Sep 29, 09:10 AM')
    expect(
      formatUpgradeBuildDisplayName({ ...at, channel: 'release', version: '0.1.3' }, opts)
    ).toBe('Release 0.1.3 · Sep 29, 09:10 AM')
  })

  it('keeps the plain channel for an older timestamp canary', () => {
    expect(
      formatUpgradeBuildDisplayName(
        {
          channel: 'canary',
          builtAt: '2026-09-19T19:30:00.000Z',
          version: '0.1.1-canary.20260919-143000-abc1234',
          commit: 'abc',
          buildId: 'b',
        },
        { locale: 'en-US', timeZone: 'UTC' }
      )
    ).toMatch(/^Canary · Sep 19/)
  })

  it('names the build number without a date too', () => {
    expect(
      formatUpgradeBuildDisplayName({
        channel: 'canary',
        builtAt: '',
        version: '0.1.3-canary.417',
        commit: 'x',
        buildId: '',
      })
    ).toBe('Canary #417')
    expect(upgradeChannelTitle('rc')).toBe('RC')
  })
})

describe('build identity fallback', () => {
  const noDate = { builtAt: '', commit: '', buildId: '' }

  it('names a build with no date by version, then commit, then build id', () => {
    expect(
      formatUpgradeBuildDisplayName({ ...noDate, channel: 'canary', version: ' 0.1.1 ' })
    ).toBe('Canary · v0.1.1')
    expect(
      formatUpgradeBuildDisplayName({
        ...noDate,
        channel: 'canary',
        commit: 'a96b655123456789abcdef',
        buildId: 'b1',
      })
    ).toBe('Canary · a96b65512345')
    expect(
      formatUpgradeBuildDisplayName({
        ...noDate,
        channel: 'canary',
        commit: 'unknown',
        buildId: 'build-abcdef123456',
      })
    ).toBe('Canary · build-abcdef')
    expect(formatUpgradeBuildDisplayName({ ...noDate, channel: 'canary', commit: 'unknown' })).toBe(
      'Canary'
    )
    expect(formatUpgradeBuildDisplayName({ ...noDate, channel: '' })).toBe('Build')
  })

  it('only calls a plain version a release on the release channel', () => {
    expect(
      formatUpgradeBuildDisplayName({ ...noDate, channel: ' Release ', version: 'v0.1.3' })
    ).toBe('Release 0.1.3')
    expect(formatUpgradeBuildDisplayName({ ...noDate, channel: 'rc', version: '0.1.3' })).toBe(
      'RC · v0.1.3'
    )
  })

  it('shows the date for a plain release without a counter', () => {
    expect(
      formatUpgradeBuildDisplayName(
        { ...noDate, channel: 'release', version: '0.1.3', builtAt: ' 2026-09-29T09:10:00.000Z ' },
        { locale: 'en-US', timeZone: 'UTC' }
      )
    ).toBe('Release 0.1.3 · Sep 29, 09:10 AM')
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
      label: 'Not started',
      detail: null,
    })
  })
})

describe('fleetStatusBadge', () => {
  it('names what the rollout is doing with a server', () => {
    expect(fleetStatusBadge('pending')).toEqual({ tone: 'muted', label: 'Waiting' })
    expect(fleetStatusBadge('waiting')).toEqual({ tone: 'pending', label: 'Offline' })
    expect(fleetStatusBadge('installing')).toEqual({ tone: 'info', label: 'Updating' })
    expect(fleetStatusBadge('done')).toEqual({ tone: 'ok', label: 'Updated' })
    expect(fleetStatusBadge('failed')).toEqual({ tone: 'danger', label: 'Failed' })
    expect(fleetStatusBadge('rolled_back')).toEqual({ tone: 'danger', label: 'Rolled back' })
    expect(fleetStatusBadge('needs_attention')).toEqual({ tone: 'pending', label: 'Needs attention' })
  })
})

describe('updateAvailableSentence', () => {
  it('names the pieces in reading order', () => {
    expect(updateAvailableSentence([])).toBeNull()
    expect(updateAvailableSentence(['the UI'])).toBe('The UI can be updated.')
    expect(updateAvailableSentence(['the control plane', 'the UI'])).toBe(
      'The control plane and the UI can be updated.'
    )
    expect(updateAvailableSentence(['the control plane', 'the UI', 'the co-located daemon'])).toBe(
      'The control plane, the UI and the co-located daemon can be updated.'
    )
  })
})
