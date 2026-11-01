import { describe, expect, it } from 'vitest'
import { certificateCoverage } from './certificate-coverage'

describe('certificateCoverage', () => {
  it('covers an exact name, with or without scheme and port', () => {
    expect(
      certificateCoverage(['cp.example.com'], ['cp.example.com', 'https://cp.example.com:8443'])
    ).toEqual([
      { host: 'cp.example.com', covered: true },
      { host: 'https://cp.example.com:8443', covered: true },
    ])
  })

  it('lets a wildcard stand for exactly one label', () => {
    expect(certificateCoverage(['*.example.com'], ['cp.example.com'])[0].covered).toBe(true)
  })

  it('refuses the apex and deeper names for a wildcard', () => {
    expect(
      certificateCoverage(['*.example.com'], ['example.com', 'a.b.example.com']).map(
        (item) => item.covered
      )
    ).toEqual([false, false])
  })
})
