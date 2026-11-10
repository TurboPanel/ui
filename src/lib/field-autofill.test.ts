import { describe, expect, it, vi } from 'vitest'
import { NO_AUTOFILL, secretAutoComplete } from './field-autofill'

vi.mock('react-native', () => ({ Platform: { OS: 'web' } }))

describe('field autofill', () => {
  it('marks a secret box new-password on the web, where browsers ignore off', () => {
    expect(secretAutoComplete()).toBe('new-password')
    expect(secretAutoComplete('web')).toBe('new-password')
  })

  it('turns autofill off for a secret box on a phone', () => {
    expect(secretAutoComplete('ios')).toBe('off')
    expect(secretAutoComplete('android')).toBe('off')
  })

  it('turns autofill off for a plain box beside a secret one', () => {
    expect(NO_AUTOFILL).toBe('off')
  })
})
