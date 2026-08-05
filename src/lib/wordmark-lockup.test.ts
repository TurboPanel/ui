import { describe, expect, it } from 'vitest'
import {
  computeTurboPanelWordmarkLockup,
  consoleWordmarkLockup,
  TURBOPANEL_WORDMARK_CHROME_SIZE,
  TURBOPANEL_WORDMARK_PROFILE,
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
})
