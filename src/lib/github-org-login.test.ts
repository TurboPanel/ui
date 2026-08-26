import { describe, expect, it } from 'vitest'
import {
  githubOrgLoginError,
  isValidGithubOrgLogin,
  normalizeGithubOrgLogin,
} from '@/lib/github-org-login'

describe('normalizeGithubOrgLogin', () => {
  it('trims space and a leading @', () => {
    expect(normalizeGithubOrgLogin('  @TurboPanel  ')).toBe('TurboPanel')
  })
})

describe('isValidGithubOrgLogin', () => {
  it('accepts single-character and hyphenated logins', () => {
    expect(isValidGithubOrgLogin('a')).toBe(true)
    expect(isValidGithubOrgLogin('TurboPanel')).toBe(true)
    expect(isValidGithubOrgLogin('my-org')).toBe(true)
  })

  it('rejects empty, spaced, pathed, and hyphen-ended values', () => {
    expect(isValidGithubOrgLogin('')).toBe(false)
    expect(isValidGithubOrgLogin('   ')).toBe(false)
    expect(isValidGithubOrgLogin('my org')).toBe(false)
    expect(isValidGithubOrgLogin('https://github.com/my-org')).toBe(false)
    expect(isValidGithubOrgLogin('my-org/')).toBe(false)
    expect(isValidGithubOrgLogin('-org')).toBe(false)
    expect(isValidGithubOrgLogin('org-')).toBe(false)
  })
})

describe('githubOrgLoginError', () => {
  it('asks for a login when the field is blank', () => {
    expect(githubOrgLoginError('')).toBe(
      'Enter the GitHub organization login, or choose Personal account.',
    )
  })

  it('returns null for a valid login', () => {
    expect(githubOrgLoginError('@TurboPanel')).toBeNull()
  })
})
