// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ServerColocatedRepairPanel } from './server-colocated-repair-panel'

type Props = Readonly<Record<string, unknown> & { children?: ReactNode }>

const state = vi.hoisted(() => ({
  canOwn: true,
  pending: false,
  run: vi.fn() as ReturnType<typeof vi.fn>,
}))

vi.mock('react-native', async () => (await import('@/components/ui/v4/rn-stub')).reactNativeStub)
vi.mock('@/components/ui/panel-styles', () => ({ panelStyles: {} }))
vi.mock('@/components/ui', () => ({
  SectionPanel: ({ title, hint, children }: Props) => (
    <section>
      <h2>{title as string}</h2>
      <span>{hint as string}</span>
      {children}
    </section>
  ),
  // Stands in for the two-step confirm: shows the question, confirms on press.
  ConfirmButton: ({ label, prompt, onConfirm }: Props) => (
    <div>
      <p>{prompt as string}</p>
      <button type="button" onClick={onConfirm as () => void}>
        {label as string}
      </button>
    </div>
  ),
}))
vi.mock('@/lib/query-client', () => ({ useCan: () => state.canOwn }))
vi.mock('@/lib/queries/servers', () => ({
  useRepairColocatedConnection: () => ({ run: state.run, isPending: state.pending }),
}))

beforeEach(() => {
  state.canOwn = true
  state.pending = false
  state.run = vi.fn()
})
afterEach(cleanup)

describe('ServerColocatedRepairPanel', () => {
  it('explains the action and asks before repairing', () => {
    render(<ServerColocatedRepairPanel orgId="org-1" serverId="srv-1" />)
    expect(screen.getByRole('heading', { name: 'Repair Connection' })).toBeTruthy()
    expect(
      screen.getByText(
        "Use this when this server's daemon can't connect. It issues new credentials for this same server and restarts the connection."
      )
    ).toBeTruthy()
    expect(
      screen.getByText(
        "Issue new credentials for this server's daemon? Its old credentials stop working."
      )
    ).toBeTruthy()
  })

  it('shows what the repair did', async () => {
    state.run.mockResolvedValue({
      ok: true,
      value: { ok: true, serverId: 'srv-1', reasons: [], clearedKey: true },
    })
    render(<ServerColocatedRepairPanel orgId="org-1" serverId="srv-1" />)
    fireEvent.click(screen.getByRole('button', { name: 'Repair Connection' }))
    await waitFor(() =>
      expect(screen.getByText(/New credentials were written for this server\./)).toBeTruthy()
    )
    expect(screen.getByText(/Its old key was cleared/)).toBeTruthy()
    expect(state.run).toHaveBeenCalledTimes(1)
  })

  it('shows the plain refusal from the control plane', async () => {
    state.run.mockResolvedValue({
      ok: false,
      error: "This server's daemon key is revoked, so it cannot be repaired.",
    })
    render(<ServerColocatedRepairPanel orgId="org-1" serverId="srv-1" />)
    fireEvent.click(screen.getByRole('button', { name: 'Repair Connection' }))
    await waitFor(() =>
      expect(
        screen.getByText("This server's daemon key is revoked, so it cannot be repaired.")
      ).toBeTruthy()
    )
  })

  it('shows nothing when step-up was cancelled', async () => {
    state.run.mockResolvedValue({ ok: false, error: null })
    render(<ServerColocatedRepairPanel orgId="org-1" serverId="srv-1" />)
    fireEvent.click(screen.getByRole('button', { name: 'Repair Connection' }))
    await waitFor(() => expect(state.run).toHaveBeenCalledTimes(1))
    expect(screen.queryByText(/New credentials/)).toBeNull()
  })

  it('is hidden from anyone who is not the owner', () => {
    state.canOwn = false
    render(<ServerColocatedRepairPanel orgId="org-1" serverId="srv-1" />)
    expect(screen.queryByText('Repair Connection')).toBeNull()
  })
})
