import { describe, expect, it } from 'vitest'
import {
  formatUpgradeBuildDisplayName,
  mapStepStatusToPipeline,
  resolvePlatformUpgradeHeadline,
  summarizeFleetSteps,
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
})
