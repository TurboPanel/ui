import { describe, expect, it } from 'vitest'
import {
  optionalPassword,
  resolveSecurityAction,
  securityActionMessage,
  securityActionNeedsPassword,
  STEP_UP_REQUIRED_NOTE,
} from './security-actions'

describe('resolveSecurityAction', () => {
  it('reports success', () => {
    expect(resolveSecurityAction({ ok: true })).toEqual({ kind: 'ok' })
  })

  it('reads a blanked 403 as a step-up request', () => {
    expect(resolveSecurityAction({ ok: false, error: null })).toEqual({
      kind: 'step-up',
      message: STEP_UP_REQUIRED_NOTE,
    })
  })

  it('passes a real failure through verbatim', () => {
    expect(
      resolveSecurityAction({ ok: false, error: 'HTTP 400: invalid_code' }),
    ).toEqual({ kind: 'error', message: 'HTTP 400: invalid_code' })
  })
})

describe('securityActionMessage', () => {
  it('is null on success', () => {
    expect(securityActionMessage({ ok: true })).toBeNull()
  })

  it('is the step-up note for a blanked 403', () => {
    expect(securityActionMessage({ ok: false, error: null })).toBe(
      STEP_UP_REQUIRED_NOTE,
    )
  })

  it('is the error text otherwise', () => {
    expect(securityActionMessage({ ok: false, error: 'nope' })).toBe('nope')
  })
})

describe('securityActionNeedsPassword', () => {
  it('only asks for a password on a step-up', () => {
    expect(securityActionNeedsPassword({ ok: false, error: null })).toBe(true)
    expect(securityActionNeedsPassword({ ok: false, error: 'nope' })).toBe(false)
    expect(securityActionNeedsPassword({ ok: true })).toBe(false)
  })
})

describe('optionalPassword', () => {
  it('drops an empty or whitespace-only field', () => {
    expect(optionalPassword('')).toBeUndefined()
    expect(optionalPassword('   ')).toBeUndefined()
  })

  it('trims a supplied password', () => {
    expect(optionalPassword('  hunter2 ')).toBe('hunter2')
  })
})
