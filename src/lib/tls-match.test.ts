import { describe, expect, it } from 'vitest'
import { coversAllHostnames, coversHostname } from '@/lib/tls-match'

describe('coversHostname', () => {
  it('rejects blank hostnames', () => {
    expect(coversHostname(['example.com'], '')).toBe(false)
    expect(coversHostname(['example.com'], '   ')).toBe(false)
  })

  it('matches exact names case-insensitively and strips trailing dots', () => {
    expect(coversHostname(['Example.COM'], 'example.com')).toBe(true)
    expect(coversHostname(['example.com.'], 'example.com')).toBe(true)
    expect(coversHostname(['example.com'], 'example.com.')).toBe(true)
  })

  it('covers one-label wildcards only', () => {
    expect(coversHostname(['*.example.com'], 'api.example.com')).toBe(true)
    expect(coversHostname(['*.example.com'], 'EXAMPLE.com')).toBe(false)
    expect(coversHostname(['*.example.com'], 'a.b.example.com')).toBe(false)
    expect(coversHostname(['*.example.com'], 'example.com')).toBe(false)
    expect(coversHostname(['*.example.com'], 'notexample.com')).toBe(false)
  })

  it('trims DNS name whitespace before matching', () => {
    expect(coversHostname(['  *.example.com  '], 'www.example.com')).toBe(true)
  })

  it('returns false when no name matches', () => {
    expect(coversHostname(['other.com', '*.other.com'], 'api.example.com')).toBe(
      false,
    )
    expect(coversHostname([], 'example.com')).toBe(false)
  })
})

describe('coversAllHostnames', () => {
  it('returns false for an empty hostname list', () => {
    expect(coversAllHostnames(['example.com'], [])).toBe(false)
  })

  it('requires every hostname to be covered', () => {
    const names = ['example.com', '*.example.com']
    expect(coversAllHostnames(names, ['example.com', 'api.example.com'])).toBe(
      true,
    )
    expect(
      coversAllHostnames(names, ['example.com', 'a.b.example.com']),
    ).toBe(false)
  })
})
