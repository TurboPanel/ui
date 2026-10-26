import { describe, expect, it } from 'vitest'
import {
  computeTurboPanelWordmarkLockup,
  consoleMarkRenderSize,
  consoleWordmarkLockup,
  TURBOPANEL_WORDMARK_BASELINE_EM,
  TURBOPANEL_WORDMARK_CHROME_SIZE,
  TURBOPANEL_WORDMARK_LOCKUP_TUNING,
  TURBOPANEL_WORDMARK_PROFILE,
  wordBaselineDropPx,
  wordmarkLetterSpacingPx,
} from './wordmark-lockup'

/** Expected `bottom` for a word: profile/override nudge plus the baseline drop. */
const bottomFor = (wordSize: number, downPx: number): number =>
  -(downPx + wordBaselineDropPx(wordSize))

describe('wordBaselineDropPx', () => {
  it('drops the word by the baseline distance when the lockup sits on the base', () => {
    expect(TURBOPANEL_WORDMARK_LOCKUP_TUNING.wordBaselineOnMarkBase).toBe(true)
    // Figtree: ascent 0.95 em, descent 0.25 em -> 0.25 - (1.2 - 1) / 2.
    expect(TURBOPANEL_WORDMARK_BASELINE_EM).toBe(0.15)
    expect(wordBaselineDropPx(40)).toBeCloseTo(6)
    expect(wordBaselineDropPx(0)).toBe(0)
  })
})

describe('computeTurboPanelWordmarkLockup', () => {
  it('matches website chrome geometry at default size', () => {
    const lockup = computeTurboPanelWordmarkLockup({
      size: TURBOPANEL_WORDMARK_CHROME_SIZE.website.default,
      profile: 'website',
    })

    expect(lockup).toMatchObject({
      lockupHeight: 32,
      wordSize: 33,
      wordBottomOffset: bottomFor(33, TURBOPANEL_WORDMARK_PROFILE.website.wordDownPx),
      skew: '-14deg',
      text: 'urboPanel',
    })
    // 33px word, no profile nudge: the baseline drop alone.
    expect(lockup.wordBottomOffset).toBeCloseTo(-4.95)
  })

  it('matches console chrome geometry at default size', () => {
    const lockup = consoleWordmarkLockup(TURBOPANEL_WORDMARK_CHROME_SIZE.console.default)

    expect(lockup).toMatchObject({
      lockupHeight: 42,
      wordSize: 46,
      wordBottomOffset: bottomFor(46, TURBOPANEL_WORDMARK_PROFILE.console.wordDownPx),
    })
    expect(lockup.wordBottomOffset).toBeCloseTo(-8.9)
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
      bottomFor(defaults.wordSize, TURBOPANEL_WORDMARK_PROFILE.console.wordDownPx),
    )
    expect(boosted.wordSize).toBeGreaterThan(defaults.wordSize)
    expect(boosted.wordBottomOffset).toBe(bottomFor(boosted.wordSize, 0))
  })
})

describe('wordmarkLetterSpacingPx', () => {
  it('scales the tight letter spacing with the font size', () => {
    expect(wordmarkLetterSpacingPx(40)).toBeCloseTo(-0.4)
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
