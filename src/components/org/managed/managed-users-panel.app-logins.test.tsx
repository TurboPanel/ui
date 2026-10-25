// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const scheme = vi.hoisted(() => ({
  locked: false,
  orgScheme: 'partial',
  requestScheme: undefined as string | undefined,
  calls: [] as unknown[][],
}))

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
  CopyButton: ({
    label,
    value,
    accessibilityLabel,
  }: {
    label: string
    value: string
    accessibilityLabel?: string
  }) => (
    <button data-copy={value} aria-label={accessibilityLabel ?? label}>
      {label}
    </button>
  ),
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
  NewLoginAdminField: () => null,
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
  usePrincipalNameScheme: (...args: unknown[]) => {
    scheme.calls.push(args)
    return {
      locked: scheme.locked,
      orgScheme: scheme.orgScheme,
      requestScheme: scheme.requestScheme,
      reset: vi.fn(),
    }
  },
}))
vi.mock('@/lib/queries/bindings', () => ({
  useManagedEnvironmentBindings: () => ({ data: { bindings: [] } }),
}))
vi.mock('@/lib/queries/servers', () => ({ useOrgServers: () => ({ data: { servers: [] } }) }))

import { forgetSessionChoices } from '@/lib/session-choices'
import { ManagedUsersPanel } from './managed-users-panel'

afterEach(() => {
  cleanup()
  forgetSessionChoices()
  scheme.locked = false
  scheme.orgScheme = 'partial'
  scheme.requestScheme = undefined
  scheme.calls = []
})

const appLogin = (appliedUsername: string, password: string) => ({
  user: { id: appliedUsername, appliedUsername },
  password,
})

const draw = (
  engine: string,
  onCreateAppLogins?: (databaseName: string, body: Record<string, unknown>) => Promise<unknown>
) => {
  const onCreateUser = vi.fn(async (_input: Record<string, unknown>) => null)
  const onReload = vi.fn(async () => {})
  render(
    <ManagedUsersPanel
      orgId="o1"
      environmentId="e1"
      engine={engine}
      databases={['app']}
      users={[]}
      canManage
      busy={false}
      onCreateDatabase={vi.fn()}
      onDeleteDatabase={vi.fn()}
      onCreateUser={onCreateUser}
      onDeleteUser={vi.fn()}
      onUpdateUser={vi.fn()}
      onRotateUserPassword={vi.fn(async () => null)}
      onRedeployService={vi.fn()}
      onReload={onReload}
      onCreateAppLogins={onCreateAppLogins as never}
    />
  )
  return { onCreateUser, onReload }
}

describe('ManagedUsersPanel app logins', () => {
  it('adds the three logins in one step and shows one password list', async () => {
    const onCreateAppLogins = vi.fn(async () => ({
      logins: [
        appLogin('shop_migrate', 'p-migrate'),
        appLogin('shop_rw', 'p-rw'),
        appLogin('shop_ro', 'p-ro'),
        { user: null, password: 'p-lost' },
      ],
      notes: [
        'These databases have no owner role yet. Move a database onto an owner role (POST …/managed/databases/{name}/owner-role with confirm: true).',
      ],
    }))
    const { onReload } = draw('postgres', onCreateAppLogins)

    fireEvent.click(screen.getByText('Add app logins'))
    expect(screen.getByText('app_migrate')).toBeTruthy()
    // Straight through starts on for app logins (the usual drivers need it).
    expect(screen.getAllByRole('switch')[0]?.getAttribute('aria-checked')).toBe('true')
    fireEvent.change(screen.getByLabelText('Name prefix'), { target: { value: 'shop' } })
    expect(screen.getByText('shop_rw')).toBeTruthy()
    fireEvent.click(screen.getByText('Add 3 logins'))

    await screen.findByText('p-migrate')
    expect(onCreateAppLogins).toHaveBeenCalledWith('app', { prefix: 'shop', straightThrough: true })
    expect(onReload).toHaveBeenCalled()
    expect(screen.getByText('p-rw')).toBeTruthy()
    expect(screen.getByText('p-ro')).toBeTruthy()
    expect(screen.queryByText('p-lost')).toBeNull()
    expect(screen.getByText(/^This database has no owner role yet/)).toBeTruthy()
    expect(screen.queryByText(/owner-role with confirm/)).toBeNull()
    expect(screen.getByLabelText('Copy the password of shop_rw').getAttribute('data-copy')).toBe(
      'p-rw'
    )
    expect(screen.getByText('Copy all').getAttribute('data-copy')).toBe(
      'shop_migrate: p-migrate\nshop_rw: p-rw\nshop_ro: p-ro'
    )

    fireEvent.click(screen.getByText('Done'))
    expect(screen.queryByText('p-migrate')).toBeNull()
    expect(screen.getByText('Add app logins')).toBeTruthy()
  })

  it('keeps the form and says why when the request is refused, and checks the prefix first', async () => {
    const onCreateAppLogins = vi.fn(async () => {
      throw new Error(
        'POST failed: HTTP 409: username_in_use — The login name app_rw is already taken.'
      )
    })
    draw('postgres', onCreateAppLogins)
    fireEvent.click(screen.getByText('Add app logins'))

    fireEvent.change(screen.getByLabelText('Name prefix'), { target: { value: '1bad' } })
    fireEvent.click(screen.getByText('Add 3 logins'))
    expect(await screen.findByText(/must start with a letter/)).toBeTruthy()
    expect(onCreateAppLogins).not.toHaveBeenCalled()

    fireEvent.change(screen.getByLabelText('Name prefix'), { target: { value: '' } })
    fireEvent.click(screen.getByText('Add 3 logins'))
    expect(await screen.findByText('The login name app_rw is already taken.')).toBeTruthy()
    expect(onCreateAppLogins).toHaveBeenCalledWith('app', { straightThrough: true })
    expect(screen.getByLabelText('Name prefix')).toBeTruthy()

    fireEvent.click(screen.getByText('Cancel'))
    expect(screen.queryByLabelText('Name prefix')).toBeNull()
  })

  it('on MySQL has no straight-through switch and says how the owner maps', async () => {
    const onCreateAppLogins = vi.fn(async () => ({ logins: [] }))
    draw('mysql', onCreateAppLogins)
    fireEvent.click(screen.getByText('Add app logins'))
    expect(screen.queryByRole('switch')).toBeNull()
    expect(screen.getByText(/MySQL and MariaDB have no database owner/)).toBeTruthy()
    fireEvent.click(screen.getByText('Add 3 logins'))
    await waitFor(() => expect(onCreateAppLogins).toHaveBeenCalledWith('app', {}))
  })

  it('is unavailable while the organization locks another name scheme', () => {
    scheme.locked = true
    draw('postgres', vi.fn())
    expect((screen.getByText('Add app logins') as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText(/requires a name scheme other than Plain/)).toBeTruthy()
  })

  it('has no action when the screen does not offer it', () => {
    draw('postgres')
    expect(screen.queryByText('Add app logins')).toBeNull()
  })
})

describe('ManagedUsersPanel single-login form memory', () => {
  it('keeps the last choices for the next login and the next visit in this session', async () => {
    scheme.requestScheme = 'plain'
    const first = draw('postgres')
    fireEvent.click(screen.getByRole('switch'))
    fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'one' } })
    fireEvent.click(screen.getByText('Create user'))
    await waitFor(() => expect(first.onCreateUser).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(screen.getByLabelText('Username')).toHaveProperty('value', ''))
    // The switch did not reset.
    expect(screen.getByRole('switch').getAttribute('aria-checked')).toBe('true')

    cleanup()
    scheme.calls = []
    const second = draw('postgres')
    expect(scheme.calls[0]).toEqual(['o1', 'plain'])
    expect(screen.getByRole('switch').getAttribute('aria-checked')).toBe('true')
    fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'two' } })
    fireEvent.click(screen.getByText('Create user'))
    await waitFor(() => expect(second.onCreateUser).toHaveBeenCalledTimes(1))
    expect(second.onCreateUser.mock.calls[0]?.[0]).toMatchObject({
      username: 'two',
      straightThrough: true,
      nameScheme: 'plain',
    })
  })
})
