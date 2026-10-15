// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { OrgServerRecord } from '@/lib/instance-api'
import { defaultServerCommandState, ServerCommandsPanel } from './server-commands-panel'

vi.mock('react-native', async () => (await import('@/components/ui/v4/rn-stub')).reactNativeStub)
vi.mock('react-native-svg', async () => (await import('@/components/ui/v4/rn-stub')).svgStub)
vi.mock('@/lib/theme-preference', async () => (await import('@/components/ui/v4/rn-stub')).themePreferenceStub)
vi.mock('@/components/ui/panel-styles', () => ({ panelStyles: {} }))

type Props = Record<string, unknown> & { children?: unknown }

vi.mock('@/components/ui', () => ({
  Button: ({ label, onPress, disabled }: Props) => (
    <button type="button" disabled={disabled as boolean} onClick={onPress as () => void}>
      {label as string}
    </button>
  ),
  ButtonRow: ({ children }: Props) => <div>{children as never}</div>,
  ConfirmButton: () => null,
  LoadingState: ({ label }: Props) => <span>{label as string}</span>,
  TextField: ({ label, hint, value, onChangeText }: Props) => (
    <label>
      {label as string}
      <input
        aria-label={label as string}
        value={value as string}
        onChange={(event) => (onChangeText as (v: string) => void)(event.target.value)}
      />
      <span>{hint as string}</span>
    </label>
  ),
}))

afterEach(cleanup)

const LABEL = "Change the server's own name (Linux hostname)"

describe('ServerCommandsPanel hostname', () => {
  it("says it renames the server's own Linux hostname, not the DNS name clients use", () => {
    const onSetHostname = vi.fn()
    render(
      <ServerCommandsPanel
        server={{ id: 'srv-1', hostname: 'omega', connected: true } as OrgServerRecord}
        canManage
        commandState={defaultServerCommandState()}
        onPing={vi.fn()}
        onSetHostname={onSetHostname}
        onReboot={vi.fn()}
      />,
    )
    expect(screen.getByText(/The DNS name clients use is set under Network/)).toBeTruthy()
    fireEvent.change(screen.getByLabelText(LABEL), { target: { value: ' omega2 ' } })
    fireEvent.click(screen.getByText('Apply hostname'))
    expect(onSetHostname).toHaveBeenCalledWith('omega2')
  })
})
