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
  usePrincipalNameScheme: () => ({ requestScheme: undefined, reset: vi.fn() }),
}))
vi.mock('@/lib/queries/bindings', () => ({
  useManagedEnvironmentBindings: () => ({ data: { bindings: [] } }),
}))
vi.mock('@/lib/queries/servers', () => ({ useOrgServers: () => ({ data: { servers: [] } }) }))

import { ManagedUsersPanel } from './managed-users-panel'

afterEach(cleanup)

const draw = (engine: string) => {
  const onCreateUser = vi.fn(async (_input: Record<string, unknown>) => null)
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
