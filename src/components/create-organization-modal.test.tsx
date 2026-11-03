// @vitest-environment happy-dom
import { createElement, type ReactNode } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CreateOrganizationModal } from './create-organization-modal'

type Props = { children?: ReactNode } & Record<string, unknown>

vi.mock('react-native', async () => {
  const { reactNativeStub } = await import('@/components/ui/v4/rn-stub')
  return reactNativeStub
})
vi.mock('@/components/ui/panel-styles', () => ({ panelStyles: { error: {} } }))
vi.mock('@/components/ui', () => ({
  ModalSheet: ({ title, children, footer }: Props) =>
    createElement(
      'div',
      null,
      createElement('h2', null, title as string),
      children,
      footer as ReactNode
    ),
  ButtonRow: ({ children }: Props) => createElement('div', null, children),
  Button: (props: Props) =>
    createElement(
      'button',
      {
        disabled: Boolean(props.disabled),
        onClick: props.onPress as () => void,
      },
      props.label as string
    ),
  TextField: (props: Props) =>
    createElement('input', {
      'aria-label': props.accessibilityLabel as string,
      placeholder: props.placeholder as string,
      value: props.value as string,
      onChange: (event: { target: { value: string } }) =>
        (props.onChangeText as (value: string) => void)(event.target.value),
    }),
}))

function renderModal(onCreate = vi.fn(async () => ({ ok: true }))) {
  render(<CreateOrganizationModal visible onClose={vi.fn()} onCreate={onCreate} />)
  return onCreate
}

describe('CreateOrganizationModal', () => {
  afterEach(() => {
    cleanup()
  })

  it('titles the dialog Create New Organization', () => {
    renderModal()
    expect(screen.getByText('Create New Organization')).toBeTruthy()
  })

  it('starts with an empty name and only a placeholder', () => {
    renderModal()
    const input = screen.getByLabelText('Organization name') as HTMLInputElement
    expect(input.value).toBe('')
    expect(input.placeholder).toBe('e.g. Acme Hosting')
  })

  it('keeps Create disabled until a name is typed', () => {
    const onCreate = renderModal()
    const create = screen.getByText('Create') as HTMLButtonElement
    expect(create.disabled).toBe(true)

    const input = screen.getByLabelText('Organization name')
    fireEvent.change(input, { target: { value: '   ' } })
    expect(create.disabled).toBe(true)

    fireEvent.change(input, { target: { value: 'Northwind Studio' } })
    expect(create.disabled).toBe(false)
    fireEvent.click(create)
    expect(onCreate).toHaveBeenCalledWith('Northwind Studio')
  })
})
