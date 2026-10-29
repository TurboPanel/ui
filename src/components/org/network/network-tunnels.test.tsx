// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { OrgServerRecord, TunnelPortal, TunnelRecord } from '@/lib/instance-api'
import { NetworkTunnelCard } from './network-tunnel-card'
import { NetworkTunnelServers } from './network-tunnel-servers'
import { NetworkTunnelsSection } from './network-tunnels-section'

type Props = Readonly<Record<string, unknown> & { children?: ReactNode }>

const state = vi.hoisted(() => ({
  can: { allowed: true, loading: false },
  tunnels: [] as unknown[],
  setCarrying: vi.fn(async (_body: { serverId: string; carry: boolean }) => ({ ok: true })),
  deleteTunnel: vi.fn(async (_id: string) => ({ ok: true })),
}))

vi.mock('react-native', async () => (await import('@/components/ui/v4/rn-stub')).reactNativeStub)
vi.mock('@/components/ui/panel-styles', () => ({ panelStyles: {} }))
vi.mock('@/components/ui', () => ({
  Badge: ({ label }: Props) => <span data-testid="badge">{label as string}</span>,
  Button: ({ label, onPress }: Props) => (
    <button type="button" onClick={onPress as () => void}>
      {label as string}
    </button>
  ),
  ButtonRow: ({ children }: Props) => <div>{children}</div>,
  ConfirmButton: ({ label, onConfirm, disabled }: Props) => (
    <button type="button" disabled={Boolean(disabled)} onClick={onConfirm as () => void}>
      {label as string}
    </button>
  ),
  EmptyState: ({ title }: Props) => <p>{title as string}</p>,
  InlineNotice: () => null,
  LoadingState: ({ label }: Props) => <p>{label as string}</p>,
  MonoText: ({ children }: Props) => <code>{children}</code>,
  SectionPanel: ({ title, children }: Props) => (
    <section>
      <h2>{title as string}</h2>
      {children}
    </section>
  ),
  SettingRow: ({ label, children }: Props) => (
    <div>
      <span>{label as string}</span>
      {children}
    </div>
  ),
  Toggle: ({ onValueChange, accessibilityLabel, value }: Props) => (
    <button
      type="button"
      aria-label={accessibilityLabel as string}
      data-on={String(value)}
      onClick={() => (onValueChange as (v: boolean) => void)(!value)}
    />
  ),
}))
vi.mock('@/lib/query-client', () => ({ useCanState: () => state.can }))
vi.mock('@/lib/queries/servers', () => ({ useOrgServers: () => ({ data: { servers: [] } }) }))
vi.mock('@/lib/queries/tunnels', () => ({ useTunnelCarriers: () => ({ data: { carriers: [] } }) }))
vi.mock('@/lib/queries/topology', () => ({ useDatacenters: () => ({ data: { datacenters: [] } }) }))
vi.mock('@/lib/queries/tunnel-routes', () => ({
  useTunnels: () => ({ data: { tunnels: state.tunnels }, isError: false, isLoading: false }),
  useSetServerTunnelCarrying: () => ({ run: state.setCarrying, isPending: false }),
  useDeleteTunnel: () => ({ run: state.deleteTunnel, isPending: false }),
  useUpdateTunnelPlacement: () => ({ run: vi.fn(), isPending: false }),
}))
vi.mock('./network-tunnel-create', () => ({ NetworkTunnelCreate: () => <p>create form</p> }))
vi.mock('./network-tunnel-hostnames', () => ({ NetworkTunnelHostnames: () => null }))
vi.mock('./network-tunnel-placement', () => ({ NetworkTunnelPlacement: () => null }))

const portal = (extra: Partial<TunnelPortal> = {}): TunnelPortal => ({
  serverId: 's1',
  wanted: 'run',
  reported: 'unknown',
  lastSeenAt: null,
  lastError: null,
  connectorVersion: null,
  ...extra,
})

const tunnel = (extra: Partial<TunnelRecord> = {}): TunnelRecord =>
  ({
    id: 't1',
    name: 'edge',
    provider: 'cloudflare',
    carrierId: 'c1',
    placement: 'one',
    datacenterId: null,
    status: 'pending',
    createdAt: '2026-10-28T00:00:00Z',
    portals: [portal()],
    carryingServerIds: ['s1'],
    warnings: [],
    doorwayCount: 0,
    ...extra,
  }) as TunnelRecord

const server = (id: string): OrgServerRecord =>
  ({ id, name: id, hostname: null, address: null, connected: true }) as OrgServerRecord

beforeEach(() => {
  state.can = { allowed: true, loading: false }
  state.tunnels = []
  state.setCarrying.mockClear()
  state.deleteTunnel.mockClear()
})
afterEach(cleanup)

describe('the role gate on the Tunnels screen', () => {
  it('shows a loading line, not the refusal, while the role is still loading', () => {
    state.can = { allowed: false, loading: true }
    render(<NetworkTunnelsSection orgId="o1" />)
    expect(screen.getByText('Checking your access…')).toBeTruthy()
    expect(screen.queryByText(/Only owners and managers/)).toBeNull()
    expect(screen.queryByText('create form')).toBeNull()
  })
  it('shows the refusal once the role is known and does not allow it', () => {
    state.can = { allowed: false, loading: false }
    render(<NetworkTunnelsSection orgId="o1" />)
    expect(screen.getByText('Only owners and managers can manage tunnels.')).toBeTruthy()
    expect(screen.queryByText('Checking your access…')).toBeNull()
  })
  it('shows the create form for a manager', () => {
    render(<NetworkTunnelsSection orgId="o1" />)
    expect(screen.getByText('create form')).toBeTruthy()
  })
})

describe('a tunnel card', () => {
  it('says Running when a server is connected, though the panel status is still pending', () => {
    render(
      <NetworkTunnelCard
        orgId="o1"
        tunnel={tunnel({ portals: [portal({ reported: 'connected' })] })}
        servers={[server('s1')]}
        datacenters={[]}
      />
    )
    expect(screen.getAllByTestId('badge')[0]?.textContent).toBe('Running')
  })
  it('removes through the confirm button, and not while it is already being removed', () => {
    const { rerender } = render(
      <NetworkTunnelCard orgId="o1" tunnel={tunnel()} servers={[server('s1')]} datacenters={[]} />
    )
    const button = screen.getByText('Remove Tunnel') as HTMLButtonElement
    expect(button.disabled).toBe(false)
    fireEvent.click(button)
    expect(state.deleteTunnel).toHaveBeenCalledWith('t1')
    rerender(
      <NetworkTunnelCard
        orgId="o1"
        tunnel={tunnel({ status: 'removing' })}
        servers={[server('s1')]}
        datacenters={[]}
      />
    )
    expect((screen.getByText('Remove Tunnel') as HTMLButtonElement).disabled).toBe(true)
  })
})

describe('switching a server off for tunnels', () => {
  it('switches off at once when no tunnel runs there', () => {
    render(<NetworkTunnelServers orgId="o1" servers={[server('s1')]} tunnels={[]} />)
    fireEvent.click(screen.getByLabelText('Allow tunnels on s1'))
    expect(state.setCarrying).toHaveBeenCalledWith({ serverId: 's1', carry: false })
  })
  it('asks first when a tunnel runs there, and switches off only after the confirm', () => {
    render(<NetworkTunnelServers orgId="o1" servers={[server('s1')]} tunnels={[tunnel()]} />)
    fireEvent.click(screen.getByLabelText('Allow tunnels on s1'))
    expect(state.setCarrying).not.toHaveBeenCalled()
    expect(screen.getByText(/s1 runs edge\. Switching it off removes its connector/)).toBeTruthy()
    fireEvent.click(screen.getByText('Switch Off Tunnels Here'))
    expect(state.setCarrying).toHaveBeenCalledWith({ serverId: 's1', carry: false })
  })
  it('lets the person keep it on', () => {
    render(<NetworkTunnelServers orgId="o1" servers={[server('s1')]} tunnels={[tunnel()]} />)
    fireEvent.click(screen.getByLabelText('Allow tunnels on s1'))
    fireEvent.click(screen.getByText('Keep It On'))
    expect(screen.queryByText('Switch Off Tunnels Here')).toBeNull()
    expect(state.setCarrying).not.toHaveBeenCalled()
  })
})
