import { describe, expect, it } from 'vitest'
import {
  NAME_SCHEME_OPTIONS,
  effectiveNameScheme,
  isNameScheme,
  lockedSchemeNotice,
  nameSchemeForRequest,
  principalNamesLabel,
  principalSchemeErrorMessage,
  systemNameLimitsText,
  systemNamePreview,
} from '@/lib/principal-name-scheme'

describe('principal-name-scheme', () => {
  it('lists the three schemes with examples', () => {
    expect(NAME_SCHEME_OPTIONS.map((o) => o.value)).toEqual(['plain', 'partial', 'random'])
    expect(NAME_SCHEME_OPTIONS[1]?.label).toContain('recommended')
    expect(NAME_SCHEME_OPTIONS[2]?.detail).toContain('u7k2m9x4qpz1')
  })

  it('validates scheme values', () => {
    expect(isNameScheme('plain')).toBe(true)
    expect(isNameScheme('nope')).toBe(false)
  })

  it('resolves the effective scheme with legacy fallback', () => {
    expect(effectiveNameScheme({ effectiveNameScheme: 'random' })).toBe('random')
    expect(effectiveNameScheme({ effectiveRandomizedUsernames: false })).toBe('plain')
    expect(effectiveNameScheme({ effectiveRandomizedUsernames: true })).toBe('partial')
    expect(effectiveNameScheme(undefined)).toBe('partial')
  })

  it('sends nameScheme only when unlocked and chosen', () => {
    expect(nameSchemeForRequest('random', { schemeLocked: false })).toBe('random')
    expect(nameSchemeForRequest('random', { schemeLocked: true })).toBeUndefined()
    expect(nameSchemeForRequest(null, undefined)).toBeUndefined()
  })

  it('previews system names', () => {
    expect(systemNamePreview('plain', ' app ')).toBe('app')
    expect(systemNamePreview('partial', 'app')).toBe('app_x7k2m9qpz1a')
    expect(systemNamePreview('random', 'app')).toBe('u7k2m9x4qpz1')
    expect(systemNamePreview('plain', '')).toBe('bob')
  })

  it('describes limits and the lock notice', () => {
    expect(systemNameLimitsText('partial')).toContain('11 random')
    expect(systemNameLimitsText('random')).toContain('never contains')
    expect(systemNameLimitsText('plain')).toContain('exactly')
    expect(lockedSchemeNotice('partial')).toBe(
      'Your organization locks new principals to partial names.'
    )
  })

  it('shows both names only when they differ', () => {
    expect(principalNamesLabel('bob', 'bob')).toBe('bob')
    expect(principalNamesLabel('bob')).toBe('bob')
    expect(principalNamesLabel('bob', 'bob_x7k2m9qpz1a')).toBe('bob -> bob_x7k2m9qpz1a')
  })

  it('maps scheme errors', () => {
    expect(principalSchemeErrorMessage('HTTP 409: principal_scheme_locked')).toContain('locks')
    expect(principalSchemeErrorMessage('HTTP 400: invalid_name_scheme')).toContain('not valid')
    expect(principalSchemeErrorMessage('HTTP 500: boom')).toBe('HTTP 500: boom')
  })
})
