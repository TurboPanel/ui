import { describe, expect, it } from 'vitest'
import {
  channelLabel,
  daemonUnsupportedLabel,
  runningBuildLabel,
  shortCommit,
} from './daemon-update-labels'

describe('daemon update labels', () => {
  it('shortCommit truncates to twelve characters or says Unknown', () => {
    expect(shortCommit('abcdef1234567890')).toBe('abcdef123456')
    expect(shortCommit('')).toBe('Unknown')
    expect(shortCommit(null)).toBe('Unknown')
    expect(shortCommit(undefined)).toBe('Unknown')
  })

  it('runningBuildLabel leads with the version when the daemon reports one', () => {
    expect(runningBuildLabel({ commit: 'abcdef1234567890', version: '0.1.0' })).toBe(
      'v0.1.0 · abcdef123456',
    )
    expect(runningBuildLabel({ commit: 'abcdef1234567890', version: ' ' })).toBe('abcdef123456')
    expect(runningBuildLabel({ commit: 'abcdef1234567890' })).toBe('abcdef123456')
    expect(runningBuildLabel(null)).toBe('Unknown')
    expect(runningBuildLabel(undefined)).toBe('Unknown')
  })

  it('channelLabel capitalises the channel and falls back to Target', () => {
    expect(channelLabel('trunk')).toBe('Trunk')
    expect(channelLabel('release')).toBe('Release')
    expect(channelLabel(' rc ')).toBe('Rc')
    expect(channelLabel('')).toBe('Target')
    expect(channelLabel(undefined)).toBe('Target')
    expect(channelLabel(null)).toBe('Target')
  })

  it('daemonUnsupportedLabel names both numbers', () => {
    expect(
      daemonUnsupportedLabel({ status: 'unsupported', version: '0.0.9', minVersion: '0.1.0' }),
    ).toBe(
      'Daemon 0.0.9 is below the supported minimum 0.1.0: it stays connected but receives no commands until it is updated.',
    )
    expect(
      daemonUnsupportedLabel({ status: 'unknown', version: null, minVersion: '0.1.0' }),
    ).toContain('Daemon unknown is below')
  })
})
