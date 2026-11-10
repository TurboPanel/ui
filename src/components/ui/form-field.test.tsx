// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TextField } from './form-field'

vi.mock('react-native', async () => (await import('@/components/ui/v4/rn-stub')).reactNativeStub)

afterEach(cleanup)

describe('TextField leading', () => {
  it('draws the leading control left of the input, in one row', () => {
    render(
      <TextField
        label="Project name"
        value=""
        accessibilityLabel="Project name"
        leading={<span data-testid="lead" />}
      />
    )
    const lead = screen.getByTestId('lead')
    const input = screen.getByLabelText('Project name')
    expect(lead.compareDocumentPosition(input)).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
    const row = lead.parentElement as HTMLElement
    expect(JSON.parse(row.dataset.style ?? '{}')).toMatchObject({ flexDirection: 'row' })
  })

  it('keeps the plain layout without one', () => {
    render(<TextField label="Name" value="" accessibilityLabel="Name" />)
    const wrap = screen.getByLabelText('Name').parentElement?.parentElement as HTMLElement
    expect(JSON.parse(wrap.dataset.style ?? '{}')).not.toMatchObject({ flexDirection: 'row' })
  })
})

describe('TextField autofill', () => {
  it('keeps the saved sign-in out of a secret box', () => {
    render(<TextField label="Token" value="" accessibilityLabel="Token" secureTextEntry />)
    const input = screen.getByLabelText('Token')
    expect(input.getAttribute('type')).toBe('password')
    expect(input.getAttribute('autocomplete')).toBe('new-password')
  })

  it("keeps the caller's own value", () => {
    render(
      <TextField
        label="Password"
        value=""
        accessibilityLabel="Password"
        secureTextEntry
        autoComplete="current-password"
      />
    )
    expect(screen.getByLabelText('Password').getAttribute('autocomplete')).toBe('current-password')
  })

  it('leaves a plain box alone', () => {
    render(<TextField label="Name" value="" accessibilityLabel="Name" />)
    const input = screen.getByLabelText('Name')
    expect(input.getAttribute('type')).toBeNull()
    expect(input.getAttribute('autocomplete')).toBeNull()
  })
})
