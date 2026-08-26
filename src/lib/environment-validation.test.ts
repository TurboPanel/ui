import { describe, expect, it } from 'vitest'
import { validateEnvironmentName } from './environment-validation'

describe('validateEnvironmentName', () => {
  it('accepts a normal environment name', () => {
    expect(validateEnvironmentName('Production')).toBeNull()
  })

  it('rejects empty and control-character names', () => {
    expect(validateEnvironmentName('')).not.toBeNull()
    expect(validateEnvironmentName('   ')).not.toBeNull()
    expect(validateEnvironmentName('Bad\nName')).not.toBeNull()
  })
})
