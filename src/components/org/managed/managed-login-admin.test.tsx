// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('react-native', async () => (await import('@/components/ui/v4/rn-stub')).reactNativeStub)
vi.mock('react-native-svg', async () => (await import('@/components/ui/v4/rn-stub')).svgStub)
vi.mock('@/lib/theme-preference', async () => (await import('@/components/ui/v4/rn-stub')).themePreferenceStub)
vi.mock('@/components/ui/panel-styles', () => ({ panelStyles: {} }))
vi.mock('@/components/ui', () => ({
  Badge: ({ label }: { label: string }) => <span>{label}</span>,
  Button: ({ label, onPress, disabled }: { label: string; onPress?: () => void; disabled?: boolean }) => (
    <button disabled={disabled} onClick={onPress}>{label}</button>
  ),
  ButtonRow: ({ children }: { children?: unknown }) => <div>{children as never}</div>,
  ModalSheet: ({ visible, title, children, footer }: { visible: boolean; title: string; children?: unknown; footer?: unknown }) =>
    visible ? (
      <div role="dialog">
        <h1>{title}</h1>
        {children as never}
        {footer as never}
      </div>
    ) : null,
  SettingRow: ({ label, description, children }: { label: string; description?: string; children?: unknown }) => (
    <div>
      <span>{label}</span>
      <span>{description}</span>
      {children as never}
    </div>
  ),
  Toggle: ({ value, disabled, onValueChange, accessibilityLabel }: { value: boolean; disabled?: boolean; onValueChange: (n: boolean) => void; accessibilityLabel?: string }) => (
    <button role="switch" aria-label={accessibilityLabel} aria-checked={value} disabled={disabled} onClick={() => onValueChange(!value)}>
      {value ? 'Yes' : 'No'}
    </button>
  ),
}))

import type { ManagedUserRecord } from '@/lib/managed-services'
import {
  ADMIN_HINT,
  LoginAdminBadge,
  LoginAdminEditor,
  NewLoginAdminField,
  adminPatch,
  isAdminLogin,
} from './managed-login-admin'

afterEach(cleanup)

const user = (over: Partial<ManagedUserRecord> = {}): ManagedUserRecord => ({
  id: 'u1',
  username: 'app',
  appliedUsername: 'app',
  databases: ['d1'],
  privileges: ['read-write'],
  connectionRole: 'read-write',
  grantMode: 'recipe',
  createdAt: '2026-10-16T00:00:00Z',
  ...over,
})

describe('Database admin login', () => {
  it('explains itself in one line and reports the switch', () => {
    const onAdminChange = vi.fn()
    render(<NewLoginAdminField admin={false} onAdminChange={onAdminChange} disabled={false} />)
    expect(screen.getByText(ADMIN_HINT)).toBeTruthy()
    fireEvent.click(screen.getByRole('switch'))
    expect(onAdminChange).toHaveBeenCalledWith(true)
  })

  it('badges only admin logins', () => {
    expect(isAdminLogin(user())).toBe(false)
    render(<LoginAdminBadge user={user({ privileges: ['admin'] })} />)
    expect(screen.getByText('Database admin')).toBeTruthy()
  })

  it('builds the patch: admin alone, forced read/write; off goes back to read-write', () => {
    expect(adminPatch(user({ connectionRole: 'read-only' }), true)).toEqual({
      privileges: ['admin'],
      connectionRole: 'read-write',
    })
    expect(adminPatch(user(), true)).toEqual({ privileges: ['admin'] })
    expect(adminPatch(user({ privileges: ['admin'] }), false)).toEqual({ privileges: ['read-write'] })
  })

  it('previews, then applies', async () => {
    const onUpdate = vi.fn(async (_id: string, body: { dryRun?: boolean }) =>
      body.dryRun ? { ok: true as const, dryRun: true, statements: ['Give app access management'] } : { ok: true as const }
    )
    render(<LoginAdminEditor user={user()} disabled={false} onUpdate={onUpdate} onError={vi.fn()} />)
    fireEvent.click(screen.getByRole('switch'))
    await screen.findByText('Make this a Database admin login?')
    expect(onUpdate).toHaveBeenCalledWith('u1', { privileges: ['admin'], dryRun: true })
    fireEvent.click(screen.getByText('Switch'))
    await waitFor(() => expect(onUpdate).toHaveBeenCalledWith('u1', { privileges: ['admin'] }))
  })

  it('shows a refusal in plain words and is disabled for manage-myself logins', async () => {
    const onError = vi.fn()
    const onUpdate = vi.fn(async () => {
      throw new Error('HTTP 422: managed_admin_needs_owner_role')
    })
    const { unmount } = render(<LoginAdminEditor user={user()} disabled={false} onUpdate={onUpdate} onError={onError} />)
    fireEvent.click(screen.getByRole('switch'))
    await waitFor(() => expect(onError).toHaveBeenLastCalledWith(expect.stringMatching(/cannot be made on some of these databases/)))
    unmount()
    render(<LoginAdminEditor user={user({ grantMode: 'self' })} disabled={false} onUpdate={onUpdate} onError={onError} />)
    expect((screen.getByRole('switch') as HTMLButtonElement).disabled).toBe(true)
  })
})
