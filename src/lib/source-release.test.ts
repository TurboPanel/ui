import { describe, expect, it } from 'vitest'
import {
  formatVersionBuild,
  isFullGitCommit,
  isReleaseSourceConfig,
  readAppSourceRelease,
  sourceReleaseUrl,
  UI_LICENSE,
  UI_SOURCE_REPO,
} from '@/lib/source-release'
import * as sourceReleaseNode from '@/lib/source-release-node.mjs'

const FULL_SHA = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'

describe('source-release-node.mjs (app.config Node ESM)', () => {
  it('exports the same helpers app.config imports by explicit .mjs path', () => {
    expect(sourceReleaseNode.UI_LICENSE).toBe(UI_LICENSE)
    expect(sourceReleaseNode.UI_SOURCE_REPO).toBe(UI_SOURCE_REPO)
    expect(sourceReleaseNode.isFullGitCommit(FULL_SHA)).toBe(true)
    expect(sourceReleaseNode.sourceReleaseUrl(FULL_SHA, { release: true })).toBe(
      `${UI_SOURCE_REPO}/tree/${FULL_SHA}`,
    )
  })
})

describe('sourceReleaseUrl', () => {
  it('points at the exact git revision, not trunk', () => {
    expect(sourceReleaseUrl('abc123def')).toBe(`${UI_SOURCE_REPO}/tree/abc123def`)
    expect(sourceReleaseUrl('  ')).toBe(UI_SOURCE_REPO)
  })

  it('requires a full commit and a /tree/<full-sha> URL in release mode', () => {
    expect(sourceReleaseUrl(FULL_SHA, { release: true })).toBe(
      `${UI_SOURCE_REPO}/tree/${FULL_SHA}`,
    )
    expect(() => sourceReleaseUrl('abc123def', { release: true })).toThrow(TypeError)
    expect(() => sourceReleaseUrl('', { release: true })).toThrow(TypeError)
    expect(isFullGitCommit(FULL_SHA)).toBe(true)
    expect(isFullGitCommit('abc123def')).toBe(false)
  })
})

describe('readAppSourceRelease', () => {
  it('reads license, version, build, and source URL from Expo config extra', () => {
    const release = readAppSourceRelease({
      version: '0.1.0',
      ios: { buildNumber: '12' },
      extra: {
        license: UI_LICENSE,
        gitCommit: 'deadbeefcafebabe',
        sourceReleaseUrl: 'https://github.com/TurboPanel/ui/tree/deadbeefcafebabe',
      },
    })
    expect(release.license).toBe(UI_LICENSE)
    expect(release.version).toBe('0.1.0')
    expect(release.build).toBe('12')
    expect(release.gitCommit).toBe('deadbeefcafebabe')
    expect(release.sourceReleaseUrl).toContain('/tree/deadbeefcafebabe')
    expect(release.release).toBe(false)
    expect(formatVersionBuild(release)).toBe('0.1.0 (12)')
  })

  it('falls back to the repository root only for non-release configs', () => {
    const release = readAppSourceRelease({ version: '0.1.0', extra: {} })
    expect(release.sourceReleaseUrl).toBe(UI_SOURCE_REPO)
    expect(release.release).toBe(false)
    expect(formatVersionBuild(release)).toBe('0.1.0')
  })

  it('requires a full commit and /tree/<full-sha> URL for release-mode configs', () => {
    const release = readAppSourceRelease({
      version: '0.1.0',
      extra: {
        license: UI_LICENSE,
        gitCommit: FULL_SHA,
        release: true,
      },
    })
    expect(release.release).toBe(true)
    expect(release.gitCommit).toBe(FULL_SHA)
    expect(release.sourceReleaseUrl).toBe(`${UI_SOURCE_REPO}/tree/${FULL_SHA}`)
    expect(() =>
      readAppSourceRelease({
        version: '0.1.0',
        extra: { release: true, gitCommit: '' },
      }),
    ).toThrow(TypeError)
    expect(() =>
      readAppSourceRelease({
        version: '0.1.0',
        extra: { release: true, gitCommit: 'deadbeef' },
      }),
    ).toThrow(TypeError)
  })

  it('uses the Android versionCode as the build when no iOS build number exists', () => {
    const release = readAppSourceRelease({
      version: '0.1.0',
      android: { versionCode: 42 },
      extra: {},
    })
    expect(release.build).toBe('42')
    expect(formatVersionBuild(release)).toBe('0.1.0 (42)')
  })

  it('defaults version and build when the config is absent', () => {
    const release = readAppSourceRelease(null)
    expect(release.version).toBe('0.0.0')
    expect(release.build).toBe('')
    expect(release.license).toBe(UI_LICENSE)
  })
})

describe('isReleaseSourceConfig', () => {
  it('is true only for an explicit extra.release === true', () => {
    expect(isReleaseSourceConfig({ extra: { release: true } })).toBe(true)
    expect(isReleaseSourceConfig({ extra: { release: 'true' } })).toBe(false)
    expect(isReleaseSourceConfig({ extra: {} })).toBe(false)
    expect(isReleaseSourceConfig({})).toBe(false)
    expect(isReleaseSourceConfig(null)).toBe(false)
    expect(isReleaseSourceConfig(undefined)).toBe(false)
  })
})
