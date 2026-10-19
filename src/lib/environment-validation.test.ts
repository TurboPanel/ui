import { describe, expect, it } from 'vitest'
import { validateEnvironmentName } from './environment-validation'

describe('validateEnvironmentName', () => {
  it('accepts a normal environment name', () => {
    expect(validateEnvironmentName('production')).toBeNull()
    expect(validateEnvironmentName('staging_2')).toBeNull()
  })

  it('rejects empty and control-character names', () => {
    expect(validateEnvironmentName('')).not.toBeNull()
    expect(validateEnvironmentName('   ')).not.toBeNull()
    expect(validateEnvironmentName('Bad\nName')).not.toBeNull()
  })

  it('refuses names that cannot be a folder', () => {
    expect(validateEnvironmentName('Production')).not.toBeNull()
    expect(validateEnvironmentName('my env')).not.toBeNull()
    expect(validateEnvironmentName('-prod')).not.toBeNull()
    expect(validateEnvironmentName('a'.repeat(33))).not.toBeNull()
  })

  it('refuses reserved words', () => {
    expect(validateEnvironmentName('common')).toContain('reserved')
    expect(validateEnvironmentName('tmp')).toContain('reserved')
  })
})
