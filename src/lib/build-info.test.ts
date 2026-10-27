import { describe, expect, it } from 'vitest'
import { versionRows } from './build-info'

describe('versionRows', () => {
  it('lists only the control plane and web interface versions', () => {
    expect(
      versionRows(
        {
          ok: true,
          version: '0.1.21',
          build: '0.1.21-canary.3',
          channel: 'canary',
          environment: 'testing',
          revision: { commit: '5efa9c1d0f6b4a3e2c1b0a9f8e7d6c5b4a3f2e1d', sourceUrl: '' },
        },
        '0.1.17'
      )
    ).toEqual([
      { label: 'Control plane', value: 'v0.1.21-canary.3' },
      { label: 'Web interface', value: 'v0.1.17' },
    ])
  })

  it('reads Unknown for a version that has not arrived', () => {
    expect(versionRows(undefined, null)).toEqual([
      { label: 'Control plane', value: 'Unknown' },
      { label: 'Web interface', value: 'Unknown' },
    ])
  })
})
