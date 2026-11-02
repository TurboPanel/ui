// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TypeNameConfirmModal, TypeNameDeleteButton, typeNameHelp } from './type-name-confirm'

const { setStringAsync } = vi.hoisted(() => ({ setStringAsync: vi.fn(() => Promise.resolve()) }))

vi.mock('react-native', async () => (await import('@/components/ui/v4/rn-stub')).reactNativeStub)
vi.mock('expo-clipboard', () => ({ setStringAsync }))
vi.mock('@/components/ui/panel-styles', () => ({ panelStyles: {} }))
vi.mock('@/components/ui/button', () => ({
  Button: ({
    label,
    onPress,
    disabled,
    busy,
    busyLabel,
  }: Readonly<{
    label: string
    onPress: () => void
    disabled?: boolean
    busy?: boolean
    busyLabel?: string
  }>) => (
    <button type="button" disabled={disabled} onClick={onPress}>
      {busy && busyLabel ? busyLabel : label}
    </button>
  ),
  ButtonRow: ({ children }: Readonly<{ children: unknown }>) => <div>{children as never}</div>,
}))
vi.mock('@/components/ui/modal-sheet', () => ({
  ModalSheet: ({
    title,
    description,
    children,
    footer,
  }: Readonly<{ title: string; description?: string; children: unknown; footer: unknown }>) => (
    <div role="dialog">
      <h1>{title}</h1>
      {description ? <p>{description}</p> : null}
      {children as never}
      {footer as never}
    </div>
  ),
}))
vi.mock('@/components/ui/form-field', () => ({
  TextField: ({
    label,
    value,
    onChangeText,
  }: Readonly<{ label: string; value: string; onChangeText: (v: string) => void }>) => (
    <input aria-label={label} value={value} onChange={(e) => onChangeText(e.target.value)} />
  ),
}))
vi.mock('@/components/ui/mono-text', () => ({
  MonoText: ({ children }: Readonly<{ children: string }>) => <code>{children}</code>,
}))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

/** The destructive button inside the dialog (the opener can carry the same words). */
function confirmButton(title: string): HTMLButtonElement {
  return within(screen.getByRole('dialog')).getByText(title, {
    selector: 'button',
  }) as HTMLButtonElement
}

describe('typeNameHelp', () => {
  it('says it cannot be undone unless the caller says it can', () => {
    expect(typeNameHelp(false)).toBe("Type the name to confirm. This can't be undone.")
    expect(typeNameHelp(true)).toBe('Type the name to confirm.')
  })
})

describe('TypeNameConfirmModal', () => {
  it('shows the name with a Copy button and enables the delete only on an exact match', () => {
    const onConfirm = vi.fn()
    render(
      <TypeNameConfirmModal
        thing="Server"
        name="web-1"
        description="Permanently removes this server."
        pending={false}
        onCancel={vi.fn()}
        onConfirm={onConfirm}
      />
    )
    expect(screen.getByRole('heading').textContent).toBe('Delete Server')
    expect(screen.getByText('Permanently removes this server.')).toBeTruthy()
    expect(screen.getByText('web-1')).toBeTruthy()
    expect(screen.getByText("Type the name to confirm. This can't be undone.")).toBeTruthy()

    fireEvent.click(screen.getByText('Copy'))
    expect(setStringAsync).toHaveBeenCalledWith('web-1')

    const button = confirmButton('Delete Server')
    const field = screen.getByLabelText('Server name')
    expect(button.disabled).toBe(true)
    for (const near of ['web-', 'Web-1', 'web-1 ', ' web-1']) {
      fireEvent.change(field, { target: { value: near } })
      expect(button.disabled).toBe(true)
      fireEvent.click(button)
    }
    expect(onConfirm).not.toHaveBeenCalled()

    fireEvent.change(field, { target: { value: 'web-1' } })
    expect(button.disabled).toBe(false)
    fireEvent.click(button)
    expect(onConfirm).toHaveBeenCalledWith('web-1')
  })

  it('uses the verb, shows the error and keeps Cancel off while pending', () => {
    const onCancel = vi.fn()
    render(
      <TypeNameConfirmModal
        thing="Member"
        verb="Remove"
        name="sam@example.test"
        undoable
        pending
        error="Only an owner can remove an owner."
        onCancel={onCancel}
        onConfirm={vi.fn()}
      />
    )
    expect(screen.getByRole('heading').textContent).toBe('Remove Member')
    expect(screen.getByText('Removing…')).toBeTruthy()
    expect(screen.getByText('Type the name to confirm.')).toBeTruthy()
    expect(screen.getByText('Only an owner can remove an owner.')).toBeTruthy()
    expect((screen.getByText('Cancel') as HTMLButtonElement).disabled).toBe(true)
  })
})

describe('TypeNameDeleteButton', () => {
  function typeAndConfirm(name: string, title: string) {
    fireEvent.change(screen.getByLabelText(`${title.split(' ').slice(1).join(' ')} name`), {
      target: { value: name },
    })
    fireEvent.click(confirmButton(title))
  }

  it('opens the dialog, passes the typed name and closes after a plain call', () => {
    const onConfirm = vi.fn()
    render(
      <TypeNameDeleteButton
        label="Delete"
        thing="Hosting Account"
        name="shop"
        onConfirm={onConfirm}
      />
    )
    expect(screen.queryByRole('dialog')).toBeNull()
    fireEvent.click(screen.getByText('Delete'))
    expect(screen.getByRole('dialog')).toBeTruthy()
    typeAndConfirm('shop', 'Delete Hosting Account')
    expect(onConfirm).toHaveBeenCalledWith('shop')
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('stays open while the promise runs and when it resolves to false', async () => {
    let finish: (value: boolean) => void = () => {}
    const onConfirm = vi.fn(
      () =>
        new Promise<boolean>((resolve) => {
          finish = resolve
        })
    )
    render(<TypeNameDeleteButton thing="Database" name="app" onConfirm={onConfirm} />)
    fireEvent.click(screen.getByText('Delete Database'))
    typeAndConfirm('app', 'Delete Database')
    expect(screen.getByText('Deleting…')).toBeTruthy()
    await act(async () => {
      finish(false)
      await Promise.resolve()
    })
    expect(screen.getByRole('dialog')).toBeTruthy()

    fireEvent.click(confirmButton('Delete Database'))
    await act(async () => {
      finish(true)
      await Promise.resolve()
    })
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('cannot be opened while disabled', () => {
    render(<TypeNameDeleteButton thing="Server" name="web-1" disabled onConfirm={vi.fn()} />)
    const opener = screen.getByText('Delete Server') as HTMLButtonElement
    expect(opener.disabled).toBe(true)
    fireEvent.click(opener)
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})

describe('TypeNameDeleteButton failures', () => {
  it('stays open and shows the reason when the delete rejects', async () => {
    const onConfirm = vi.fn(() => Promise.reject(new Error('Server is busy.')))
    render(<TypeNameDeleteButton thing="Project" name="Shop" onConfirm={onConfirm} />)
    fireEvent.click(screen.getByText('Delete Project'))
    fireEvent.change(screen.getByLabelText('Project name'), { target: { value: 'Shop' } })
    await act(async () => {
      fireEvent.click(confirmButton('Delete Project'))
      await Promise.resolve()
    })
    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(screen.getByText('Server is busy.')).toBeTruthy()
  })
})
