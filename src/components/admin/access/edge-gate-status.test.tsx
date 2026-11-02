// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { EdgeGate } from '@/lib/instance-api'
import { EdgeGateStatus, REENROLL_HINT } from './edge-gate-status'

const mocks = vi.hoisted(() => ({ push: vi.fn() }))

vi.mock('react-native', async () => (await import('@/components/ui/v4/rn-stub')).reactNativeStub)
vi.mock('@/components/ui', async () => (await import('./access-ui-stub')).accessUiStub)
vi.mock('expo-router', () => ({ useRouter: () => ({ push: mocks.push }) }))

const WAITING: EdgeGate = {
  open: false,
  reason: 'held',
  waiting: [
    { id: 's1', name: 'kappa', organizationId: 'o1', pinnedBy: null },
    { id: 's2', name: 'omicron', organizationId: null, pinnedBy: 'unsafe' },
  ],
  remoteServers: 3,
  forcedClosed: false,
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('EdgeGateStatus', () => {
  it('says edge modes are ready when every remote server has the key', () => {
    render(
      <EdgeGateStatus gate={{ open: true, waiting: [], remoteServers: 0, forcedClosed: false }} />
    )
    expect(screen.getByText('Edge modes are ready.')).toBeTruthy()
    expect(screen.queryByText(REENROLL_HINT)).toBeNull()
  })

  it('lists the servers still waiting, each linked to its page', () => {
    render(<EdgeGateStatus gate={WAITING} />)
    expect(
      screen.getByText("2 servers still need to re-learn this control plane's key.")
    ).toBeTruthy()
    fireEvent.click(screen.getByText('kappa'))
    expect(mocks.push).toHaveBeenCalledWith('/o1/servers/s1')
    // A server no organization owns has no page: its name only.
    expect(screen.getByText('omicron').tagName).not.toBe('BUTTON')
    expect(screen.getByText(REENROLL_HINT)).toBeTruthy()
  })

  it('names one server in the singular and says when the host holds edge modes off', () => {
    render(<EdgeGateStatus gate={{ ...WAITING, waiting: WAITING.waiting!.slice(0, 1) }} />)
    expect(
      screen.getByText("1 server still needs to re-learn this control plane's key.")
    ).toBeTruthy()
    cleanup()
    render(<EdgeGateStatus gate={{ open: false, forcedClosed: true, waiting: [] }} />)
    expect(
      screen.getByText('Edge modes are held off on this host by its configuration.')
    ).toBeTruthy()
  })

  it('renders nothing before the gate is read', () => {
    const { container } = render(<EdgeGateStatus gate={null} />)
    expect(container.textContent).toBe('')
  })
})
