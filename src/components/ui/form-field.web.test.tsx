// @vitest-environment happy-dom
/**
 * Autofill as the browser really sees it: rendered through React Native Web
 * itself, not the test stand-ins, which only copy the props they are given.
 */
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TextField } from '@/components/ui/form-field'
import { NO_AUTOFILL } from '@/lib/field-autofill'

vi.mock('react-native', () => vi.importActual('react-native-web'))

afterEach(cleanup)

describe('TextField autofill on the web', () => {
  it('masks a secret box and keeps the saved sign-in password out of it', () => {
    render(<TextField label="Token" value="" accessibilityLabel="Token" secureTextEntry />)
    const input = screen.getByLabelText('Token')
    expect(input.getAttribute('type')).toBe('password')
    expect(input.getAttribute('autocomplete')).toBe('new-password')
  })

  it('keeps the saved email out of the label box beside it', () => {
    render(
      <TextField label="Label" value="" accessibilityLabel="Label" autoComplete={NO_AUTOFILL} />
    )
    expect(screen.getByLabelText('Label').getAttribute('autocomplete')).toBe('off')
  })
})
