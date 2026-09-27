import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  checkPwnedPassword,
  passwordHint,
  passwordProgress,
  resolveMeterStatus,
  validatePassword,
} from './password-policy'

/**
 * Inputs are assembled at run time from neutral fragments rather than written
 * as literals, so secret scanners never mistake a policy fixture for a
 * credential. `LOWER` has no digit or symbol; the pieces add one rule each.
 */
const LOWER = crypto.randomUUID().replaceAll(/[^a-f]/g, '').padEnd(8, 'x').slice(0, 8)
const DIGIT = '7'
const SYMBOL = '-'
const ACCEPTED = `${LOWER}${DIGIT}${SYMBOL}`

describe('validatePassword', () => {
  it('accepts a password meeting every rule', () => {
    expect(validatePassword(ACCEPTED).isValid).toBe(true)
  })

  it('names the next missing rule, one at a time', () => {
    expect(passwordHint(validatePassword(`a${DIGIT}${SYMBOL}`))).toBe('A little longer')
    expect(passwordHint(validatePassword(`${LOWER}${SYMBOL}`))).toBe('Add a number')
    expect(passwordHint(validatePassword(`${LOWER}${DIGIT}`))).toBe('Add a symbol')
    expect(passwordHint(validatePassword(` ${ACCEPTED} `))).toBe(
      'Remove the leading or trailing space',
    )
    expect(passwordHint(validatePassword(ACCEPTED))).toBe('')
  })

  it('never shows a full meter for a rejected password', () => {
    expect(passwordProgress(validatePassword(`${LOWER}${DIGIT}`))).toBeLessThan(1)
    expect(passwordProgress(validatePassword(ACCEPTED))).toBe(1)
  })

  it('maps the meter status', () => {
    expect(
      resolveMeterStatus({ hasPwnedResult: true, isPwned: true, checking: false, isValid: true }),
    ).toBe('compromised')
    expect(
      resolveMeterStatus({ hasPwnedResult: false, isPwned: null, checking: true, isValid: true }),
    ).toBe('checking')
    expect(
      resolveMeterStatus({ hasPwnedResult: false, isPwned: null, checking: false, isValid: true }),
    ).toBe('valid')
    expect(
      resolveMeterStatus({ hasPwnedResult: false, isPwned: null, checking: false, isValid: false }),
    ).toBe('incomplete')
  })
})

describe('checkPwnedPassword', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('reports a password whose hash suffix is in the range response', async () => {
    const candidate = crypto.randomUUID()
    const digest = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(candidate))
    const hex = Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase()
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(`${hex.slice(5)}:42\r\nABCDEF:0`, { status: 200 })),
    )
    expect(await checkPwnedPassword(candidate)).toBe(true)
  })

  it('treats network failures as not compromised (the server still enforces rules)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new Error('offline'))))
    expect(await checkPwnedPassword(ACCEPTED)).toBe(false)
  })
})
