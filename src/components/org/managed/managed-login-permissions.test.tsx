// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('react-native', async () => (await import('@/components/ui/v4/rn-stub')).reactNativeStub)
vi.mock('react-native-svg', async () => (await import('@/components/ui/v4/rn-stub')).svgStub)
vi.mock('@/lib/theme-preference', async () => (await import('@/components/ui/v4/rn-stub')).themePreferenceStub)
vi.mock('@/components/ui/panel-styles', () => ({ panelStyles: {} }))
vi.mock('@/lib/queries/managed', () => ({
  useManagedEffectivePermissions: vi.fn(),
  useManagedPrivilegeCatalogue: vi.fn(() => ({ data: undefined })),
}))
vi.mock('@/components/ui', () => ({
  Badge: ({ label }: { label: string }) => <span>{label}</span>,
  Button: ({ label, onPress }: { label: string; onPress?: () => void }) => <button onClick={onPress}>{label}</button>,
  ButtonRow: ({ children }: { children?: unknown }) => <div>{children as never}</div>,
  InlineNotice: ({ title, body }: { title: string; body?: string }) => (
    <div role="note">
      {title} {body}
    </div>
  ),
  LoadingState: ({ label }: { label?: string }) => <div role="progressbar">{label}</div>,
}))

import type { ManagedEffectivePermissions } from '@/lib/managed-services'
import { useManagedEffectivePermissions } from '@/lib/queries/managed'
import { LoginPermissionsPanel, LoginPermissionsView } from './managed-login-permissions'

afterEach(cleanup)

const priv = (label: string, over = {}) => ({
  keyword: label.toUpperCase(),
  catalogueId: null,
  label,
  explanation: '',
  allowed: 'yes' as const,
  grantable: false,
  ...over,
})
const view = (over: Partial<ManagedEffectivePermissions> = {}): ManagedEffectivePermissions => ({
  username: 'u1',
  exists: true,
  engine: 'postgres',
  series: '18',
  observedAt: '2026-10-16T00:00:00Z',
  attributes: [],
  accounts: [],
  memberships: [],
  grants: [],
  defaults: [],
  truncated: false,
  outsidePolicyCount: 0,
  ...over,
})

describe('LoginPermissionsView', () => {
  it('shows grants by level, everyone rows, patterns, roles and hides defaults until asked', () => {
    render(
      <LoginPermissionsView
        view={view({
          grants: [
            { level: 'table', database: 'd1', schema: 'public', object: 't1', privileges: [priv('Read rows')], origin: 'observed' },
            { level: 'column', database: 'd1', object: 't1', columns: ['a'], privileges: [priv('Read column')], origin: 'observed' },
            { level: 'table', database: 'd1', schema: 'public', object: 't2', via: 'PUBLIC', viaLabel: 'everyone', privileges: [priv('Look up')], origin: 'observed' },
            { level: 'database', database: 'shop_%', pattern: true, privileges: [priv('Connect')], origin: 'observed' },
          ],
          memberships: [{ role: 'r1', kind: 'other', allowed: 'unknown', origin: 'observed' }],
          defaults: [{ database: 'd1', creator: 'c1', appliesTo: 'New tables', objectType: 'r', privileges: [priv('Read rows')], origin: 'observed' }],
          databasesFailed: ['d9'],
          truncated: true,
        })}
      />
    )
    expect(screen.getByText('Schemas and tables')).toBeTruthy()
    expect(screen.getByText('Columns')).toBeTruthy()
    expect(screen.getByText('public.t1')).toBeTruthy()
    expect(screen.getByText('Given to everyone')).toBeTruthy()
    expect(screen.getByText('Everyone')).toBeTruthy()
    expect(screen.getByText('Pattern')).toBeTruthy()
    expect(screen.getByText('r1')).toBeTruthy()
    expect(screen.getByText(/Some databases could not be read/)).toBeTruthy()
    expect(screen.getByText(/The list was cut short/)).toBeTruthy()
    expect(screen.queryByText('New tables in d1')).toBeNull()
    fireEvent.click(screen.getByText('Show advanced'))
    expect(screen.getByText('New tables in d1')).toBeTruthy()
  })

  it('says so when a login has nothing', () => {
    render(<LoginPermissionsView view={view()} />)
    expect(screen.getByText(/no permissions on any database/)).toBeTruthy()
  })
})

describe('LoginPermissionsPanel', () => {
  const mock = vi.mocked(useManagedEffectivePermissions)
  const base = { refetch: vi.fn(), isFetching: false, isError: false, data: undefined, error: null }

  it('loads only when opened and shows a plain-words error', () => {
    mock.mockReturnValue({ ...base, isError: true, error: new Error('HTTP 409: daemon_update_required') } as never)
    render(<LoginPermissionsPanel orgId="o1" environmentId="e1" principalId="p1" username="u1" />)
    expect(mock).toHaveBeenLastCalledWith('o1', 'e1', 'p1', { enabled: false })
    expect(screen.queryByText(/newer TurboPanel/)).toBeNull()
    fireEvent.click(screen.getByText('What can this login do?'))
    expect(mock).toHaveBeenLastCalledWith('o1', 'e1', 'p1', { enabled: true })
    expect(screen.getByText(/newer TurboPanel/)).toBeTruthy()
  })

  it('shows loading', () => {
    mock.mockReturnValue({ ...base, isFetching: true } as never)
    render(<LoginPermissionsPanel orgId="o1" environmentId="e1" principalId="p1" username="u1" />)
    fireEvent.click(screen.getByText('What can this login do?'))
    expect(screen.getByRole('progressbar')).toBeTruthy()
  })
})
