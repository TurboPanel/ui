// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { TunnelRecord, VerifyOriginState } from '@/lib/instance-api'
import { NetworkTunnelVerify } from './network-tunnel-verify'

type Props = Readonly<Record<string, unknown> & { children?: ReactNode }>

const state = vi.hoisted(() => ({
  run: vi.fn(async (_body: { enabled: boolean; wildcard?: boolean }) => ({
    ok: true as boolean,
    value: { needsDeploy: false } as { needsDeploy: boolean },
    error: null as string | null,
    cause: undefined as unknown,
  })),
}))

vi.mock('react-native', async () => (await import('@/components/ui/v4/rn-stub')).reactNativeStub)
vi.mock('@/components/ui/panel-styles', () => ({ panelStyles: {} }))
vi.mock('@/components/ui', () => ({
  Badge: ({ label }: Props) => <span data-testid="badge">{label as string}</span>,
  Button: ({ label, onPress, disabled }: Props) => (
    <button type="button" disabled={Boolean(disabled)} onClick={onPress as () => void}>
      {label as string}
    </button>
  ),
  ButtonRow: ({ children }: Props) => <div>{children}</div>,
  Checkbox: ({ label, checked, onPress }: Props) => (
    <button
      type="button"
      role="checkbox"
      aria-checked={Boolean(checked)}
      onClick={onPress as () => void}
    >
      {label as string}
    </button>
  ),
  InlineNotice: ({ title }: Props) => <p>{title as string}</p>,
}))
vi.mock('@/lib/queries/tunnel-routes', () => ({
  useSetTunnelVerifyOrigin: () => ({ run: state.run, isPending: false }),
}))

const tunnel = (verifyOrigin: VerifyOriginState, status = 'active'): TunnelRecord =>
  ({ id: 't1', name: 'edge', status, verifyOrigin }) as TunnelRecord

const OFF: VerifyOriginState = { enabled: false, active: false, pendingNames: [] }

beforeEach(() => {
  state.run.mockClear()
})
afterEach(cleanup)

describe('the verified connection of a tunnel', () => {
  it('starts off, and turning it on asks first and defaults to exact hostnames', async () => {
    render(<NetworkTunnelVerify orgId="o1" tunnel={tunnel(OFF)} />)
    expect(screen.getByTestId('badge').textContent).toBe('Off')
    fireEvent.click(screen.getByText('Verify the Connection'))
    // The wildcard is an explicit choice and its risk is said in plain words.
    expect(screen.getByRole('checkbox').getAttribute('aria-checked')).toBe('false')
    expect(screen.getByText(/could impersonate any of those names/)).toBeTruthy()
    fireEvent.click(screen.getByText('Turn On'))
    await waitFor(() => expect(state.run).toHaveBeenCalledTimes(1))
    expect(state.run).toHaveBeenCalledWith({ enabled: true, wildcard: undefined })
  })

  it('sends the wildcard only when the box was ticked', async () => {
    render(<NetworkTunnelVerify orgId="o1" tunnel={tunnel(OFF)} />)
    fireEvent.click(screen.getByText('Verify the Connection'))
    fireEvent.click(screen.getByRole('checkbox'))
    fireEvent.click(screen.getByText('Turn On'))
    await waitFor(() => expect(state.run).toHaveBeenCalledTimes(1))
    expect(state.run).toHaveBeenCalledWith({ enabled: true, wildcard: true })
  })

  it('says Waiting with the names while a site or certificate is missing, and can be applied again or turned off', async () => {
    render(
      <NetworkTunnelVerify
        orgId="o1"
        tunnel={tunnel({ enabled: true, active: false, pendingNames: ['later.example.com'] })}
      />
    )
    expect(screen.getByTestId('badge').textContent).toBe('Waiting')
    expect(screen.getByText(/Waiting for later\.example\.com/)).toBeTruthy()
    fireEvent.click(screen.getByText('Apply Again'))
    await waitFor(() =>
      expect(state.run).toHaveBeenCalledWith({ enabled: true, wildcard: undefined })
    )
    fireEvent.click(screen.getByText('Turn Off'))
    await waitFor(() =>
      expect(state.run).toHaveBeenCalledWith({ enabled: false, wildcard: undefined })
    )
  })

  it('tells the person to deploy the sites again after a new certificate was pinned', async () => {
    state.run.mockResolvedValueOnce({
      ok: true,
      value: { needsDeploy: true },
      error: null,
      cause: undefined,
    })
    render(<NetworkTunnelVerify orgId="o1" tunnel={tunnel(OFF)} />)
    fireEvent.click(screen.getByText('Verify the Connection'))
    fireEvent.click(screen.getByText('Turn On'))
    await waitFor(() => expect(screen.getByText(/Deploy the sites again/)).toBeTruthy())
  })

  it('shows a refusal in plain words and keeps the form open', async () => {
    state.run.mockResolvedValueOnce({
      ok: false,
      value: { needsDeploy: false },
      error: 'x',
      cause: new Error('HTTP 409: verify_origin_public_names — also serves other names'),
    })
    render(<NetworkTunnelVerify orgId="o1" tunnel={tunnel(OFF)} />)
    fireEvent.click(screen.getByText('Verify the Connection'))
    fireEvent.click(screen.getByText('Turn On'))
    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toMatch(
        /also serves a name that is not a tunnel name/
      )
    )
    expect(screen.getByText('Turn On')).toBeTruthy()
  })

  it('cannot be changed while the tunnel is being removed', () => {
    render(<NetworkTunnelVerify orgId="o1" tunnel={tunnel(OFF, 'removing')} />)
    expect((screen.getByText('Verify the Connection') as HTMLButtonElement).disabled).toBe(true)
  })
})
