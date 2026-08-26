import { describe, expect, it } from 'vitest'
import {
  computeTurboPanelWordmarkLockup,
  consoleMarkRenderSize,
  consoleWordmarkLockup,
  TURBOPANEL_WORDMARK_CHROME_SIZE,
  TURBOPANEL_WORDMARK_PROFILE,
  wordmarkLetterSpacingPx,
} from './wordmark-lockup'

describe('computeTurboPanelWordmarkLockup', () => {
  it('matches website chrome geometry at default size', () => {
    const lockup = computeTurboPanelWordmarkLockup({
      size: TURBOPANEL_WORDMARK_CHROME_SIZE.website.default,
      profile: 'website',
    })

    expect(lockup).toMatchObject({
      lockupHeight: 32,
      wordSize: 26,
      wordBottomOffset: -TURBOPANEL_WORDMARK_PROFILE.website.wordDownPx,
      skew: '-15deg',
      text: 'urboPanel',
    })
  })

  it('matches console chrome geometry at default size', () => {
    const lockup = consoleWordmarkLockup(TURBOPANEL_WORDMARK_CHROME_SIZE.console.default)

    expect(lockup).toMatchObject({
      lockupHeight: 42,
      wordSize: 35,
      wordBottomOffset: -TURBOPANEL_WORDMARK_PROFILE.console.wordDownPx,
    })
  })

  it('honours mark-only width', () => {
    const lockup = computeTurboPanelWordmarkLockup({
      size: 30,
      markOnly: true,
      profile: 'website',
    })

    expect(lockup.lockupWidth).toBe(lockup.markWidth)
  })

  it('scales console lockup geometry for smaller sizes', () => {
    const large = consoleWordmarkLockup(TURBOPANEL_WORDMARK_CHROME_SIZE.console.default)
    const small = consoleWordmarkLockup(24)
    expect(small.lockupHeight).toBeLessThan(large.lockupHeight)
    expect(small.wordSize).toBeGreaterThan(0)
  })

  it('defaults profile to console and honours boost/down overrides', () => {
    const defaults = computeTurboPanelWordmarkLockup({ size: 40 })
    const boosted = computeTurboPanelWordmarkLockup({
      size: 40,
      wordBoostPx: 8,
      wordDownPx: 0,
    })
    expect(defaults.wordBottomOffset).toBe(
      -TURBOPANEL_WORDMARK_PROFILE.console.wordDownPx,
    )
    expect(boosted.wordSize).toBeGreaterThan(defaults.wordSize)
    expect(boosted.wordBottomOffset).toBe(-0)
  })
})

describe('wordmarkLetterSpacingPx', () => {
  it('returns zero when letterSpacingEm is zero', () => {
    expect(wordmarkLetterSpacingPx(40)).toBe(0)
  })
})

describe('consoleMarkRenderSize', () => {
  it('maps design size to mark ink height', () => {
    const lockup = consoleWordmarkLockup(40, true)
    expect(consoleMarkRenderSize(40)).toBe(
      Math.round(lockup.markRenderHeight),
    )
  })
})
