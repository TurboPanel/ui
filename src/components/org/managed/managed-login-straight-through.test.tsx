// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
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
  SettingRow: ({
    label,
    description,
    children,
  }: {
    label: string
    description?: string
    children?: unknown
  }) => (
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
    <button
      role="switch"
      aria-checked={value}
      aria-label={accessibilityLabel}
      disabled={disabled}
      onClick={() => onValueChange(!value)}
    >
      {value ? 'On' : 'Off'}
    </button>
  ),
}))

import type { ManagedUserRecord } from '@/lib/managed-services'
import {
  LoginStraightThroughEditor,
  NewLoginStraightThroughField,
  StraightThroughSwitch,
} from './managed-login-straight-through'

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
  allowedSources: ['any'],
  maxConnections: null,
  straightThrough: false,
  straightThroughDefault: true,
  createdAt: '2026-10-16T00:00:00Z',
  ...over,
})

const LABEL = 'Connect straight through (no connection sharing)'
const HELP =
  'One database connection per client session, no connection reuse, no read split. Needed by some drivers, such as the Node postgres driver and drizzle.'
const LIMITED = 'Not available while this login is limited to certain addresses'

describe('StraightThroughSwitch', () => {
  const draw = (over: Partial<Parameters<typeof StraightThroughSwitch>[0]> = {}) => {
    const onChange = vi.fn()
    render(
      <StraightThroughSwitch
        value
        isDefault={false}
        limited={false}
        disabled={false}
        onChange={onChange}
        {...over}
      />
    )
    return onChange
  }

  it('shows the label and help text', () => {
    draw()
    expect(screen.getByText(LABEL)).toBeTruthy()
    expect(screen.getByText(HELP)).toBeTruthy()
    expect(screen.queryByText('default')).toBeNull()
  })

  it('shows a default hint when the value is the default', () => {
    draw({ isDefault: true })
    expect(screen.getByText('default')).toBeTruthy()
  })

  it('is off and disabled with the hint when the login has a source limit', () => {
    const onChange = draw({ limited: true, isDefault: true })
    const toggle = screen.getByRole('switch')
    expect(toggle.getAttribute('aria-checked')).toBe('false')
    expect((toggle as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText(LIMITED)).toBeTruthy()
    expect(screen.queryByText(HELP)).toBeNull()
    expect(screen.queryByText('default')).toBeNull()
    fireEvent.click(toggle)
    expect(onChange).not.toHaveBeenCalled()
  })
})

describe('LoginStraightThroughEditor', () => {
  const setup = (over: Partial<ManagedUserRecord> = {}) => {
    const onUpdate = vi.fn(async (_id: string, body: { dryRun?: boolean }) =>
      body.dryRun
        ? {
            ok: true as const,
            dryRun: true,
            statements: ['Send the connection straight through the front door'],
          }
        : { ok: true as const }
    )
    const onError = vi.fn()
    render(
      <LoginStraightThroughEditor
        engine="postgres"
        user={user(over)}
        disabled={false}
        onUpdate={onUpdate}
        onError={onError}
      />
    )
    return { onUpdate, onError }
  }

  it('shows the default hint and no Use default action while the value is the default', () => {
    setup()
    expect(screen.getByText('default')).toBeTruthy()
    expect(screen.queryByText('Use default')).toBeNull()
  })

  it('shows no default hint when an older control plane omits the field', () => {
    setup({ straightThrough: undefined, straightThroughDefault: undefined })
    expect(screen.queryByText('default')).toBeNull()
  })

  it('previews true with a dry run, shows the statements, then saves', async () => {
    const { onUpdate } = setup()
    fireEvent.click(screen.getByRole('switch'))
    await screen.findByRole('dialog')
    expect(onUpdate).toHaveBeenCalledWith('u1', { straightThrough: true, dryRun: true })
    expect(screen.getByText('• Send the connection straight through the front door')).toBeTruthy()
    fireEvent.click(screen.getByText('Switch'))
    await vi.waitFor(() => expect(onUpdate).toHaveBeenCalledWith('u1', { straightThrough: true }))
  })

  it('sends false when turning an on login off', async () => {
    const { onUpdate } = setup({ straightThrough: true, straightThroughDefault: false })
    fireEvent.click(screen.getByRole('switch'))
    await screen.findByRole('dialog')
    expect(onUpdate).toHaveBeenCalledWith('u1', { straightThrough: false, dryRun: true })
  })

  it('offers Use default once the owner has chosen, and sends null', async () => {
    const { onUpdate } = setup({ straightThrough: false, straightThroughDefault: false })
    expect(screen.queryByText('default')).toBeNull()
    fireEvent.click(screen.getByText('Use default'))
    await screen.findByRole('dialog')
    expect(onUpdate).toHaveBeenCalledWith('u1', { straightThrough: null, dryRun: true })
    fireEvent.click(screen.getByText('Switch'))
    await vi.waitFor(() => expect(onUpdate).toHaveBeenCalledWith('u1', { straightThrough: null }))
  })

  it('is off and disabled for a login with a source limit, with no Use default', () => {
    setup({ allowedSources: ['internal'], straightThrough: false, straightThroughDefault: false })
    const toggle = screen.getByRole('switch') as HTMLButtonElement
    expect(toggle.disabled).toBe(true)
    expect(toggle.getAttribute('aria-checked')).toBe('false')
    expect(screen.getByText(LIMITED)).toBeTruthy()
    expect(screen.queryByText('Use default')).toBeNull()
  })

  it('says the refusal in plain words when the preview is refused', async () => {
    const onError = vi.fn()
    const onUpdate = vi.fn(async () => {
      throw new Error('HTTP 400: straight_through_conflicts_with_source_limit')
    })
    render(
      <LoginStraightThroughEditor
        engine="postgres"
        user={user()}
        disabled={false}
        onUpdate={onUpdate}
        onError={onError}
      />
    )
    fireEvent.click(screen.getByRole('switch'))
    await vi.waitFor(() =>
      expect(onError).toHaveBeenCalledWith(
        'A login that connects straight through cannot be limited to certain addresses. Turn one off.'
      )
    )
  })
})

describe('NewLoginStraightThroughField', () => {
  const draw = (over: Partial<Parameters<typeof NewLoginStraightThroughField>[0]> = {}) =>
    render(
      <NewLoginStraightThroughField
        engine="postgres"
        choice={null}
        privileges={['read-write']}
        limited={false}
        disabled={false}
        onChange={vi.fn()}
        {...over}
      />
    )

  it('is hidden for other engines', () => {
    draw({ engine: 'mysql' })
    expect(screen.queryByText(LABEL)).toBeNull()
  })

  it('starts off for read/write and on for Migration, with the default hint', () => {
    draw()
    expect(screen.getByRole('switch').getAttribute('aria-checked')).toBe('false')
    expect(screen.getByText('default')).toBeTruthy()
    cleanup()
    draw({ privileges: ['owner'] })
    expect(screen.getByRole('switch').getAttribute('aria-checked')).toBe('true')
  })

  it('turns off and disables when a source limit is added', () => {
    draw({ privileges: ['owner'], limited: true })
    const toggle = screen.getByRole('switch') as HTMLButtonElement
    expect(toggle.getAttribute('aria-checked')).toBe('false')
    expect(toggle.disabled).toBe(true)
    expect(screen.getByText(LIMITED)).toBeTruthy()
  })
})
