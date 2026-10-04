import { describe, expect, it } from 'vitest'
import {
  finishPwnedCheck,
  INITIAL_PWNED_STATE,
  needsPwnedLookup,
  PWNED_CHECKING_COPY,
  pwnedFieldNotice,
  pwnedStatusFor,
  pwnedSubmitDecision,
  startPwnedCheck,
} from './pwned-check'

// Built at run time so no password-shaped literal sits in the file.
const first = ['a', 'b', 'c'].join('') + String(4 * 2) + '!x'
const second = first + '9'

describe('pwned check state', () => {
  it('is idle before anything runs', () => {
    expect(pwnedStatusFor(INITIAL_PWNED_STATE, first)).toBe('idle')
    expect(needsPwnedLookup(INITIAL_PWNED_STATE, first)).toBe(true)
    expect(needsPwnedLookup(INITIAL_PWNED_STATE, '')).toBe(false)
  })

  it('is checking for the exact value being looked up', () => {
    const state = startPwnedCheck(INITIAL_PWNED_STATE, first)
    expect(pwnedStatusFor(state, first)).toBe('checking')
    expect(pwnedStatusFor(state, second)).toBe('idle')
    expect(needsPwnedLookup(state, first)).toBe(false)
  })

  it.each(['breached', 'clean', 'unavailable'] as const)(
    'keeps %s keyed to the value',
    (lookup) => {
      const state = finishPwnedCheck(startPwnedCheck(INITIAL_PWNED_STATE, first), first, lookup)
      expect(pwnedStatusFor(state, first)).toBe(lookup)
      expect(pwnedStatusFor(state, second)).toBe('idle')
      expect(needsPwnedLookup(state, first)).toBe(false)
    }
  )

  it('does not re-check when the value is unchanged, and re-checks an edited one', () => {
    const done = finishPwnedCheck(INITIAL_PWNED_STATE, first, 'clean')
    expect(needsPwnedLookup(done, first)).toBe(false)
    expect(needsPwnedLookup(done, second)).toBe(true)
  })

  it('keeps a newer in-flight check when an older one finishes', () => {
    const running = startPwnedCheck(INITIAL_PWNED_STATE, second)
    const state = finishPwnedCheck(running, first, 'breached')
    expect(pwnedStatusFor(state, second)).toBe('checking')
  })
})

describe('submit decision', () => {
  it('waits while idle or checking, blocks breached, sends clean or unreachable', () => {
    expect(pwnedSubmitDecision('idle')).toBe('wait')
    expect(pwnedSubmitDecision('checking')).toBe('wait')
    expect(pwnedSubmitDecision('breached')).toBe('block')
    expect(pwnedSubmitDecision('clean')).toBe('send')
    expect(pwnedSubmitDecision('unavailable')).toBe('send')
  })
})

describe('field notice', () => {
  it('shows a calm status while checking and the message when breached', () => {
    expect(pwnedFieldNotice('checking', 'x')).toEqual({ hint: PWNED_CHECKING_COPY })
    expect(pwnedFieldNotice('breached', 'x')).toEqual({ error: 'x' })
    for (const s of ['idle', 'clean', 'unavailable'] as const) {
      expect(pwnedFieldNotice(s, 'x')).toEqual({})
    }
  })
})
