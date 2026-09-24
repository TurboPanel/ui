import { describe, expect, it } from 'vitest'
import {
  noteLoadedControlPlaneRevision,
  resetLoadedControlPlaneRevisionForTests,
  shouldPromptControlPlaneReload,
  shouldPromptInstanceReload,
} from '@/lib/upgrade-reload'

describe('shouldPromptInstanceReload', () => {
  it('is false when either version is missing', () => {
    expect(shouldPromptInstanceReload(null, '0.1.1')).toBe(false)
    expect(shouldPromptInstanceReload('0.1.1', null)).toBe(false)
  })

  it('is true when semver differs', () => {
    expect(shouldPromptInstanceReload('0.1.0', '0.1.1')).toBe(true)
    expect(shouldPromptInstanceReload('0.1.1', '0.1.1')).toBe(false)
  })
})

describe('shouldPromptControlPlaneReload', () => {
  it('stays quiet when the UI commit and the control-plane commit differ on a current install', () => {
    expect(
      shouldPromptControlPlaneReload({
        bundledVersion: '0.1.1',
        observedVersion: '0.1.1',
        loadedRevision: 'cpcommitcpcommitcpcommitcpcommitcpco',
        observedRevision: 'cpcommitcpcommitcpcommitcpcommitcpco',
        uiCommit: 'uicommituicommituicommituicommituicom',
      }),
    ).toBe(false)
  })

  it('reloads two canary control-plane commits that share 0.1.1', () => {
    expect(
      shouldPromptControlPlaneReload({
        bundledVersion: '0.1.1',
        observedVersion: '0.1.1',
        loadedRevision: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        observedRevision: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
        uiCommit: 'uicommituicommituicommituicommituicom',
      }),
    ).toBe(true)
  })

  it('latches the first control-plane revision this bundle loaded', () => {
    resetLoadedControlPlaneRevisionForTests()
    expect(noteLoadedControlPlaneRevision(null)).toBeNull()
    expect(noteLoadedControlPlaneRevision('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')).toBe(
      'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    )
    expect(noteLoadedControlPlaneRevision('bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb')).toBe(
      'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    )
    resetLoadedControlPlaneRevisionForTests()
  })
})
