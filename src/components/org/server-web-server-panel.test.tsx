// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ServerDetailRecord } from '@/lib/instance-api'
import { ServerWebServerPanel } from './server-web-server-panel'

const state = vi.hoisted(() => ({ mutate: vi.fn() }))

vi.mock('react-native', async () => (await import('@/components/ui/v4/rn-stub')).reactNativeStub)
vi.mock('react-native-svg', async () => (await import('@/components/ui/v4/rn-stub')).svgStub)
vi.mock(
  '@/lib/theme-preference',
  async () => (await import('@/components/ui/v4/rn-stub')).themePreferenceStub
)
vi.mock('@/components/ui/panel-styles', () => ({ panelStyles: { muted: {}, error: {} } }))
vi.mock('@/lib/queries/servers', () => ({
  useUpdateServer: () => ({ mutate: state.mutate, isPending: false }),
}))
vi.mock('@/lib/user-error', () => ({
  userErrorMessage: (_e: unknown, fallback: string) => fallback,
}))
vi.mock('@/components/org/server-web-server-settings-section', () => ({
  HIDE_WEB_SERVER_NAMES_LABEL: 'Hide web server names and versions',
  HIDE_WEB_SERVER_NAMES_HINT: 'hide hint',
  SEND_VIA_HEADER_LABEL: 'Send Via Header',
  SEND_VIA_HEADER_HINT: 'via hint',
}))
vi.mock('@/components/ui', () => ({
  Button: ({
    label,
    accessibilityLabel,
    onPress,
  }: {
    label: string
    accessibilityLabel?: string
    onPress: () => void
  }) => (
    <button aria-label={accessibilityLabel ?? label} onClick={onPress}>
      {label}
    </button>
  ),
  ButtonRow: ({ children }: { children?: unknown }) => <div>{children as never}</div>,
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
  SettingRow: ({ label, children }: { label: string; children?: unknown }) => (
    <div>
      <span>{label}</span>
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

beforeEach(() => state.mutate.mockReset())
afterEach(() => cleanup())

const VIA_TOGGLE = 'Send Via Header on this server'
const VIA_RESET = 'Send Via Header: use organization setting'
const HIDE_RESET = 'Hide web server names and versions: use organization setting'

function serverWith(fields: Partial<ServerDetailRecord>): ServerDetailRecord {
  return {
    id: 's',
    hideWebServerNames: true,
    hideWebServerNamesSource: null,
    sendViaHeader: false,
    sendViaHeaderSource: null,
    ...fields,
  } as ServerDetailRecord
}

describe('ServerWebServerPanel', () => {
  it('follows the platform default: Via off, no way back needed', () => {
    render(<ServerWebServerPanel orgId="o" server={serverWith({})} canManage />)
    expect(screen.getByLabelText(VIA_TOGGLE).getAttribute('aria-pressed')).toBe('false')
    expect(screen.getByText('Source: Platform default (off)')).toBeTruthy()
    expect(screen.queryByLabelText(VIA_RESET)).toBeNull()
    expect(screen.getByText('Names hidden · Via header removed')).toBeTruthy()
  })

  it('turns the Via header on for this server only', () => {
    render(<ServerWebServerPanel orgId="o" server={serverWith({})} canManage />)
    fireEvent.click(screen.getByLabelText(VIA_TOGGLE))
    expect(state.mutate).toHaveBeenCalledWith(
      { options: { sendViaHeader: true } },
      expect.anything()
    )
  })

  it('shows the organization value and turns it off as a server override', () => {
    render(
      <ServerWebServerPanel
        orgId="o"
        server={serverWith({ sendViaHeader: true, sendViaHeaderSource: 'organization' })}
        canManage
      />
    )
    expect(screen.getByText('Source: Organization default')).toBeTruthy()
    expect(screen.queryByLabelText(VIA_RESET)).toBeNull()
    fireEvent.click(screen.getByLabelText(VIA_TOGGLE))
    expect(state.mutate).toHaveBeenCalledWith(
      { options: { sendViaHeader: false } },
      expect.anything()
    )
  })

  it('goes back to the organization setting for the Via header alone', () => {
    render(
      <ServerWebServerPanel
        orgId="o"
        server={serverWith({ sendViaHeader: true, sendViaHeaderSource: 'server' })}
        canManage
      />
    )
    expect(screen.queryByLabelText(HIDE_RESET)).toBeNull()
    fireEvent.click(screen.getByLabelText(VIA_RESET))
    expect(state.mutate).toHaveBeenCalledWith(
      { options: { sendViaHeader: null } },
      expect.anything()
    )
  })

  it('keeps the name hiding override separate', () => {
    render(
      <ServerWebServerPanel
        orgId="o"
        server={serverWith({ hideWebServerNames: false, hideWebServerNamesSource: 'server' })}
        canManage
      />
    )
    fireEvent.click(screen.getByLabelText(HIDE_RESET))
    expect(state.mutate).toHaveBeenCalledWith(
      { options: { hideWebServerNames: null } },
      expect.anything()
    )
  })

  it('is read-only without manage permission', () => {
    render(
      <ServerWebServerPanel
        orgId="o"
        server={serverWith({ sendViaHeaderSource: 'server' })}
        canManage={false}
      />
    )
    expect(screen.getByLabelText<HTMLButtonElement>(VIA_TOGGLE).disabled).toBe(true)
    expect(screen.queryByLabelText(VIA_RESET)).toBeNull()
    expect(screen.getByText('Manage permission required.')).toBeTruthy()
  })
})
