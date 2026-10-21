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
  SegmentedControl: ({ options, value, onChange, disabled }: { options: { value: string; label: string }[]; value: string; onChange: (v: string) => void; disabled?: boolean }) => (
    <div>
      {options.map((o) => (
        <button key={o.value} disabled={disabled} aria-pressed={o.value === value} onClick={() => onChange(o.value)}>{o.label}</button>
      ))}
    </div>
  ),
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
import { LoginJobEditor, NewLoginJobField, jobPatch, loginJob } from './managed-login-job'

afterEach(cleanup)

const user = (over: Partial<ManagedUserRecord> = {}): ManagedUserRecord => ({
  id: 'u1',
  loginId: 'u1',
  principalId: null,
  username: 'app',
  appliedUsername: 'app',
  databases: ['d1'],
  privileges: ['read-write'],
  connectionRole: 'read-write',
  grantMode: 'recipe',
  createdAt: '2026-10-16T00:00:00Z',
  ...over,
})

describe('login job', () => {
  it('reads the stored job and builds the patch', () => {
    expect(loginJob(user())).toBe('read-write')
    expect(loginJob(user({ privileges: ['owner'] }))).toBe('owner')
    expect(loginJob(user({ privileges: ['read-only'], connectionRole: 'read-only' }))).toBe('read-only')
    expect(loginJob(user({ privileges: ['admin'] }))).toBeNull()
    expect(jobPatch('owner')).toEqual({ privileges: ['owner'], connectionRole: 'read-write' })
    expect(jobPatch('read-only')).toEqual({ privileges: ['read-only'], connectionRole: 'read-only' })
  })

  it('offers the three jobs with plain explanations', () => {
    const onJobChange = vi.fn()
    render(<NewLoginJobField job="read-write" onJobChange={onJobChange} disabled={false} />)
    expect(screen.getByText(/cannot create, change or drop tables/)).toBeTruthy()
    fireEvent.click(screen.getByText('Migration'))
    expect(onJobChange).toHaveBeenCalledWith('owner')
    expect(screen.getByText('Read-only')).toBeTruthy()
  })

  it('previews, then applies a new job', async () => {
    const onUpdate = vi.fn(async (_id: string, body: { dryRun?: boolean }) =>
      body.dryRun ? { ok: true as const, dryRun: true, statements: ['Let app change tables'] } : { ok: true as const }
    )
    render(<LoginJobEditor user={user()} disabled={false} onUpdate={onUpdate} onError={vi.fn()} />)
    fireEvent.click(screen.getByText('Migration'))
    await screen.findByText('Change to Migration?')
    expect(onUpdate).toHaveBeenCalledWith('u1', { privileges: ['owner'], connectionRole: 'read-write', dryRun: true })
    fireEvent.click(screen.getByText('Switch'))
    await waitFor(() => expect(onUpdate).toHaveBeenCalledWith('u1', { privileges: ['owner'], connectionRole: 'read-write' }))
  })

  it('is hidden for admin and manage-myself logins', () => {
    const noop = vi.fn()
    const { container, rerender } = render(<LoginJobEditor user={user({ privileges: ['admin'] })} disabled={false} onUpdate={noop} onError={noop} />)
    expect(container.textContent).toBe('')
    rerender(<LoginJobEditor user={user({ grantMode: 'self' })} disabled={false} onUpdate={noop} onError={noop} />)
    expect(container.textContent).toBe('')
  })
})
