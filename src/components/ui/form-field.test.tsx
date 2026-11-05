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
