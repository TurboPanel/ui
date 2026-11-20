// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { OrganizationDeleteBlockedError } from '@/lib/instance-api'
import { OrganizationDeleteButton } from './organization-delete-button'

const { push, mutateAsync } = vi.hoisted(() => ({ push: vi.fn(), mutateAsync: vi.fn() }))

vi.mock('react-native', async () => (await import('@/components/ui/v4/rn-stub')).reactNativeStub)
vi.mock('expo-clipboard', () => ({ setStringAsync: vi.fn() }))
vi.mock('expo-router', () => ({ useRouter: () => ({ push }) }))
vi.mock('@/lib/queries/auth', () => ({ useDeleteOrganization: () => ({ mutateAsync }) }))
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
  ButtonRow: ({ children }: Readonly<{ children: unknown }>) => <div>{children as never}</div>,
}))
vi.mock('@/components/ui/modal-sheet', () => ({
  ModalSheet: ({
    title,
    children,
    footer,
  }: Readonly<{ title: string; children: unknown; footer: unknown }>) => (
    <div role="dialog">
      <h1>{title}</h1>
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
vi.mock('@/components/ui/copy-button', () => ({ CopyButton: () => null }))
vi.mock('@/components/ui', async () => ({
  TypeNameDeleteButton: (await import('@/components/ui/type-name-confirm')).TypeNameDeleteButton,
}))
vi.mock('@/components/ui/text-link', () => ({
  TextLink: ({ label, onPress }: Readonly<{ label: string; onPress: () => void }>) => (
    <button type="button" onClick={onPress}>
      {label}
    </button>
  ),
}))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

function open(onDeleted = vi.fn()) {
  render(<OrganizationDeleteButton orgId="o1" orgName="Acme" onDeleted={onDeleted} />)
  fireEvent.click(screen.getByText('Delete Organization', { selector: 'button' }))
  return onDeleted
}

function confirm(): HTMLButtonElement {
  return within(screen.getByRole('dialog')).getByText('Delete Organization', {
    selector: 'button',
  }) as HTMLButtonElement
}

function type(value: string) {
  fireEvent.change(screen.getByLabelText('Organization name'), { target: { value } })
}

describe('OrganizationDeleteButton', () => {
  it('keeps Delete off until the exact name is typed', () => {
    open()
    expect(confirm().disabled).toBe(true)
    type('acme')
    expect(confirm().disabled).toBe(true)
    type('Acme')
    expect(confirm().disabled).toBe(false)
  })

  it('deletes with the typed name and reports it', async () => {
    mutateAsync.mockResolvedValue({ ok: true, id: 'o1' })
    const onDeleted = open()
    type('Acme')
    await act(async () => {
      fireEvent.click(confirm())
    })
    expect(mutateAsync).toHaveBeenCalledWith({ id: 'o1', confirmName: 'Acme' })
    expect(onDeleted).toHaveBeenCalledWith('o1')
  })

  it('shows a 409 in plain words with a link to fix it, and stays open', async () => {
    mutateAsync.mockRejectedValue(
      new OrganizationDeleteBlockedError('organization_has_servers', 'raw', 2)
    )
    const onDeleted = open()
    type('Acme')
    await act(async () => {
      fireEvent.click(confirm())
    })
    expect(onDeleted).not.toHaveBeenCalled()
    expect(screen.getByText(/still has 2 servers/)).toBeTruthy()
    fireEvent.click(screen.getByText('Open Servers'))
    expect(push).toHaveBeenCalledWith('/o1/servers')
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('asks the person to confirm it is them when the step-up was cancelled (403 reauth_required)', async () => {
    mutateAsync.mockRejectedValue(new Error('/organizations/o1 failed: HTTP 403: reauth_required'))
    open()
    type('Acme')
    await act(async () => {
      fireEvent.click(confirm())
    })
    expect(screen.getByText(/confirm it is you/)).toBeTruthy()
    expect(screen.queryByText(/owner or a platform admin/)).toBeNull()
  })

  it('says only the owner or a platform admin can delete on a plain 403', async () => {
    mutateAsync.mockRejectedValue(new Error('/organizations/o1 failed: HTTP 403: forbidden'))
    open()
    type('Acme')
    await act(async () => {
      fireEvent.click(confirm())
    })
    expect(screen.getByText(/owner or a platform admin/)).toBeTruthy()
  })
})
