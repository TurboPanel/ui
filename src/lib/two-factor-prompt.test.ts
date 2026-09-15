import { describe, expect, it } from 'vitest'
import {
  isTwoFactorCodeComplete,
  normalizeTwoFactorCode,
  otherTwoFactorKind,
  TWO_FACTOR_FIELD_LABEL,
  TWO_FACTOR_PROMPT_COPY,
  TWO_FACTOR_TOGGLE_LABEL,
  twoFactorAutoComplete,
  twoFactorKeyboard,
} from './two-factor-prompt'

describe('otherTwoFactorKind', () => {
  it('swaps in both directions', () => {
    expect(otherTwoFactorKind('totp')).toBe('backup')
    expect(otherTwoFactorKind('backup')).toBe('totp')
  })
})

describe('prompt copy', () => {
  it('labels each kind distinctly', () => {
    expect(TWO_FACTOR_FIELD_LABEL.totp).toBe('Authentication code')
    expect(TWO_FACTOR_FIELD_LABEL.backup).toBe('Backup code')
    expect(TWO_FACTOR_PROMPT_COPY.totp).not.toBe(TWO_FACTOR_PROMPT_COPY.backup)
  })

  it('offers the other kind in the toggle', () => {
    expect(TWO_FACTOR_TOGGLE_LABEL.totp).toBe('Use a backup code')
    expect(TWO_FACTOR_TOGGLE_LABEL.backup).toBe('Use your authenticator app')
  })
})

describe('input hints', () => {
  it('only claims a numeric keypad for authenticator codes', () => {
    expect(twoFactorKeyboard('totp')).toBe('number-pad')
    expect(twoFactorKeyboard('backup')).toBe('default')
  })

  it('only offers one-time-code autofill for authenticator codes', () => {
    expect(twoFactorAutoComplete('totp')).toBe('one-time-code')
    expect(twoFactorAutoComplete('backup')).toBe('off')
  })
})

describe('normalizeTwoFactorCode', () => {
  it('strips whitespace inside a pasted authenticator code', () => {
    expect(normalizeTwoFactorCode('  123 456 ', 'totp')).toBe('123456')
  })

  it('only trims a backup code, keeping its separators', () => {
    expect(normalizeTwoFactorCode('  abcd-efgh  ', 'backup')).toBe('abcd-efgh')
  })
})

describe('isTwoFactorCodeComplete', () => {
  it('requires exactly six digits for an authenticator code', () => {
    expect(isTwoFactorCodeComplete('12345', 'totp')).toBe(false)
    expect(isTwoFactorCodeComplete('123 456', 'totp')).toBe(true)
    expect(isTwoFactorCodeComplete('1234567', 'totp')).toBe(false)
  })

  it('requires at least eight characters for a backup code', () => {
    expect(isTwoFactorCodeComplete('abcd', 'backup')).toBe(false)
    expect(isTwoFactorCodeComplete('abcd-efgh', 'backup')).toBe(true)
  })
})
