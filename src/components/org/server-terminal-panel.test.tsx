// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ServerDetailRecord } from '@/lib/instance-api'
import { ServerTerminalPanel } from './server-terminal-panel'

const state = vi.hoisted(() => ({ mutate: vi.fn(), isPending: false }))

vi.mock('react-native', async () => (await import('@/components/ui/v4/rn-stub')).reactNativeStub)
vi.mock('react-native-svg', async () => (await import('@/components/ui/v4/rn-stub')).svgStub)
vi.mock(
  '@/lib/theme-preference',
  async () => (await import('@/components/ui/v4/rn-stub')).themePreferenceStub
)
vi.mock('@/components/ui/panel-styles', () => ({ panelStyles: { muted: {}, error: {} } }))
vi.mock('@/lib/queries/terminal', () => ({
  useSetServerTerminal: () => ({ mutate: state.mutate, isPending: state.isPending }),
}))
vi.mock('@/lib/user-error', () => ({
  userErrorMessage: (_e: unknown, fallback: string) => fallback,
}))
vi.mock('@/components/ui', () => ({
  SectionPanel: ({
    title,
    hint,
    children,
  }: {
    title?: string
    hint?: string
    children?: unknown
  }) => (
    <section>
      <h2>{title}</h2>
      <p>{hint}</p>
      {children as never}
    </section>
  ),
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
    onValueChange: () => void
    accessibilityLabel: string
  }) => (
    <button
      aria-label={accessibilityLabel}
      aria-pressed={value}
      disabled={disabled}
      onClick={onValueChange}
    >
      toggle
    </button>
  ),
}))

beforeEach(() => {
  state.mutate.mockReset()
  state.isPending = false
})
afterEach(() => cleanup())

const TOGGLE = 'Container Terminal on this server'

function serverWith(fields: Partial<ServerDetailRecord>): ServerDetailRecord {
  return { id: 's', ...fields } as ServerDetailRecord
}

describe('ServerTerminalPanel', () => {
  it('is off by default and says what the switch does', () => {
    render(<ServerTerminalPanel orgId="o" server={serverWith({})} canManage />)
    expect(screen.getByLabelText(TOGGLE).getAttribute('aria-pressed')).toBe('false')
    expect(
      screen.getByText(
        'Allows browser terminals into this server\u2019s containers. Turning it off ends open terminals.'
      )
    ).toBeTruthy()
    expect(screen.getByText('Terminals not allowed')).toBeTruthy()
  })

  it('turns terminals on for this server', () => {
    render(<ServerTerminalPanel orgId="o" server={serverWith({})} canManage />)
    fireEvent.click(screen.getByLabelText(TOGGLE))
    expect(state.mutate).toHaveBeenCalledWith(true, expect.anything())
  })

  it('turns terminals off when they are on', () => {
    render(
      <ServerTerminalPanel
        orgId="o"
        server={serverWith({ options: { terminal: { container: true } } })}
        canManage
      />
    )
    expect(screen.getByText('Terminals allowed')).toBeTruthy()
    fireEvent.click(screen.getByLabelText(TOGGLE))
    expect(state.mutate).toHaveBeenCalledWith(false, expect.anything())
  })

  it('is read-only without manage permission', () => {
    render(<ServerTerminalPanel orgId="o" server={serverWith({})} canManage={false} />)
    expect(screen.getByLabelText(TOGGLE).hasAttribute('disabled')).toBe(true)
    expect(screen.getByText('Manage permission required.')).toBeTruthy()
    fireEvent.click(screen.getByLabelText(TOGGLE))
    expect(state.mutate).not.toHaveBeenCalled()
  })

  it('shows a save failure', () => {
    state.mutate.mockImplementation((_body: unknown, opts: { onError: (e: Error) => void }) =>
      opts.onError(new Error('x'))
    )
    render(<ServerTerminalPanel orgId="o" server={serverWith({})} canManage />)
    fireEvent.click(screen.getByLabelText(TOGGLE))
    expect(screen.getByText('Failed to save terminal settings')).toBeTruthy()
  })
})
