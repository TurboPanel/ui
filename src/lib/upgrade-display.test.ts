import { describe, expect, it } from 'vitest'
import {
  formatUpgradeBuildDisplayName,
  mapStepStatusToPipeline,
  platformUpgradeHeadlineCopy,
  resolvePlatformUpgradeHeadline,
  summarizeFleetSteps,
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
      { locale: 'en-US', timeZone: 'UTC' },
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
      }),
    ).toBe('Release · v0.1.2')
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
      }),
    ).toBe('needs_attention')
  })

  it('marks an active run as updating', () => {
    expect(
      resolvePlatformUpgradeHeadline({
        activeRunStatus: 'running',
        updateAvailable: false,
        needsAttentionCount: 0,
      }),
    ).toBe('updating')
  })

  it('falls back to update available and up to date', () => {
    expect(
      resolvePlatformUpgradeHeadline({
        activeRunStatus: null,
        updateAvailable: true,
        needsAttentionCount: 0,
      }),
    ).toBe('update_available')
    expect(
      resolvePlatformUpgradeHeadline({
        activeRunStatus: 'succeeded',
        updateAvailable: false,
        needsAttentionCount: 0,
      }),
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
      }),
    ).toBe('Rc · v1.0.0')
    expect(
      upgradeBuildDetailLines({
        version: ' 1.2 ',
        commit: 'unknown',
        buildId: 'bid-1',
        manifestUrl: ' https://example/manifest.json ',
      }),
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
    expect(
      upgradeStepOutcome({ status: 'needs_attention', errorCode: 'server_offline' }),
    ).toEqual({
      tone: 'pending',
      label: 'Needs attention',
      detail: 'Server offline for over an hour',
    })
  })

  it('explains a skipped server that is already newer than the target', () => {
    expect(upgradeStepOutcome({ status: 'skipped', errorCode: 'downgrade_refused' }).detail).toBe(
      'Already newer than the target',
    )
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
      'The co-located daemon step failed',
    )
    expect(upgradeRunErrorLabel('control_plane_failed')).toBe('The control-plane step failed')
    expect(upgradeRunErrorLabel('')).toBeNull()
  })
})
