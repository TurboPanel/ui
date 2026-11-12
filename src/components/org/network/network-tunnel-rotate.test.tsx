// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { TunnelRecord, TunnelRunTokenRotation } from '@/lib/instance-api'
import { ROTATE_CONFIRM, ROTATE_SINGLE_SERVER_WARNING } from '@/lib/tunnel-runs'
import { NetworkTunnelRotate } from './network-tunnel-rotate'

type Props = Readonly<Record<string, unknown> & { children?: ReactNode }>

const state = vi.hoisted(() => ({
  rotate: vi.fn(async (_body: { confirmSingleServer: boolean }) => ({ ok: true, value: {} })),
}))

vi.mock('react-native', async () => (await import('@/components/ui/v4/rn-stub')).reactNativeStub)
vi.mock('@/components/ui/panel-styles', () => ({ panelStyles: {} }))
vi.mock('@/components/ui', () => ({
  Button: ({ label, onPress }: Props) => (
    <button type="button" onClick={onPress as () => void}>
      {label as string}
    </button>
  ),
  ButtonRow: ({ children }: Props) => <div>{children}</div>,
  // The prompt is shown next to the button so a test can read it; pressing confirms at once.
  ConfirmButton: ({ label, prompt, onConfirm, disabled }: Props) => (
    <div>
      <p data-testid="prompt">{prompt as string}</p>
      <button type="button" disabled={Boolean(disabled)} onClick={onConfirm as () => void}>
        {label as string}
      </button>
    </div>
  ),
  InlineNotice: ({ title, body, actions }: Props) => (
    <section>
      <h3>{title as string}</h3>
      {body ? <p>{body as string}</p> : null}
      {actions as ReactNode}
    </section>
  ),
}))
vi.mock('@/lib/queries/tunnel-routes', () => ({
  useRotateTunnelRunToken: () => ({ run: state.rotate, isPending: false }),
}))

const names = new Map([
  ['s1', 'juliet'],
  ['s2', 'panvm'],
])

const tunnel = (extra: Partial<TunnelRecord> = {}): TunnelRecord =>
  ({
    id: 't1',
    name: 'edge',
    provider: 'cloudflare',
    carrierId: 'c1',
    placement: 'chosen',
    datacenterId: null,
    status: 'active',
    createdAt: '2026-10-28T00:00:00Z',
    portals: [],
    carryingServerIds: ['s1', 's2'],
    warnings: [],
    doorwayCount: 0,
    runTokenRotation: null,
    runTokenRotationBlock: null,
    ...extra,
  }) as TunnelRecord

const rotation = (extra: Partial<TunnelRunTokenRotation> = {}): TunnelRunTokenRotation => ({
  phase: 'rolling',
  startedAt: '2026-11-11T00:00:00Z',
  finishedAt: null,
  movedServerIds: ['s1'],
  pendingServerIds: ['s2'],
  currentServerId: null,
  stoppedReason: null,
  ...extra,
})

function show(t: TunnelRecord) {
  return render(<NetworkTunnelRotate orgId="o1" tunnel={t} names={names} />)
}

async function press(name: string) {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name }))
  })
}

beforeEach(() => {
  state.rotate.mockClear()
})
afterEach(cleanup)

describe('Rotate Run Token on a tunnel card', () => {
  it('shows nothing for an older control plane that sends no block field', () => {
    const { container } = show(tunnel({ runTokenRotationBlock: undefined }))
    expect(container.textContent).toBe('')
  })

  it('shows progress, and no action, while a rotation runs', () => {
    show(tunnel({ runTokenRotation: rotation() }))
    expect(
      screen.getByText('Rotating run token: juliet moved, panvm next (about 10 min)')
    ).toBeTruthy()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('asks in the approved words and starts without the single-server confirmation', async () => {
    show(tunnel())
    expect(screen.getByTestId('prompt').textContent).toBe(ROTATE_CONFIRM)
    await press('Rotate Run Token')
    expect(state.rotate).toHaveBeenCalledWith({ confirmSingleServer: false })
  })

  it('warns a lone server about the short outage and sends the confirmation', async () => {
    show(tunnel({ carryingServerIds: ['s1'] }))
    expect(screen.getByTestId('prompt').textContent).toBe(
      `${ROTATE_CONFIRM} ${ROTATE_SINGLE_SERVER_WARNING}`
    )
    await press('Rotate Run Token')
    expect(state.rotate).toHaveBeenCalledWith({ confirmSingleServer: true })
  })

  it('disables the action with the reason when it cannot start', () => {
    show(
      tunnel({
        runTokenRotationBlock: { code: 'tunnel_daemon_too_old', message: 'x', serverIds: ['s2'] },
      })
    )
    const button = screen.getByRole('button', { name: 'Rotate Run Token' }) as HTMLButtonElement
    expect(button.disabled).toBe(true)
    expect(screen.getByText(/Update the daemon on panvm first/)).toBeTruthy()
  })

  it('offers Resume for a stopped rotation, also while a server is out of reach', async () => {
    show(
      tunnel({
        runTokenRotation: rotation({
          phase: 'stopped',
          stoppedReason: 'Server s2 cannot be reached',
          oldTokenServerIds: ['s2'],
          resumesOnItsOwn: true,
        }),
        runTokenRotationBlock: { code: 'server_not_ready', message: 'x', serverIds: ['s2'] },
      })
    )
    expect(
      screen.getByText('Run token rotation stopped: Server panvm cannot be reached')
    ).toBeTruthy()
    expect(screen.getByText(/panvm keeps the old token/)).toBeTruthy()
    // The reachability block is not shown as a reason: the control plane waits for the server.
    expect(screen.queryByText(/cannot be reached right now/)).toBeNull()
    expect(screen.queryByRole('button', { name: 'Rotate Run Token' })).toBeNull()
    await press('Resume Rotation')
    expect(state.rotate).toHaveBeenCalledWith({ confirmSingleServer: false })
  })

  it('does not offer Resume when only a person can clear the block, and says why', () => {
    show(
      tunnel({
        runTokenRotation: rotation({ phase: 'stopped', stoppedReason: 'The provider refused' }),
        runTokenRotationBlock: { code: 'tunnel_daemon_too_old', message: 'x', serverIds: ['s2'] },
      })
    )
    expect(screen.getByText('Run token rotation stopped: The provider refused')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Resume Rotation' })).toBeNull()
    expect(screen.getByText(/Update the daemon on panvm first/)).toBeTruthy()
  })

  it('shows a failed start in plain words', async () => {
    state.rotate.mockResolvedValueOnce({
      ok: false,
      cause: new Error('HTTP 409: rotation_in_progress — already'),
    } as never)
    show(tunnel())
    await press('Rotate Run Token')
    expect(screen.getByRole('alert')).toBeTruthy()
  })
})
