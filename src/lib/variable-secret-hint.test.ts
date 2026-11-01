import { describe, expect, it } from 'vitest'
import { looksLikeSecretVariable } from './variable-secret-hint'

// Built from fragments so the repository secret scan sees no token-shaped literal.
const GITHUB_TOKEN = ['ghp', '_', 'a'.repeat(30)].join('')
const AWS_KEY = ['AKIA', 'B'.repeat(16)].join('')
const PEM = ['-----BEGIN ', 'PRIVATE', ' KEY-----'].join('')
const DB_URL = ['postgres', '://app:', 'hunter2', '@db.internal/app'].join('')

describe('looksLikeSecretVariable', () => {
  it('flags secret-sounding names that have a value', () => {
    expect(looksLikeSecretVariable('STRIPE_API_KEY', 'abc')).toBe(true)
    expect(looksLikeSecretVariable('db_password', 'abc')).toBe(true)
    expect(looksLikeSecretVariable('AUTH_TOKEN', 'abc')).toBe(true)
  })

  it('does not flag a secret-sounding name with no value yet', () => {
    expect(looksLikeSecretVariable('DB_PASSWORD', '')).toBe(false)
    expect(looksLikeSecretVariable('DB_PASSWORD', '   ')).toBe(false)
  })

  it('flags values shaped like credentials whatever the name', () => {
    for (const value of [GITHUB_TOKEN, AWS_KEY, PEM, DB_URL]) {
      expect(looksLikeSecretVariable('SETTING', value)).toBe(true)
    }
  })

  it('leaves ordinary settings alone', () => {
    expect(looksLikeSecretVariable('PORT', '3000')).toBe(false)
    expect(looksLikeSecretVariable('NODE_ENV', 'production')).toBe(false)
    expect(looksLikeSecretVariable('PUBLIC_URL', 'https://example.com/app')).toBe(false)
  })
})
