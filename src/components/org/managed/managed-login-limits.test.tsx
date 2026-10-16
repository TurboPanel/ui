// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('react-native', async () => (await import('@/components/ui/v4/rn-stub')).reactNativeStub)
vi.mock('react-native-svg', async () => (await import('@/components/ui/v4/rn-stub')).svgStub)
vi.mock('@/lib/theme-preference', async () => (await import('@/components/ui/v4/rn-stub')).themePreferenceStub)
vi.mock('@/components/ui/panel-styles', () => ({ panelStyles: {} }))
vi.mock('@/components/ui', () => ({
  Badge: ({ label }: { label: string }) => <span>{label}</span>,
  Button: ({
    label,
    onPress,
    disabled,
    accessibilityLabel,
  }: {
    label: string
    onPress?: () => void
    disabled?: boolean
    accessibilityLabel?: string
  }) => (
    <button disabled={disabled} aria-label={accessibilityLabel ?? label} onClick={onPress}>
      {label}
    </button>
  ),
  ButtonRow: ({ children }: { children?: unknown }) => <div>{children as never}</div>,
  Checkbox: ({
    checked,
    onPress,
    label,
    disabled,
  }: {
    checked: boolean
    onPress: () => void
    label?: string
    disabled?: boolean
  }) => (
    <button role="checkbox" aria-checked={checked} aria-label={label} disabled={disabled} onClick={onPress}>
      {label}
    </button>
  ),
  ModalSheet: ({
    visible,
    title,
    footer,
    children,
  }: {
    visible: boolean
    title: string
    footer?: unknown
    children?: unknown
  }) =>
    visible ? (
      <div role="dialog">
        <h1>{title}</h1>
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
  TextField: ({
    label,
    value,
    onChangeText,
    editable,
  }: {
    label: string
    value: string
    onChangeText: (v: string) => void
    editable?: boolean
  }) => (
    <input aria-label={label} value={value} disabled={editable === false} onChange={(e) => onChangeText(e.target.value)} />
  ),
}))

import { EMPTY_LIMITS_DRAFT, type LoginLimitsDraft } from '@/lib/managed-login-limits'
import type { ManagedUserRecord } from '@/lib/managed-services'
import { LoginLimitBadges, LoginLimitsEditor, LoginLimitsFields } from './managed-login-limits'

afterEach(cleanup)

const servers = [
  { id: 's1', name: 'Web 1', hostname: null },
  { id: 's2', name: 'Web 2', hostname: null },
]

const user = (over: Partial<ManagedUserRecord> = {}): ManagedUserRecord => ({
  id: 'u1',
  username: 'app',
  appliedUsername: 'app',
  databases: ['d1'],
  privileges: [],
  connectionRole: 'read-write',
  grantMode: 'recipe',
  allowedSources: ['any'],
  maxConnections: null,
  createdAt: '2026-10-16T00:00:00Z',
  ...over,
})

describe('LoginLimitBadges', () => {
  it('shows nothing for an unlimited login', () => {
    const { container } = render(<LoginLimitBadges user={user()} />)
    expect(container.textContent).toBe('')
  })

  it('shows limited places and the cap', () => {
    render(<LoginLimitBadges user={user({ allowedSources: ['internal'], maxConnections: 5 })} />)
    expect(screen.getByText('Limited places')).toBeTruthy()
    expect(screen.getByText('Max 5 connections')).toBeTruthy()
  })

  it('shows only the cap when connecting from anywhere', () => {
    render(<LoginLimitBadges user={user({ maxConnections: 9 })} />)
    expect(screen.queryByText('Limited places')).toBeNull()
    expect(screen.getByText('Max 9 connections')).toBeTruthy()
  })
})

function Harness({ initial = EMPTY_LIMITS_DRAFT }: Readonly<{ initial?: LoginLimitsDraft }>) {
  const [draft, setDraft] = useState(initial)
  return (
    <>
      <LoginLimitsFields draft={draft} onChange={setDraft} servers={servers} disabled={false} />
      <output data-testid="draft">{JSON.stringify(draft)}</output>
    </>
  )
}

const drafted = () => JSON.parse(screen.getByTestId('draft').textContent ?? '{}') as LoginLimitsDraft

describe('LoginLimitsFields', () => {
  it('defaults to anywhere and hides the places', () => {
    render(<Harness />)
    expect(screen.getByText('Where can this login connect from?')).toBeTruthy()
    expect(screen.queryByText('This server and its containers')).toBeNull()
    expect(screen.getByLabelText(/^Most connections at once/)).toBeTruthy()
  })

  it('shows places, the blocked-address warning and picks servers', () => {
    render(<Harness />)
    fireEvent.click(screen.getByText('Only from chosen places'))
    expect(screen.getByText(/A blocked address can still connect/)).toBeTruthy()
    expect(screen.getByText(/counts as “this server” only if that server is also picked/)).toBeTruthy()
    fireEvent.click(screen.getByRole('checkbox', { name: 'This server and its containers' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Web 2' }))
    fireEvent.change(screen.getByLabelText('Specific addresses or ranges'), { target: { value: '10.1.%' } })
    fireEvent.change(screen.getByLabelText(/^Most connections at once/), { target: { value: '12' } })
    expect(drafted()).toMatchObject({
      limited: true,
      internal: true,
      serverIds: ['s2'],
      addresses: '10.1.%',
      maxConnections: '12',
    })
    fireEvent.click(screen.getByRole('checkbox', { name: 'Web 2' }))
    expect(drafted().serverIds).toEqual([])
    fireEvent.click(screen.getByText('Anywhere'))
    expect(drafted().limited).toBe(false)
  })

  it('says so when there are no other servers', () => {
    render(
      <LoginLimitsFields
        draft={{ ...EMPTY_LIMITS_DRAFT, limited: true }}
        onChange={vi.fn()}
        servers={[]}
        disabled={false}
      />,
    )
    expect(screen.getByText('No servers to pick.')).toBeTruthy()
  })
})

describe('LoginLimitsEditor', () => {
  const setup = (over: Partial<ManagedUserRecord> = {}, onUpdate = vi.fn()) => {
    const onError = vi.fn()
    render(<LoginLimitsEditor user={user(over)} servers={servers} disabled={false} onUpdate={onUpdate} onError={onError} />)
    return { onUpdate, onError }
  }

  it('summarises the current limits in plain words', () => {
    setup({ allowedSources: ['internal', 'server:s1'], maxConnections: 3 })
    expect(
      screen.getByText('Limited to: this server and its containers, the server Web 1. At most 3 connections at once.'),
    ).toBeTruthy()
  })

  it('previews with a dry run, then saves the same change', async () => {
    const onUpdate = vi.fn(async (_id: string, body: { dryRun?: boolean }) =>
      body.dryRun ? { ok: true as const, dryRun: true, statements: ['Limit this login to: server s1'] } : { ok: true as const },
    )
    setup({}, onUpdate)
    fireEvent.click(screen.getByText('Change where it connects from'))
    fireEvent.click(screen.getByText('Only from chosen places'))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Web 1' }))
    fireEvent.change(screen.getByLabelText(/^Most connections at once/), { target: { value: '4' } })
    fireEvent.click(screen.getByText('Review change'))
    await screen.findByRole('dialog')
    expect(onUpdate).toHaveBeenCalledWith('u1', { allowedSources: ['server:s1'], maxConnections: 4, dryRun: true })
    expect(screen.getByText('Limited to: the server Web 1.')).toBeTruthy()
    expect(screen.getByText('At most 4 connections at once.')).toBeTruthy()
    expect(within(screen.getByRole('dialog')).getByText(/Every query it sends is then refused/)).toBeTruthy()
    expect(screen.getByText('• Limit this login to: server s1')).toBeTruthy()
    fireEvent.click(screen.getByText('Save change'))
    await waitFor(() =>
      expect(onUpdate).toHaveBeenLastCalledWith('u1', { allowedSources: ['server:s1'], maxConnections: 4 }),
    )
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(screen.queryByText('Review change')).toBeNull()
  })

  it('clears a limit by sending nulls, without the blocked-address warning', async () => {
    const onUpdate = vi.fn(async () => ({ ok: true as const, dryRun: true, statements: [] }))
    setup({ allowedSources: ['internal'], maxConnections: 2 }, onUpdate)
    fireEvent.click(screen.getByText('Change where it connects from'))
    fireEvent.click(screen.getByText('Anywhere'))
    fireEvent.change(screen.getByLabelText(/^Most connections at once/), { target: { value: '' } })
    fireEvent.click(screen.getByText('Review change'))
    await screen.findByRole('dialog')
    expect(onUpdate).toHaveBeenCalledWith('u1', { allowedSources: null, maxConnections: null, dryRun: true })
    expect(screen.getByText('Can connect from anywhere.', { selector: 'span, div, p' })).toBeTruthy()
    expect(screen.queryByText(/A blocked address can still connect/)).toBeNull()
  })

  it('stops on plain validation problems without calling the server', () => {
    const { onUpdate } = setup()
    fireEvent.click(screen.getByText('Change where it connects from'))
    fireEvent.click(screen.getByText('Review change'))
    expect(screen.getByText('Nothing has changed.')).toBeTruthy()
    fireEvent.click(screen.getByText('Only from chosen places'))
    fireEvent.click(screen.getByText('Review change'))
    expect(screen.getByText(/at least one place/)).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Specific addresses or ranges'), { target: { value: '10.0.0.0/20' } })
    fireEvent.click(screen.getByText('Review change'))
    expect(screen.getByText(/can't be matched exactly/)).toBeTruthy()
    expect(onUpdate).not.toHaveBeenCalled()
  })

  it('shows the control plane refusal and can be cancelled', async () => {
    const onUpdate = vi.fn(async () => {
      throw new Error('HTTP 409: managed_login_limits_need_daemon_update')
    })
    setup({}, onUpdate)
    fireEvent.click(screen.getByText('Change where it connects from'))
    fireEvent.change(screen.getByLabelText(/^Most connections at once/), { target: { value: '5' } })
    fireEvent.click(screen.getByText('Review change'))
    await screen.findByText(/needs updating before it can limit/)
    fireEvent.click(screen.getByText('Cancel'))
    expect(screen.getByText('Change where it connects from')).toBeTruthy()
  })

  it('reports a failed save and closes the sheet', async () => {
    const onUpdate = vi.fn(async (_id: string, body: { dryRun?: boolean }) => {
      if (body.dryRun) return { ok: true as const, dryRun: true, statements: [] }
      throw new Error('HTTP 400: managed_login_sources_empty')
    })
    setup({}, onUpdate)
    fireEvent.click(screen.getByText('Change where it connects from'))
    fireEvent.change(screen.getByLabelText(/^Most connections at once/), { target: { value: '5' } })
    fireEvent.click(screen.getByText('Review change'))
    await screen.findByRole('dialog')
    fireEvent.click(screen.getByText('Save change'))
    await screen.findByText(/at least one place/)
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
