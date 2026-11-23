import { describe, expect, it, vi } from 'vitest'
import { maskedMultilineProps } from './masked-multiline'

vi.mock('react-native', () => ({ Platform: { OS: 'web' } }))

describe('maskedMultilineProps', () => {
  it('leaves a plain value multi-line and visible', () => {
    expect(maskedMultilineProps(false, 'web', true)).toEqual({ multiline: true })
  })

  it('hides a secret with CSS on the web and keeps it multi-line', () => {
    const props = maskedMultilineProps(true, 'web', true)
    expect(props.multiline).toBe(true)
    expect(props.secureTextEntry).toBeUndefined()
    expect(props.style).toEqual({ WebkitTextSecurity: 'disc' })
  })

  it('falls back to a single-line secure box on a browser that cannot mask text', () => {
    expect(maskedMultilineProps(true, 'web', false)).toEqual({
      multiline: false,
      secureTextEntry: true,
    })
  })

  it('keeps the secure flag on a phone', () => {
    expect(maskedMultilineProps(true, 'ios', false)).toEqual({
      multiline: true,
      secureTextEntry: true,
    })
  })
})
