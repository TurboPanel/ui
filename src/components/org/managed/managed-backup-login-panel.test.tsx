// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CONFIRM_GUARD_MS } from '@/components/ui/confirm-button'
import type { ManagedUserRecord } from '@/lib/managed-services'
import {
  BACKUP_LOGIN_HELP,
  BACKUP_LOGIN_LOAD_ERROR,
  describeBackupPlaces,
  ManagedBackupLoginPanel,
  ManagedBackupLoginSection,
  parseBackupPlaces,
} from './managed-backup-login-panel'
import {
  useCreateManagedBackupLogin,
  useDeleteManagedBackupLogin,
  useManagedBackupLogin,
} from '@/lib/queries/managed'

vi.mock('react-native', async () => (await import('@/components/ui/v4/rn-stub')).reactNativeStub)
vi.mock('react-native-svg', async () => (await import('@/components/ui/v4/rn-stub')).svgStub)
vi.mock(
  '@/lib/theme-preference',
  async () => (await import('@/components/ui/v4/rn-stub')).themePreferenceStub
)

vi.mock('@/components/ui/panel-styles', () => ({ panelStyles: {} }))
vi.mock('@/lib/queries/managed', () => ({
  useManagedBackupLogin: vi.fn(),
  useCreateManagedBackupLogin: vi.fn(),
  useDeleteManagedBackupLogin: vi.fn(),
}))
vi.mock('@/components/org/managed/secret-reveal', () => ({
  SecretReveal: ({ username, password }: { username?: string; password: string }) => (
    <div>
      {username}:{password}
    </div>
  ),
}))
vi.mock('@/components/ui/button', () => ({
  Button: ({
    label,
    disabled,
    onPress,
  }: {
    label: string
    disabled?: boolean
    onPress?: () => void
  }) => (
    <button disabled={disabled} onClick={onPress}>
      {label}
    </button>
  ),
}))
vi.mock('@/components/ui', async () => ({
  SectionPanel: ({ title, children }: { title: string; children?: unknown }) => (
    <section>
      <h2>{title}</h2>
      {children as never}
    </section>
  ),
  Button: (await import('@/components/ui/button')).Button,
  // The real two-step confirm: Delete arms it, Confirm delete (after the guard) fires.
  ConfirmButton: (await import('@/components/ui/confirm-button')).ConfirmButton,
  TextField: ({
    label,
    value,
    onChangeText,
  }: {
    label: string
    value: string
    onChangeText: (v: string) => void
  }) => <input aria-label={label} value={value} onChange={(e) => onChangeText(e.target.value)} />,
}))

/** Press Delete, wait out the double-press guard, then press Confirm delete. */
function confirmDelete() {
  fireEvent.click(screen.getByText('Delete'))
  expect(
    screen.getByText('Delete the backup login? Backups that use it stop working.')
  ).toBeTruthy()
  vi.setSystemTime(Date.now() + CONFIRM_GUARD_MS)
  fireEvent.click(screen.getByText('Confirm delete'))
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
})

afterEach(() => {
  vi.useRealTimers()
})

afterEach(cleanup)

const BACKUP: ManagedUserRecord = {
  id: 'b1',
  loginId: 'b1',
  principalId: null,
  username: 'backup',
  appliedUsername: 'backup',
  databases: [],
  privileges: [],
  allowedSources: ['internal', 'address:10.0.0.5'],
} as unknown as ManagedUserRecord

describe('backup login places', () => {
  it('splits, trims and drops empty entries', () => {
    expect(parseBackupPlaces(' internal, address:10.0.0.5 ,, ')).toEqual([
      'internal',
      'address:10.0.0.5',
    ])
    expect(parseBackupPlaces('  ')).toEqual([])
  })

  it('reads anywhere in plain words', () => {
    expect(describeBackupPlaces(['any'])).toBe('Anywhere')
    expect(describeBackupPlaces(undefined)).toBe('Anywhere')
    expect(describeBackupPlaces(['internal'])).toBe('internal')
  })
})

describe('managed backup login panel', () => {
  it('adds the login with its places and shows the password once', async () => {
    const shown = ['pw', '1'].join('-')
    const onCreate = vi.fn().mockResolvedValue({ password: shown, appliedUsername: 'backup' })
    render(
      <ManagedBackupLoginPanel
        login={null}
        canManage
        busy={false}
        onCreate={onCreate}
        onDelete={vi.fn()}
      />
    )
    expect(screen.getByText('Backup Login')).toBeTruthy()
    expect(screen.getByText(BACKUP_LOGIN_HELP)).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Connects From'), {
      target: { value: 'internal, address:10.0.0.5' },
    })
    fireEvent.click(screen.getByText('Add Backup Login'))
    await waitFor(() => expect(screen.getByText(`backup:${shown}`)).toBeTruthy())
    expect(onCreate).toHaveBeenCalledWith({
      allowedSources: ['internal', 'address:10.0.0.5'],
      username: 'backup',
    })
  })

  it('refuses an empty place list without calling the server', async () => {
    const onCreate = vi.fn()
    render(
      <ManagedBackupLoginPanel
        login={null}
        canManage
        busy={false}
        onCreate={onCreate}
        onDelete={vi.fn()}
      />
    )
    fireEvent.change(screen.getByLabelText('Connects From'), { target: { value: ' ' } })
    fireEvent.click(screen.getByText('Add Backup Login'))
    await waitFor(() =>
      expect(
        screen.getByText('Choose at least one place the backup tool connects from.')
      ).toBeTruthy()
    )
    expect(onCreate).not.toHaveBeenCalled()
  })

  it('shows the server refusal in plain words', async () => {
    const onCreate = vi
      .fn()
      .mockRejectedValue(
        new Error('This cluster already has a backup login. Delete it first to make a new one.')
      )
    render(
      <ManagedBackupLoginPanel
        login={null}
        canManage
        busy={false}
        onCreate={onCreate}
        onDelete={vi.fn()}
      />
    )
    fireEvent.click(screen.getByText('Add Backup Login'))
    await waitFor(() =>
      expect(
        screen.getByText(
          'This cluster already has a backup login. Delete it first to make a new one.'
        )
      ).toBeTruthy()
    )
  })

  it('lists the existing login and deletes it', async () => {
    const onDelete = vi.fn().mockResolvedValue(undefined)
    render(
      <ManagedBackupLoginPanel
        login={BACKUP}
        canManage
        busy={false}
        onCreate={vi.fn()}
        onDelete={onDelete}
      />
    )
    expect(screen.getByText('internal, address:10.0.0.5')).toBeTruthy()
    expect(screen.queryByText('Add Backup Login')).toBeNull()
    confirmDelete()
    await waitFor(() => expect(onDelete).toHaveBeenCalledTimes(1))
  })

  it('does not delete when the confirm is backed out', () => {
    const onDelete = vi.fn()
    render(
      <ManagedBackupLoginPanel
        login={BACKUP}
        canManage
        busy={false}
        onCreate={vi.fn()}
        onDelete={onDelete}
      />
    )
    fireEvent.click(screen.getByText('Delete'))
    fireEvent.click(screen.getByText('Cancel'))
    expect(screen.queryByText('Confirm delete')).toBeNull()
    expect(onDelete).not.toHaveBeenCalled()
  })

  it('offers nothing to change without manage rights', () => {
    render(
      <ManagedBackupLoginPanel
        login={null}
        canManage={false}
        busy={false}
        onCreate={vi.fn()}
        onDelete={vi.fn()}
      />
    )
    expect(screen.queryByText('Add Backup Login')).toBeNull()
    expect(screen.getByText('No backup login yet.')).toBeTruthy()
  })
})

describe('managed backup login section', () => {
  function mockHooks(
    login: ManagedUserRecord | null,
    isPending = false,
    query: Record<string, unknown> = { data: { login } }
  ) {
    const run = vi.fn().mockResolvedValue({
      ok: true,
      value: {
        login: BACKUP,
        password: ['pw', '2'].join('-'),
        commandId: 'cmd-1',
        serverId: 'srv-1',
      },
    })
    const mutateAsync = vi.fn().mockResolvedValue({ commandId: 'cmd-2', serverId: 'srv-1' })
    vi.mocked(useManagedBackupLogin).mockReturnValue({
      isPending,
      isError: false,
      ...query,
    } as never)
    vi.mocked(useCreateManagedBackupLogin).mockReturnValue({ run } as never)
    vi.mocked(useDeleteManagedBackupLogin).mockReturnValue({ mutateAsync } as never)
    return { run, mutateAsync }
  }

  it('renders nothing while the login is loading', () => {
    mockHooks(null, true)
    const { container } = render(
      <ManagedBackupLoginSection
        orgId="o"
        environmentId="e"
        canManage
        busy={false}
        registerCommand={vi.fn()}
      />
    )
    expect(container.textContent).toBe('')
  })

  it('hides the panel when the control plane has no backup login route or the viewer cannot manage', () => {
    mockHooks(null, false, { data: null })
    const { container } = render(
      <ManagedBackupLoginSection
        orgId="o"
        environmentId="e"
        canManage
        busy={false}
        registerCommand={vi.fn()}
      />
    )
    expect(container.textContent).toBe('')
    expect(screen.queryByText('Add Backup Login')).toBeNull()
  })

  it('shows a plain error line, not the add form, when the login could not be read', () => {
    mockHooks(null, false, { isError: true, data: undefined })
    render(
      <ManagedBackupLoginSection
        orgId="o"
        environmentId="e"
        canManage
        busy={false}
        registerCommand={vi.fn()}
      />
    )
    expect(screen.getByText(BACKUP_LOGIN_LOAD_ERROR)).toBeTruthy()
    expect(screen.queryByText('Add Backup Login')).toBeNull()
  })

  it('adds the login and tracks the apply', async () => {
    const { run } = mockHooks(null)
    const registerCommand = vi.fn()
    render(
      <ManagedBackupLoginSection
        orgId="o"
        environmentId="e"
        canManage
        busy={false}
        registerCommand={registerCommand}
      />
    )
    fireEvent.click(screen.getByText('Add Backup Login'))
    await waitFor(() =>
      expect(registerCommand).toHaveBeenCalledWith('cmd-1', 'Add backup login', 'srv-1')
    )
    expect(run).toHaveBeenCalledWith({ allowedSources: ['internal'], username: 'backup' })
  })

  it('shows a refused add in plain words', async () => {
    const { run } = mockHooks(null)
    run.mockResolvedValueOnce({ ok: false, error: 'Update the server, then try again.' })
    render(
      <ManagedBackupLoginSection
        orgId="o"
        environmentId="e"
        canManage
        busy={false}
        registerCommand={vi.fn()}
      />
    )
    fireEvent.click(screen.getByText('Add Backup Login'))
    await waitFor(() => expect(screen.getByText('Update the server, then try again.')).toBeTruthy())
  })

  it('deletes the login and tracks the apply', async () => {
    const { mutateAsync } = mockHooks(BACKUP)
    const registerCommand = vi.fn()
    render(
      <ManagedBackupLoginSection
        orgId="o"
        environmentId="e"
        canManage
        busy={false}
        registerCommand={registerCommand}
      />
    )
    confirmDelete()
    await waitFor(() =>
      expect(registerCommand).toHaveBeenCalledWith('cmd-2', 'Delete backup login', 'srv-1')
    )
    expect(mutateAsync).toHaveBeenCalledTimes(1)
  })
})
