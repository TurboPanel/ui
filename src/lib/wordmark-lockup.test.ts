import { describe, expect, it } from 'vitest'
import {
  computeTurboPanelWordmarkLockup,
  consoleMarkRenderSize,
  consoleWordmarkLockup,
  TURBOPANEL_WORDMARK_ASCENT_EM,
  TURBOPANEL_WORDMARK_CHROME_SIZE,
  TURBOPANEL_WORDMARK_DESCENT_EM,
  TURBOPANEL_WORDMARK_LOCKUP_TUNING,
  TURBOPANEL_WORDMARK_OVERSHOOT_EM,
  TURBOPANEL_WORDMARK_PROFILE,
  wordBaselineAboveBoxBottomPx,
  wordBaselineDropPx,
  wordmarkLetterSpacingPx,
} from './wordmark-lockup'

/** Expected `bottom` for a word: profile/override nudge plus the baseline drop. */
const bottomFor = (wordSize: number, downPx: number): number =>
  -(downPx + wordBaselineDropPx(wordSize))

describe('wordBaselineAboveBoxBottomPx', () => {
  it('follows the browser rounding of ascent and descent to whole pixels', () => {
    expect(TURBOPANEL_WORDMARK_ASCENT_EM).toBe(0.95)
    expect(TURBOPANEL_WORDMARK_DESCENT_EM).toBe(0.25)
    // 31px: ascent 29.45 -> 29, descent 7.75 -> 8, (31 + 8 - 29) / 2.
    expect(wordBaselineAboveBoxBottomPx(31)).toBe(5)
    // 33px measured in the browser: ascent 31, descent 8 -> 5.
    expect(wordBaselineAboveBoxBottomPx(33)).toBe(5)
    // 29px: ascent 27.55 -> 28, descent 7.25 -> 7 -> 4, where 0.15 em would say 4.35.
    expect(wordBaselineAboveBoxBottomPx(29)).toBe(4)
    expect(wordBaselineAboveBoxBottomPx(0)).toBe(0)
  })
})

describe('wordBaselineDropPx', () => {
  it('drops the word so its lowest ink sits on the base of the T', () => {
    expect(TURBOPANEL_WORDMARK_LOCKUP_TUNING.wordBaselineOnMarkBase).toBe(true)
    // The lowest letter (e) dips 12.74/1000 em below the baseline at weight 800.
    expect(TURBOPANEL_WORDMARK_OVERSHOOT_EM).toBe(0.0127)
    expect(wordBaselineDropPx(29)).toBeCloseTo(4 - 29 * 0.0127, 4)
    expect(wordBaselineDropPx(31)).toBeCloseTo(4.6063, 3)
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
      wordSize: 31,
      wordBottomOffset: bottomFor(31, TURBOPANEL_WORDMARK_PROFILE.website.wordDownPx),
      skew: '-14deg',
      text: 'urboPanel',
    })
    // 31px word, no profile nudge: baseline 5px above the box bottom, less 31 * 0.0127.
    expect(lockup.wordBottomOffset).toBeCloseTo(-4.6063, 3)
  })

  it('matches console chrome geometry at default size', () => {
    const lockup = consoleWordmarkLockup(TURBOPANEL_WORDMARK_CHROME_SIZE.console.default)

    expect(lockup).toMatchObject({
      lockupHeight: 42,
      wordSize: 43,
      wordBottomOffset: bottomFor(43, TURBOPANEL_WORDMARK_PROFILE.console.wordDownPx),
    })
    // 43px word: baseline 6.5px above the box (ascent 41, descent 11), less 43 * 0.0127,
    // plus the console profile's 2px nudge.
    expect(lockup.wordBottomOffset).toBeCloseTo(-7.9539, 3)
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
  it('scales the letter spacing with the font size', () => {
    expect(wordmarkLetterSpacingPx(40)).toBeCloseTo(0.8)
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
