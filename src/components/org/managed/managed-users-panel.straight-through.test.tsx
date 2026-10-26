// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('react-native', async () => (await import('@/components/ui/v4/rn-stub')).reactNativeStub)
vi.mock('react-native-svg', async () => (await import('@/components/ui/v4/rn-stub')).svgStub)
vi.mock(
  '@/lib/theme-preference',
  async () => (await import('@/components/ui/v4/rn-stub')).themePreferenceStub
)
vi.mock('@/components/ui/panel-styles', () => ({ panelStyles: {} }))
vi.mock('@/components/ui', () => ({
  Button: ({
    label,
    onPress,
    disabled,
  }: {
    label: string
    onPress?: () => void
    disabled?: boolean
  }) => (
    <button disabled={disabled} onClick={onPress}>
      {label}
    </button>
  ),
  ButtonRow: ({ children }: { children?: unknown }) => <div>{children as never}</div>,
  ConfirmButton: () => null,
  EmptyState: () => null,
  ModalSheet: () => null,
  SectionPanel: ({ children }: { children?: unknown }) => <div>{children as never}</div>,
  SettingRow: ({ label, children }: { label: string; children?: unknown }) => (
    <div>
      <span>{label}</span>
      {children as never}
    </div>
  ),
  TextField: ({
    label,
    value,
    onChangeText,
  }: {
    label: string
    value: string
    onChangeText: (v: string) => void
  }) => <input aria-label={label} value={value} onChange={(e) => onChangeText(e.target.value)} />,
  Toggle: ({
    value,
    onValueChange,
    accessibilityLabel,
  }: {
    value: boolean
    onValueChange: (next: boolean) => void
    accessibilityLabel?: string
  }) => (
    <button
      role="switch"
      aria-checked={value}
      aria-label={accessibilityLabel}
      onClick={() => onValueChange(!value)}
    >
      {value ? 'On' : 'Off'}
    </button>
  ),
}))
vi.mock('@/components/org/managed/secret-reveal', () => ({ SecretReveal: () => null }))
vi.mock('@/components/org/managed/managed-login-limits', () => ({
  LoginLimitBadges: () => null,
  LoginLimitsEditor: () => null,
  LoginLimitsFields: () => null,
}))
vi.mock('@/components/org/managed/managed-login-admin', () => ({
  LoginAdminBadge: () => null,
  LoginAdminEditor: () => null,
  NewLoginAdminField: ({ disabled }: { disabled: boolean }) => (
    <span data-testid="admin-field" data-disabled={String(disabled)} />
  ),
}))
vi.mock('@/components/org/managed/managed-login-job', () => ({
  jobConnectionRole: () => 'read-write',
  LoginJobEditor: () => null,
  NewLoginJobField: () => null,
}))
vi.mock('@/components/org/managed/managed-login-permissions', () => ({
  LoginPermissionsPanel: () => null,
}))
vi.mock('@/components/org/managed/managed-login-mode', () => ({
  LoginModeBadges: () => null,
  LoginModeEditor: () => null,
  NewLoginModeFields: () => null,
}))
vi.mock('@/components/org/principal-name-scheme-field', () => ({
  PrincipalNameSchemeField: () => null,
  usePrincipalNameScheme: () => ({ requestScheme: undefined, reset: vi.fn() }),
}))
vi.mock('@/lib/queries/bindings', () => ({
  useManagedEnvironmentBindings: () => ({ data: { bindings: [] } }),
}))
vi.mock('@/lib/queries/servers', () => ({ useOrgServers: () => ({ data: { servers: [] } }) }))

import { ManagedUsersPanel } from './managed-users-panel'

afterEach(cleanup)

const draw = (
  engine: string,
  options: { busy?: boolean; onCreateDatabase?: (name: string) => Promise<void> } = {}
) => {
  const onCreateUser = vi.fn(async (_input: Record<string, unknown>) => null)
  render(
    <ManagedUsersPanel
      orgId="o1"
      environmentId="e1"
      engine={engine}
      databases={['app']}
      users={[]}
      canManage
      busy={options.busy ?? false}
      onCreateDatabase={options.onCreateDatabase ?? vi.fn(async () => {})}
      onDeleteDatabase={vi.fn()}
      onCreateUser={onCreateUser}
      onDeleteUser={vi.fn()}
      onUpdateUser={vi.fn()}
      onRotateUserPassword={vi.fn(async () => null)}
      onRedeployService={vi.fn()}
      onReload={vi.fn(async () => {})}
    />
  )
  return onCreateUser
}

const create = async (name: string) => {
  fireEvent.change(screen.getByLabelText('Username'), { target: { value: name } })
  fireEvent.click(screen.getByText('Create user'))
}

describe('ManagedUsersPanel straight through', () => {
  it('shows the switch for PostgreSQL and sends only an explicit choice on create', async () => {
    const onCreateUser = draw('postgres')
    expect(screen.getByRole('switch').getAttribute('aria-checked')).toBe('false')
    await create('plain')
    await waitFor(() => expect(onCreateUser).toHaveBeenCalledTimes(1))
    expect(onCreateUser.mock.calls[0]?.[0]).not.toHaveProperty('straightThrough')

    fireEvent.click(screen.getByRole('switch'))
    await create('chosen')
    await waitFor(() => expect(onCreateUser).toHaveBeenCalledTimes(2))
    expect(onCreateUser.mock.calls[1]?.[0]).toMatchObject({
      username: 'chosen',
      straightThrough: true,
    })
  })

  it('has no switch and sends nothing for MySQL', async () => {
    const onCreateUser = draw('mysql')
    expect(screen.queryByRole('switch')).toBeNull()
    await create('plain')
    await waitFor(() => expect(onCreateUser).toHaveBeenCalledTimes(1))
    expect(onCreateUser.mock.calls[0]?.[0]).not.toHaveProperty('straightThrough')
  })
})

describe('ManagedUsersPanel while the last change is still applying', () => {
  it('locks the add forms and says so next to them, with a spinner', () => {
    const onCreateDatabase = vi.fn(async (_name: string) => {})
    draw('postgres', { busy: true, onCreateDatabase })
    expect(screen.getAllByText(/this form unlocks by itself/)).toHaveLength(2)
    expect(screen.getByText(/Editing and deleting unlock by themselves/)).toBeTruthy()
    expect(screen.getAllByRole('progressbar').length).toBeGreaterThan(0)
    expect((screen.getByText('Add database') as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByText('Create user') as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByTestId('admin-field').dataset.disabled).toBe('true')
  })

  it('shows no waiting note when nothing is applying', () => {
    draw('postgres')
    expect(screen.queryByText(/this form unlocks by itself/)).toBeNull()
    expect(screen.queryByRole('progressbar')).toBeNull()
  })
})

describe('ManagedUsersPanel errors next to their button', () => {
  it('says why a database was not added, and keeps the name', async () => {
    const onCreateDatabase = vi.fn(async () => {
      throw new Error('HTTP 409: database_exists')
    })
    draw('postgres', { onCreateDatabase })
    fireEvent.change(screen.getByLabelText('Database name'), { target: { value: 'testing' } })
    fireEvent.click(screen.getByText('Add database'))
    const message = await screen.findByText(/database_exists|already/i)
    expect(message.previousElementSibling?.textContent).toBe('Add database')
    expect((screen.getByLabelText('Database name') as HTMLInputElement).value).toBe('testing')
  })

  it('says a bad database name under the button, not at the top', () => {
    draw('postgres')
    fireEvent.change(screen.getByLabelText('Database name'), { target: { value: '9x' } })
    fireEvent.click(screen.getByText('Add database'))
    const message = screen.getByText('Database name must start with a letter or underscore.')
    expect(message.previousElementSibling?.textContent).toBe('Add database')
  })

  it('says a bad username just above Create user', () => {
    draw('postgres')
    fireEvent.change(screen.getByLabelText('Username'), { target: { value: '9x' } })
    fireEvent.click(screen.getByText('Create user'))
    const message = screen.getByText('Username must start with a letter or underscore.')
    expect(message.nextElementSibling?.textContent).toBe('Create user')
  })

  it('names the space and the "!" in a username, not its first letter', () => {
    draw('postgres')
    fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'ct bad!' } })
    fireEvent.click(screen.getByText('Create user'))
    expect(
      screen.getByText('Username can use only letters, digits and underscores, not spaces or “!”.')
    ).toBeTruthy()
    expect(screen.queryByText('Username must start with a letter or underscore.')).toBeNull()
  })
})
