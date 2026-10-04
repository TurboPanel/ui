import { describe, expect, it } from 'vitest'
import { buildInfoSections, showsBuildInfo } from './build-info'

const UI_SHA = 'a'.repeat(40)
const CP_SHA = 'b'.repeat(40)
const consoleBuild = {
  version: '0.1.1',
  gitCommit: UI_SHA,
  sourceReleaseUrl: `https://github.com/TurboPanel/ui/tree/${UI_SHA}`,
}

describe('showsBuildInfo', () => {
  it('opens only on hosted testing and staging', () => {
    expect(showsBuildInfo({ ok: true, environment: 'testing' })).toBe(true)
    expect(showsBuildInfo({ ok: true, environment: 'Staging' })).toBe(true)
    expect(showsBuildInfo({ ok: true, environment: 'live' })).toBe(false)
    expect(showsBuildInfo({ ok: true, environment: null })).toBe(false)
    expect(showsBuildInfo(undefined)).toBe(false)
  })
})

describe('buildInfoSections', () => {
  it('lists the web app and control plane with linked commits', () => {
    const sections = buildInfoSections(
      {
        ok: true,
        version: '0.1.1',
        revision: { commit: CP_SHA, sourceUrl: `https://github.com/TurboPanel/turbopanel/tree/${CP_SHA}` },
        channel: 'canary',
        environment: 'testing',
        build: null,
      },
      consoleBuild,
    )
    expect(sections).toEqual([
      {
        title: 'Web app',
        rows: [
          { label: 'Version', value: 'v0.1.1' },
          { label: 'Commit', value: 'aaaaaaa', url: `https://github.com/TurboPanel/ui/commit/${UI_SHA}` },
        ],
      },
      {
        title: 'Control plane',
        rows: [
          { label: 'Version', value: 'v0.1.1' },
          {
            label: 'Commit',
            value: 'bbbbbbb',
            url: `https://github.com/TurboPanel/turbopanel/commit/${CP_SHA}`,
          },
          { label: 'Channel', value: 'canary' },
          { label: 'Environment', value: 'testing' },
        ],
      },
    ])
  })

  it('shows an installed build label and marks unknown commits', () => {
    const sections = buildInfoSections(
      { ok: true, version: '0.1.1', build: '0.1.1-rc.1', revision: { commit: 'unknown', sourceUrl: '' } },
      { ...consoleBuild, gitCommit: '' },
    )
    expect(sections[0].rows[1]).toEqual({ label: 'Commit', value: 'unknown' })
    expect(sections[1].rows).toEqual([
      { label: 'Version', value: 'v0.1.1' },
      { label: 'Build', value: 'v0.1.1-rc.1' },
      { label: 'Commit', value: 'unknown' },
    ])
  })

  it('does not link a commit whose source is not https', () => {
    const sections = buildInfoSections(
      { ok: true, version: '0.1.1', revision: { commit: CP_SHA, sourceUrl: 'javascript:alert(1)' } },
      consoleBuild,
    )
    expect(sections[1].rows[1]).toEqual({ label: 'Commit', value: 'bbbbbbb' })
  })
})
