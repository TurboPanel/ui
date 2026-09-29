import { describe, expect, it } from 'vitest'
import { commitUrlFor, controlPlaneVersionLine } from './control-plane-version'

const SHA = '18ad2b07c0ffee1234567890abcdef1234567890'

describe('controlPlaneVersionLine', () => {
  it('is null until the health answer carries a version', () => {
    expect(controlPlaneVersionLine(undefined)).toBeNull()
    expect(controlPlaneVersionLine({ ok: true })).toBeNull()
    expect(controlPlaneVersionLine({ ok: true, version: '  ' })).toBeNull()
  })

  it('shows the version alone when no revision is recorded', () => {
    expect(controlPlaneVersionLine({ ok: true, version: '0.1.1' })).toEqual({
      label: 'v0.1.1',
      commitUrl: null,
      environment: null,
    })
  })

  it('shows the version alone when the commit is "unknown"', () => {
    expect(
      controlPlaneVersionLine({
        ok: true,
        version: '0.1.1',
        revision: { commit: 'unknown', sourceUrl: 'https://github.com/TurboPanel/turbopanel' },
      })
    ).toEqual({ label: 'v0.1.1', commitUrl: null, environment: null })
  })

  it('appends the short sha and links the exact commit', () => {
    expect(
      controlPlaneVersionLine({
        ok: true,
        version: '0.1.1',
        revision: { commit: SHA, sourceUrl: 'https://github.com/TurboPanel/turbopanel/' },
      })
    ).toEqual({
      label: 'v0.1.1 · 18ad2b0',
      commitUrl: `https://github.com/TurboPanel/turbopanel/commit/${SHA}`,
      environment: null,
    })
  })

  it('does not double the v prefix and never links a non-https source', () => {
    expect(
      controlPlaneVersionLine({
        ok: true,
        version: 'v0.2.0',
        revision: { commit: SHA, sourceUrl: 'javascript:alert(1)' },
      })
    ).toEqual({ label: 'v0.2.0 · 18ad2b0', commitUrl: null, environment: null })
  })

  it('links the commit page when the source is already a tree view of that commit', () => {
    expect(
      controlPlaneVersionLine({
        ok: true,
        version: '0.1.1',
        revision: {
          commit: SHA,
          sourceUrl: `https://github.com/TurboPanel/turbopanel/tree/${SHA}`,
        },
      })?.commitUrl
    ).toBe(`https://github.com/TurboPanel/turbopanel/commit/${SHA}`)
  })

  it('names the hosted environment beside the version: Testing and Staging, nothing on live', () => {
    const base = { ok: true, version: '0.1.1', channel: 'canary' }
    expect(
      controlPlaneVersionLine({ ...base, environment: 'testing' }, 'workers')?.environment
    ).toEqual({
      text: 'Testing',
      tone: 'testing',
    })
    expect(
      controlPlaneVersionLine({ ...base, environment: 'Staging' }, 'workers')?.environment
    ).toEqual({
      text: 'Staging',
      tone: 'staging',
    })
    expect(
      controlPlaneVersionLine({ ...base, environment: 'live' }, 'workers')?.environment
    ).toBeNull()
    expect(
      controlPlaneVersionLine({ ...base, environment: null }, 'workers')?.environment
    ).toBeNull()
    expect(controlPlaneVersionLine(base, 'workers')?.environment).toBeNull()
  })

  it('keeps the environment tag with a linked commit', () => {
    expect(
      controlPlaneVersionLine(
        {
          ok: true,
          version: '0.1.1',
          environment: 'testing',
          revision: { commit: SHA, sourceUrl: 'https://github.com/TurboPanel/turbopanel' },
        },
        'workers'
      )
    ).toEqual({
      label: 'v0.1.1 · 18ad2b0',
      commitUrl: `https://github.com/TurboPanel/turbopanel/commit/${SHA}`,
      environment: { text: 'Testing', tone: 'testing' },
    })
  })

  it('shows the exact installed build label on self-hosted, and no environment tag', () => {
    expect(
      controlPlaneVersionLine(
        {
          ok: true,
          version: '0.1.1',
          build: '0.1.1-canary.20260926-192741-3754712',
          environment: 'testing',
        },
        'deno'
      )
    ).toEqual({
      label: 'v0.1.1-canary.20260926-192741-3754712',
      commitUrl: null,
      environment: null,
    })
    expect(
      controlPlaneVersionLine({ ok: true, version: '0.1.1', build: '0.1.1-rc.1' }, 'deno')?.label
    ).toBe('v0.1.1-rc.1')
  })

  it('shows the 2026-09-28 spellings: counter canary and the plain rc', () => {
    expect(
      controlPlaneVersionLine({ ok: true, version: '0.1.3', build: '0.1.3-canary.412' }, 'deno')
        ?.label
    ).toBe('v0.1.3-canary.412')
    expect(
      controlPlaneVersionLine({ ok: true, version: '0.1.3', build: '0.1.3-rc' }, 'deno')?.label
    ).toBe('v0.1.3-rc')
  })

  it('falls back to the plain version when self-hosted reports no usable build label', () => {
    expect(
      controlPlaneVersionLine({ ok: true, version: '0.1.1', build: null }, 'deno')?.label
    ).toBe('v0.1.1')
    expect(
      controlPlaneVersionLine({ ok: true, version: '0.1.1', build: 'not a label' }, 'deno')?.label
    ).toBe('v0.1.1')
  })

  it('ignores the build label on the hosted control plane', () => {
    expect(
      controlPlaneVersionLine(
        { ok: true, version: '0.1.1', build: '0.1.1-canary.20260926-192741-3754712' },
        'workers'
      )?.label
    ).toBe('v0.1.1')
  })
})

describe('commitUrlFor', () => {
  it('builds the commit page from a repository or a tree/commit/blob view', () => {
    expect(commitUrlFor('https://github.com/o/r', SHA)).toBe(`https://github.com/o/r/commit/${SHA}`)
    expect(commitUrlFor('https://github.com/o/r/', SHA)).toBe(
      `https://github.com/o/r/commit/${SHA}`
    )
    expect(commitUrlFor(`https://github.com/o/r/tree/${SHA}`, SHA)).toBe(
      `https://github.com/o/r/commit/${SHA}`
    )
    expect(commitUrlFor('https://github.com/o/r/commit/abc1234', SHA)).toBe(
      `https://github.com/o/r/commit/${SHA}`
    )
    expect(commitUrlFor('https://github.com/o/r/blob/trunk/README.md', SHA)).toBe(
      `https://github.com/o/r/commit/${SHA}`
    )
  })

  it('never links a non-https, malformed or empty source', () => {
    expect(commitUrlFor('http://github.com/o/r', SHA)).toBeNull()
    expect(commitUrlFor('javascript:alert(1)', SHA)).toBeNull()
    expect(commitUrlFor('https://', SHA)).toBeNull()
    expect(commitUrlFor('https://github.com', SHA)).toBeNull()
    expect(commitUrlFor('', SHA)).toBeNull()
    expect(commitUrlFor(null, SHA)).toBeNull()
    expect(commitUrlFor(undefined, SHA)).toBeNull()
  })
})
