// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { EnvironmentDeleteNameModal, environmentNameMatches } from './environment-delete-name-modal'

vi.mock('react-native', async () => (await import('@/components/ui/v4/rn-stub')).reactNativeStub)
vi.mock('expo-clipboard', () => ({ setStringAsync: vi.fn(() => Promise.resolve()) }))
vi.mock('@/components/ui/panel-styles', () => ({ panelStyles: {} }))
vi.mock('@/components/ui/button', () => ({
  Button: ({
    label,
    onPress,
    disabled,
  }: Readonly<{ label: string; onPress: () => void; disabled?: boolean }>) => (
    <button type="button" disabled={disabled} onClick={onPress}>
      {label}
    </button>
  ),
}))
vi.mock('@/components/ui/mono-text', () => ({
  MonoText: ({ children }: Readonly<{ children: string }>) => <code>{children}</code>,
}))
vi.mock('@/components/ui', () => ({
  Button: (props: Readonly<{ label: string; onPress: () => void; disabled?: boolean }>) => (
    <button type="button" disabled={props.disabled} onClick={props.onPress}>
      {props.label}
    </button>
  ),
  ButtonRow: ({ children }: Readonly<{ children: unknown }>) => <div>{children as never}</div>,
  ModalSheet: ({
    title,
    children,
    footer,
  }: Readonly<{ title: string; children: unknown; footer: unknown }>) => (
    <div>
      <h1>{title}</h1>
      {children as never}
      {footer as never}
    </div>
  ),
  TextField: ({
    label,
    value,
    onChangeText,
  }: Readonly<{ label: string; value: string; onChangeText: (v: string) => void }>) => (
    <input aria-label={label} value={value} onChange={(e) => onChangeText(e.target.value)} />
  ),
}))

afterEach(cleanup)

function renderModal(onConfirm = vi.fn()) {
  render(
    <EnvironmentDeleteNameModal
      name="production"
      pending={false}
      error={null}
      onCancel={vi.fn()}
      onConfirm={onConfirm}
    />
  )
  return onConfirm
}

describe('environmentNameMatches', () => {
  it('needs the exact name', () => {
    expect(environmentNameMatches('production', 'production')).toBe(true)
    expect(environmentNameMatches('Production', 'production')).toBe(false)
    expect(environmentNameMatches('production ', 'production')).toBe(false)
    expect(environmentNameMatches('', '')).toBe(false)
  })
})

describe('EnvironmentDeleteNameModal', () => {
  it('shows the name with a Copy button and keeps Delete Environment disabled until the name is typed', () => {
    const onConfirm = renderModal()
    expect(screen.getByRole('heading').textContent).toBe('Delete Environment')
    expect(screen.getByText('production')).toBeTruthy()
    expect(screen.getByText('Copy')).toBeTruthy()

    const button = screen.getByText('Delete Environment', {
      selector: 'button',
    }) as HTMLButtonElement
    expect(button.disabled).toBe(true)

    const field = screen.getByLabelText('Environment name')
    fireEvent.change(field, { target: { value: 'productio' } })
    expect(button.disabled).toBe(true)
    fireEvent.change(field, { target: { value: 'Production' } })
    expect(button.disabled).toBe(true)

    fireEvent.change(field, { target: { value: 'production' } })
    expect(button.disabled).toBe(false)
    fireEvent.click(button)
    expect(onConfirm).toHaveBeenCalledWith('production')
  })
})
