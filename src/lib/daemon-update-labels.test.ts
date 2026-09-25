import { describe, expect, it } from 'vitest'
import {
  channelLabel,
  daemonUnsupportedLabel,
  isServerUpdateActionHidden,
  runningBuildLabel,
  serverUpdateBlockedLabel,
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

describe('server update block', () => {
  it('renders the label for each code the server sends', () => {
    // The bug: the server sent a sentence and the ui compared it to codes, so
    // no label ever rendered and the Update button stayed until a 409.
    expect(
      serverUpdateBlockedLabel({
        updateBlocked: true,
        updateBlockedCode: 'updates_managed',
        updateBlockedReason: 'Daemon updates on TurboPanel High Availability run from Admin → Updates.',
      }),
    ).toBe('Updates managed by TurboPanel High Availability')
    expect(
      serverUpdateBlockedLabel({
        updateBlocked: true,
        updateBlockedCode: 'control_plane_upgrade_required',
      }),
    ).toBe('Waiting for the control plane upgrade')
    expect(
      serverUpdateBlockedLabel({ updateBlocked: true, updateBlockedCode: 'upgrade_gate_unavailable' }),
    ).toContain('Updates unavailable')
    expect(
      serverUpdateBlockedLabel({ updateBlocked: true, updateBlockedCode: 'colocated_with_instance' }),
    ).toContain('control plane')
  })

  it("shows the server's sentence for a code it does not name, or an older control plane", () => {
    expect(
      serverUpdateBlockedLabel({
        updateBlocked: true,
        updateBlockedCode: 'something_new',
        updateBlockedReason: 'A reason from the server.',
      }),
    ).toBe('A reason from the server.')
    expect(
      serverUpdateBlockedLabel({
        updateBlocked: true,
        updateBlockedReason: 'Update this control plane from Admin → Updates before updating other servers.',
      }),
    ).toBe('Update this control plane from Admin → Updates before updating other servers.')
  })

  it('shows nothing and keeps the action when updates are not blocked', () => {
    expect(serverUpdateBlockedLabel({ updateBlocked: false })).toBeNull()
    expect(serverUpdateBlockedLabel(null)).toBeNull()
    expect(isServerUpdateActionHidden({ updateBlocked: false })).toBe(false)
    expect(isServerUpdateActionHidden(undefined)).toBe(false)
  })

  it('hides the Update action whenever the server refuses updates', () => {
    for (const code of ['updates_managed', 'control_plane_upgrade_required', 'upgrade_gate_unavailable']) {
      expect(isServerUpdateActionHidden({ updateBlocked: true, updateBlockedCode: code })).toBe(true)
    }
    expect(isServerUpdateActionHidden({ updateBlocked: true, updateBlockedReason: 'older server' })).toBe(true)
  })
})
