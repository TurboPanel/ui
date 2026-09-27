import { describe, expect, it } from 'vitest'
import { controlPlaneVersionLine } from './control-plane-version'

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
    })
  })

  it('shows the version alone when the commit is "unknown"', () => {
    expect(
      controlPlaneVersionLine({
        ok: true,
        version: '0.1.1',
        revision: { commit: 'unknown', sourceUrl: 'https://github.com/TurboPanel/turbopanel' },
      }),
    ).toEqual({ label: 'v0.1.1', commitUrl: null })
  })

  it('appends the short sha and links the exact commit', () => {
    expect(
      controlPlaneVersionLine({
        ok: true,
        version: '0.1.1',
        revision: { commit: SHA, sourceUrl: 'https://github.com/TurboPanel/turbopanel/' },
      }),
    ).toEqual({
      label: 'v0.1.1 · 18ad2b0',
      commitUrl: `https://github.com/TurboPanel/turbopanel/commit/${SHA}`,
    })
  })

  it('does not double the v prefix and never links a non-https source', () => {
    expect(
      controlPlaneVersionLine({
        ok: true,
        version: 'v0.2.0',
        revision: { commit: SHA, sourceUrl: 'javascript:alert(1)' },
      }),
    ).toEqual({ label: 'v0.2.0 · 18ad2b0', commitUrl: null })
  })
})
