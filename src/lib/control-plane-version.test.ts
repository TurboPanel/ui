import { describe, expect, it } from 'vitest'
import {
  controlPlaneEnvironmentLabel,
  controlPlaneVersionLabel,
  isLiveBuild,
  webInterfaceVersionLabel,
} from './control-plane-version'

const SHA = '5efa9c1d0f6b4a3e2c1b0a9f8e7d6c5b4a3f2e1d'
const revision = { commit: SHA, sourceUrl: `https://github.com/o/r/tree/${SHA}` }

describe('controlPlaneVersionLabel', () => {
  it('is null until the control plane reports a version', () => {
    expect(controlPlaneVersionLabel(undefined)).toBeNull()
    expect(controlPlaneVersionLabel({ ok: true })).toBeNull()
    expect(controlPlaneVersionLabel({ ok: true, version: '  ' })).toBeNull()
  })

  it('shows a release as vX.Y.Z', () => {
    expect(controlPlaneVersionLabel({ ok: true, version: '0.1.20', revision })).toBe('v0.1.20')
    expect(controlPlaneVersionLabel({ ok: true, version: 'v0.1.20' })).toBe('v0.1.20')
  })

  it('shows the running build with its pre-release suffix', () => {
    expect(
      controlPlaneVersionLabel({ ok: true, version: '0.1.17', build: '0.1.17-canary.24', revision })
    ).toBe('v0.1.17-canary.24')
    expect(controlPlaneVersionLabel({ ok: true, version: '0.1.17', build: '0.1.17-rc.2' })).toBe(
      'v0.1.17-rc.2'
    )
  })

  it('never shows the commit, whatever the environment', () => {
    for (const environment of ['testing', 'staging', 'live', null]) {
      const label = controlPlaneVersionLabel({ ok: true, version: '0.1.21', revision, environment })
      expect(label).toBe('v0.1.21')
      expect(label).not.toContain(SHA.slice(0, 7))
    }
  })

  it('falls back to the plain version when the build is missing or not a version', () => {
    expect(controlPlaneVersionLabel({ ok: true, version: '0.1.21', build: null })).toBe('v0.1.21')
    expect(controlPlaneVersionLabel({ ok: true, version: '0.1.21', build: 'not a label' })).toBe(
      'v0.1.21'
    )
    expect(controlPlaneVersionLabel({ ok: true, version: '0.1.21', build: '0.1.21-' })).toBe(
      'v0.1.21'
    )
  })
})

describe('controlPlaneEnvironmentLabel', () => {
  it('names the hosted deployment, nothing on live', () => {
    const at = (environment: string | null) =>
      controlPlaneEnvironmentLabel(
        { ok: true, version: '0.1.21', environment, channel: 'canary' },
        'workers'
      )
    expect(at('testing')).toBe('Testing')
    expect(at('Staging')).toBe('Staging')
    expect(at('live')).toBeNull()
    expect(at(null)).toBeNull()
  })

  it('names the self-hosted update channel, nothing on release', () => {
    const on = (channel: string | undefined) =>
      controlPlaneEnvironmentLabel(
        { ok: true, version: '0.1.21', channel, environment: 'testing' },
        'deno'
      )
    expect(on('canary')).toBe('Canary')
    expect(on('rc')).toBe('RC')
    expect(on('RC')).toBe('RC')
    expect(on('trunk')).toBe('Trunk')
    expect(on('edge')).toBe('Edge')
    expect(on('release')).toBeNull()
    expect(on(undefined)).toBeNull()
  })

  it('treats an unknown runtime as hosted', () => {
    expect(
      controlPlaneEnvironmentLabel({ ok: true, environment: 'staging', channel: 'rc' }, null)
    ).toBe('Staging')
  })
})

describe('isLiveBuild', () => {
  it('is live exactly when there is no environment word', () => {
    expect(isLiveBuild({ ok: true, environment: 'live' }, 'workers')).toBe(true)
    expect(isLiveBuild({ ok: true, environment: 'testing' }, 'workers')).toBe(false)
    expect(isLiveBuild({ ok: true, channel: 'release' }, 'deno')).toBe(true)
    expect(isLiveBuild({ ok: true, channel: 'rc' }, 'deno')).toBe(false)
  })
})

describe('webInterfaceVersionLabel', () => {
  it('shows the bundle version as vX.Y.Z', () => {
    expect(webInterfaceVersionLabel('0.1.17')).toBe('v0.1.17')
    expect(webInterfaceVersionLabel('0.1.17-canary.1')).toBe('v0.1.17-canary.1')
    expect(webInterfaceVersionLabel('')).toBeNull()
    expect(webInterfaceVersionLabel(null)).toBeNull()
    expect(webInterfaceVersionLabel('dev')).toBeNull()
  })
})
