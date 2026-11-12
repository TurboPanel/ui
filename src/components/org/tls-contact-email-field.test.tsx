// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ mutate: vi.fn(), pending: false }))

vi.mock('@/components/ui', () => ({
  InlineNotice: ({ title }: { title: string }) => <p>{title}</p>,
  Button: ({
    label,
    onPress,
    disabled,
  }: {
    label: string
    onPress: () => void
    disabled?: boolean
  }) => (
    <button onClick={onPress} disabled={disabled}>
      {label}
    </button>
  ),
  TextField: ({
    label,
    value,
    onChangeText,
    editable,
  }: {
    label: string
    value: string
    onChangeText: (text: string) => void
    editable?: boolean
  }) => (
    <input
      aria-label={label}
      value={value}
      readOnly={editable === false}
      onChange={(e) => onChangeText(e.target.value)}
    />
  ),
}))
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ setQueryData: vi.fn() }) }))
vi.mock('@/lib/query-client', () => ({
  useApiMutation: () => ({ mutate: state.mutate, isPending: state.pending }),
  queryKeys: { org: () => ({ settings: { tlsSettings: ['tls-settings'] } }) },
}))
vi.mock('@/lib/instance-api', () => ({ saveOrgTlsSettings: vi.fn() }))

import { TlsContactEmailField } from './tls-contact-email-field'

const field = (props: Partial<Parameters<typeof TlsContactEmailField>[0]> = {}) =>
  render(
    <TlsContactEmailField orgId="o1" canManage savedEmail="ops@example.com" loaded {...props} />
  )

describe('TlsContactEmailField', () => {
  beforeEach(() => state.mutate.mockReset())
  afterEach(cleanup)

  it('shows the saved address and keeps Save off until it changes', () => {
    field()
    expect((screen.getByLabelText('Certificate Contact Email') as HTMLInputElement).value).toBe(
      'ops@example.com'
    )
    expect((screen.getByText('Save Contact Email') as HTMLButtonElement).disabled).toBe(true)
  })

  it('saves a trimmed new address', () => {
    field()
    fireEvent.change(screen.getByLabelText('Certificate Contact Email'), {
      target: { value: ' new@example.com ' },
    })
    fireEvent.click(screen.getByText('Save Contact Email'))
    expect(state.mutate).toHaveBeenCalledWith('new@example.com')
  })

  it('clears the setting when the field is emptied', () => {
    field()
    fireEvent.change(screen.getByLabelText('Certificate Contact Email'), { target: { value: '' } })
    fireEvent.click(screen.getByText('Save Contact Email'))
    expect(state.mutate).toHaveBeenCalledWith(null)
  })

  it('asks for a contact email when none is set', () => {
    field({ savedEmail: null })
    expect(screen.getByText('Add a contact email')).toBeTruthy()
  })

  it('shows nothing without permission', () => {
    const { container } = field({ canManage: false, savedEmail: null })
    expect(container.innerHTML).toBe('')
  })

  it('does not say none is set when the settings failed to load', () => {
    field({ savedEmail: null, loaded: false })
    expect(screen.queryByText('Add a contact email')).toBeNull()
  })
})
