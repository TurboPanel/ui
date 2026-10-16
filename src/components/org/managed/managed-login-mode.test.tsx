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
    <button disabled={disabled} onClick={onPress}>
      {label}
    </button>
  ),
  ButtonRow: ({ children }: { children?: unknown }) => <div>{children as never}</div>,
  ModalSheet: ({
    visible,
    title,
    description,
    footer,
    children,
  }: {
    visible: boolean
    title: string
    description?: string
    footer?: unknown
    children?: unknown
  }) =>
    visible ? (
      <div role="dialog">
        <h1>{title}</h1>
        <p>{description}</p>
        {children as never}
        {footer as never}
      </div>
    ) : null,
  SegmentedControl: ({
    options,
    value,
    onChange,
    disabled,
  }: {
    options: { value: string; label: string }[]
    value: string
    onChange: (v: string) => void
    disabled?: boolean
  }) => (
    <div>
      {options.map((o) => (
        <button key={o.value} disabled={disabled} aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
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
  Toggle: ({
    value,
    disabled,
    onValueChange,
    accessibilityLabel,
  }: {
    value: boolean
    disabled?: boolean
    onValueChange: (next: boolean) => void
    accessibilityLabel?: string
  }) => (
    <button role="switch" aria-label={accessibilityLabel} aria-checked={value} disabled={disabled} onClick={() => onValueChange(!value)}>
      {value ? 'Yes' : 'No'}
    </button>
  ),
}))

import type { ManagedUserRecord } from '@/lib/managed-services'
import {
  LoginModeBadges,
  LoginModeEditor,
  NewLoginModeFields,
  loginMode,
  modeBadgeLabel,
} from './managed-login-mode'

afterEach(cleanup)

const user = (over: Partial<ManagedUserRecord> = {}): ManagedUserRecord => ({
  id: 'u1',
  username: 'app',
  appliedUsername: 'app',
  databases: ['d1'],
  privileges: [],
  connectionRole: 'read-write',
  grantMode: 'recipe',
  tool: false,
  createdAt: '2026-10-16T00:00:00Z',
  ...over,
})

describe('login mode helpers', () => {
  it('treats old preset logins as panel-managed', () => {
    expect(loginMode({ grantMode: 'preset' })).toBe('recipe')
    expect(loginMode({})).toBe('recipe')
    expect(loginMode({ grantMode: 'self' })).toBe('self')
    expect(modeBadgeLabel('self')).toBe('You manage permissions')
    expect(modeBadgeLabel(undefined)).toBe('Panel manages permissions')
  })

  it('shows mode and tool badges', () => {
    render(<LoginModeBadges user={user({ grantMode: 'self', tool: true })} />)
    expect(screen.getByText('You manage permissions')).toBeTruthy()
    expect(screen.getByText('Database tool')).toBeTruthy()
  })
})

describe('NewLoginModeFields', () => {
  it('reports mode and tool changes with plain explanations', () => {
    const onModeChange = vi.fn()
    const onToolChange = vi.fn()
    render(
      <NewLoginModeFields mode="recipe" onModeChange={onModeChange} tool={false} onToolChange={onToolChange} disabled={false} />,
    )
    expect(screen.getByText(/puts them back/)).toBeTruthy()
    fireEvent.click(screen.getByText('Manage permissions myself'))
    expect(onModeChange).toHaveBeenCalledWith('self')
    fireEvent.click(screen.getByRole('switch'))
    expect(onToolChange).toHaveBeenCalledWith(true)
  })
})

describe('LoginModeEditor', () => {
  it('previews first, then applies the switch', async () => {
    const onUpdate = vi.fn(async (_id: string, body: { dryRun?: boolean }) =>
      body.dryRun ? { ok: true as const, dryRun: true, statements: ['Stop managing grants'] } : { ok: true as const },
    )
    render(<LoginModeEditor user={user()} disabled={false} onUpdate={onUpdate} onError={vi.fn()} />)
    fireEvent.click(screen.getAllByText('Manage permissions myself')[0]!)
    await screen.findByRole('dialog')
    expect(onUpdate).toHaveBeenCalledWith('u1', { grantMode: 'self', dryRun: true })
    expect(screen.getByText('• Stop managing grants')).toBeTruthy()
    fireEvent.click(screen.getByText('Switch'))
    await waitFor(() => expect(onUpdate).toHaveBeenLastCalledWith('u1', { grantMode: 'self' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('asks for a reset confirmation when the server requires one', async () => {
    const onUpdate = vi.fn(async (_id: string, body: { dryRun?: boolean; confirmReset?: boolean }) => {
      if (!body.confirmReset) throw new Error('HTTP 409: managed_grant_reset_needs_confirm')
      return body.dryRun ? { ok: true as const, dryRun: true, statements: [] } : { ok: true as const }
    })
    render(
      <LoginModeEditor
        user={user({ connectionRole: 'read-only' })}
        disabled={false}
        onUpdate={onUpdate}
        onError={vi.fn()}
      />,
    )
    fireEvent.click(screen.getAllByText('Manage permissions myself')[0]!)
    await screen.findByRole('dialog')
    expect(screen.getByText(/read-only setting stays in place until you reset it by hand/)).toBeTruthy()
    fireEvent.click(screen.getByText('Confirm and switch'))
    await waitFor(() =>
      expect(onUpdate).toHaveBeenLastCalledWith('u1', { grantMode: 'self', confirmReset: true }),
    )
  })

  it('warns that returning to panel-managed replaces own permissions', async () => {
    const onUpdate = vi.fn(async (_id: string, body: { confirmReset?: boolean }) => {
      if (!body.confirmReset) throw new Error('HTTP 409: managed_grant_reset_needs_confirm')
      return { ok: true as const, dryRun: true, statements: ['Reset grants'] }
    })
    render(<LoginModeEditor user={user({ grantMode: 'self' })} disabled={false} onUpdate={onUpdate} onError={vi.fn()} />)
    fireEvent.click(screen.getAllByText('Let the panel manage permissions')[0]!)
    await screen.findByRole('dialog')
    expect(screen.getByText(/Anything you set yourself in your own tools is replaced/)).toBeTruthy()
  })

  it('reports errors and toggles the tool flag', async () => {
    const onError = vi.fn()
    const onUpdate = vi.fn(async () => ({ ok: true as const }))
    const { rerender } = render(<LoginModeEditor user={user()} disabled={false} onUpdate={onUpdate} onError={onError} />)
    fireEvent.click(screen.getByRole('switch'))
    await waitFor(() => expect(onUpdate).toHaveBeenCalledWith('u1', { tool: true }))
    const failing = vi.fn(async () => {
      throw new Error('HTTP 422: managed_login_not_editable')
    })
    rerender(<LoginModeEditor user={user()} disabled={false} onUpdate={failing} onError={onError} />)
    fireEvent.click(screen.getByRole('switch'))
    await waitFor(() => expect(onError).toHaveBeenCalledWith(expect.stringContaining('cannot be changed')))
  })
})
