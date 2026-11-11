// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ManagedUsersPanel } from './managed-users-panel'

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
  TypeNameDeleteButton: () => null,
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

afterEach(cleanup)

const user = (id: string, username: string) =>
  ({
    id,
    loginId: id,
    username,
    appliedUsername: username,
    databases: ['app'],
    privileges: ['read-only'],
    connectionRole: 'read-only',
  }) as never

function draw(adminToolLoginIds?: ReadonlySet<string>) {
  render(
    <ManagedUsersPanel
      orgId="o1"
      environmentId="e1"
      engine="mysql"
      databases={['app']}
      users={[user('l-tool', 'adminer_k3x9q2'), user('l-plain', 'reader')]}
      canManage
      busy={false}
      onCreateDatabase={vi.fn()}
      onDeleteDatabase={vi.fn()}
      onCreateUser={vi.fn()}
      onDeleteUser={vi.fn()}
      onUpdateUser={vi.fn()}
      onRotateUserPassword={vi.fn(async () => null)}
      onRedeployService={vi.fn()}
      onReload={vi.fn(async () => {})}
      adminToolLoginIds={adminToolLoginIds}
    />
  )
}

describe('ManagedUsersPanel admin tool logins', () => {
  it('badges a tool login and points its reset to the tool card', () => {
    draw(new Set(['l-tool']))
    expect(screen.getAllByText('Used by Admin Tool')).toHaveLength(1)
    expect(screen.getAllByText('Rotate password')).toHaveLength(1)
    expect(screen.getByText(/Reset this password from the tool in Admin Tools/)).toBeTruthy()
  })

  it('leaves every login as it was when no tool uses one', () => {
    draw()
    expect(screen.queryByText('Used by Admin Tool')).toBeNull()
    expect(screen.getAllByText('Rotate password')).toHaveLength(2)
  })
})
