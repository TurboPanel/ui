// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PrincipalAccessPanel } from './principal-access-panel'

type Props = Readonly<Record<string, unknown> & { children?: ReactNode }>

const state = vi.hoisted(() => ({
  addKey: vi.fn(),
  removeKey: vi.fn(),
  setPassword: vi.fn(),
  disablePassword: vi.fn(),
}))

vi.mock('react-native', () => ({
  StyleSheet: { create: (styles: unknown) => styles },
  View: ({ children }: Props) => <div>{children}</div>,
  Text: ({ children }: Props) => <span>{children}</span>,
}))
vi.mock('@/components/ui/panel-styles', () => ({ panelStyles: {} }))
vi.mock('@/lib/theme', () => ({ colors: {}, spacing: {} }))
vi.mock('@/components/ui', () => ({
  Button: ({ label, onPress }: Props) => (
    <button type="button" onClick={onPress as () => void}>
      {label as string}
    </button>
  ),
  ConfirmButton: ({ label, onConfirm }: Props) => (
    <button type="button" onClick={onConfirm as () => void}>
      {label as string}
    </button>
  ),
  CopyButton: () => null,
  InlineNotice: () => null,
  LoadingState: () => null,
  MonoText: ({ children }: Props) => <code>{children}</code>,
  SegmentedControl: () => null,
  TextField: ({ label, onChangeText }: Props) => (
    <input
      aria-label={label as string}
      onChange={(event) => (onChangeText as (text: string) => void)(event.target.value)}
    />
  ),
  TypeNameDeleteButton: ({ label, onConfirm }: Props) => (
    <button type="button" onClick={onConfirm as () => void}>
      {label as string}
    </button>
  ),
}))
vi.mock('@/lib/queries/projects', () => ({
  usePrincipalSshKeys: () => ({
    isLoading: false,
    data: {
      keys: [
        {
          id: 'k1',
          name: 'Laptop',
          fingerprint: 'SHA256:abc',
          keyType: 'ed25519',
          bits: null,
          comment: null,
        },
      ],
    },
  }),
  // `actionError` is null throughout: it is render state, empty inside the call that failed.
  useAddPrincipalSshKey: () => ({ run: state.addKey, isPending: false, actionError: null }),
  useDeletePrincipalSshKey: () => ({ run: state.removeKey, isPending: false, actionError: null }),
  useSetPrincipalPassword: () => ({ run: state.setPassword, isPending: false, actionError: null }),
  useDisablePrincipalPassword: () => ({
    run: state.disablePassword,
    isPending: false,
    actionError: null,
  }),
}))

function renderPanel(passwordAuth = false) {
  render(
    <PrincipalAccessPanel
      orgId="o"
      projectId="p"
      principalId="u1"
      username="deploy"
      access="shell"
      passwordAuth={passwordAuth}
      canManage
      onChangeAccess={vi.fn()}
      savingAccess={false}
    />
  )
}

beforeEach(() => {
  for (const fn of Object.values(state)) fn.mockReset()
})
afterEach(cleanup)

describe('PrincipalAccessPanel failed saves', () => {
  it('says why a key was refused and keeps the form open', async () => {
    state.addKey.mockResolvedValue({ ok: false, error: 'That is a private key.' })
    renderPanel()
    fireEvent.click(screen.getByRole('button', { name: 'Add key' }))
    fireEvent.change(screen.getByLabelText('Key name'), { target: { value: 'Desk' } })
    fireEvent.change(screen.getByLabelText('Public key'), { target: { value: 'ssh-ed25519 AAAA' } })
    fireEvent.click(screen.getAllByRole('button', { name: 'Add key' })[0])
    await waitFor(() => expect(screen.getByText('That is a private key.')).toBeTruthy())
    expect(screen.getByLabelText('Key name')).toBeTruthy()
  })

  it('says why a key could not be removed', async () => {
    state.removeKey.mockResolvedValue({ ok: false, error: null })
    renderPanel()
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }))
    await waitFor(() => expect(screen.getByText('That key could not be removed.')).toBeTruthy())
  })

  it('shows the password refusal and no generated password', async () => {
    state.setPassword.mockResolvedValue({ ok: false, error: 'Password sign-in is off here.' })
    renderPanel()
    fireEvent.click(screen.getByRole('button', { name: 'Enable' }))
    fireEvent.click(screen.getByRole('button', { name: 'Generate' }))
    await waitFor(() => expect(screen.getByText('Password sign-in is off here.')).toBeTruthy())
    expect(screen.queryByRole('button', { name: 'Done' })).toBeNull()
  })

  it('shows why password sign-in could not be disabled', async () => {
    state.disablePassword.mockResolvedValue({ ok: false, error: 'The host is offline.' })
    renderPanel(true)
    fireEvent.click(screen.getByRole('button', { name: 'Disable' }))
    await waitFor(() => expect(screen.getByText('The host is offline.')).toBeTruthy())
  })
})
