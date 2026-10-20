import { describe, expect, it } from 'vitest'
import {
  ENVIRONMENT_NAME_RULE_TEXT,
  environmentFolderNameProblem,
  validateEnvironmentName,
} from './environment-validation'

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
    expect(validateEnvironmentName('base')).toContain('reserved')
    expect(environmentFolderNameProblem('base')).toBe('“base” is reserved. Pick another name.')
    // Uppercase is refused by the letter rule before the reserved list is reached.
    expect(validateEnvironmentName('Base')).not.toBeNull()
    expect(environmentFolderNameProblem('Base')).toBe(ENVIRONMENT_NAME_RULE_TEXT)
    expect(validateEnvironmentName('base-2')).toBeNull()
  })
})
