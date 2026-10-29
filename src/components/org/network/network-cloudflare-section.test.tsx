// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BadgeInUseError, type TunnelBadge, type TunnelCarrier } from '@/lib/instance-api'
import { NetworkCloudflareSection } from './network-cloudflare-section'

type Props = Readonly<Record<string, unknown> & { children?: ReactNode }>

const state = vi.hoisted(() => ({
  carriers: [] as unknown[],
  addZone: vi.fn(),
  removeZone: vi.fn(),
  removeBadge: vi.fn(),
  addBadge: vi.fn(),
}))

vi.mock('react-native', async () => (await import('@/components/ui/v4/rn-stub')).reactNativeStub)
vi.mock('@/components/ui/panel-styles', () => ({ panelStyles: {} }))
vi.mock('@/components/ui', () => ({
  Badge: ({ label }: Props) => <span>{label as string}</span>,
  Button: ({ label, onPress, disabled }: Props) => (
    <button type="button" disabled={Boolean(disabled)} onClick={onPress as () => void}>
      {label as string}
    </button>
  ),
  ButtonRow: ({ children }: Props) => <div>{children}</div>,
  Checkbox: () => null,
  ConfirmButton: ({ label, onConfirm, disabled }: Props) => (
    <button type="button" disabled={Boolean(disabled)} onClick={onConfirm as () => void}>
      {label as string}
    </button>
  ),
  EmptyState: ({ title }: Props) => <p>{title as string}</p>,
  InlineNotice: ({ title }: Props) => <p role="note">{title as string}</p>,
  LoadingState: ({ label }: Props) => <p>{label as string}</p>,
  MonoText: ({ children }: Props) => <code>{children}</code>,
  SectionPanel: ({ title, children }: Props) => (
    <section>
      <h2>{title as string}</h2>
      {children}
    </section>
  ),
  TextField: ({ label, value, onChangeText }: Props) => (
    <input
      aria-label={label as string}
      value={value as string}
      onChange={(e) => (onChangeText as (v: string) => void)(e.target.value)}
    />
  ),
}))
vi.mock('@/lib/query-client', () => ({
  useCanState: () => ({ allowed: true, loading: false }),
}))
vi.mock('@/lib/queries/tunnels', () => ({
  useTunnelCarriers: () => ({
    data: { carriers: state.carriers },
    isLoading: false,
    isError: false,
  }),
  useConnectTunnelCarrier: () => ({ run: vi.fn(), isPending: false }),
  useAddTunnelBadge: () => ({ run: state.addBadge, isPending: false }),
  useAddTunnelBadgeZone: () => ({ run: state.addZone, isPending: false }),
  useRemoveTunnelBadgeZone: () => ({ run: state.removeZone, isPending: false }),
  useCheckTunnelBadge: () => ({ run: vi.fn(), isPending: false }),
  useDeleteTunnelBadge: () => ({ run: state.removeBadge, isPending: false }),
  useDeleteTunnelCarrier: () => ({ run: vi.fn(), isPending: false }),
}))

const badge = (extra: Partial<TunnelBadge> = {}): TunnelBadge => ({
  id: 'b1',
  carrierId: 'c1',
  label: 'Shop DNS',
  lastFour: 'abcd',
  capabilities: { tunnels: false, dns: [{ id: 'z9', name: 'shop.example.org' }], certificates: [] },
  kind: 'account',
  expiresAt: null,
  status: 'active',
  lastCheckedAt: null,
  createdAt: '2026-10-28T00:00:00.000Z',
  declaredZones: [{ id: 'z9', name: 'shop.example.org' }],
  warnings: ['This API Token expires in 3 days.'],
  ...extra,
})

const carrier = (badges: TunnelBadge[]): TunnelCarrier => ({
  id: 'c1',
  provider: 'cloudflare',
  name: 'Main',
  externalAccountId: 'acct',
  status: 'active',
  createdAt: '2026-10-28T00:00:00.000Z',
  badges,
})

describe('NetworkCloudflareSection API Tokens', () => {
  beforeEach(() => {
    state.carriers = [carrier([badge()])]
    for (const fn of [state.addZone, state.removeZone, state.removeBadge, state.addBadge]) {
      fn.mockReset()
      fn.mockResolvedValue({ ok: true, value: {} })
    }
  })
  afterEach(cleanup)

  it('shows the warnings and the zones named for a token', () => {
    render(<NetworkCloudflareSection orgId="o1" />)
    expect(screen.getByText('This API Token expires in 3 days.')).toBeTruthy()
    expect(screen.getByText('shop.example.org')).toBeTruthy()
    expect(screen.getByText('z9')).toBeTruthy()
  })

  it('still renders a token from a panel that sends no zones or warnings', () => {
    state.carriers = [
      carrier([badge({ declaredZones: undefined, warnings: undefined } as Partial<TunnelBadge>)]),
    ]
    render(<NetworkCloudflareSection orgId="o1" />)
    expect(screen.getByText('Shop DNS')).toBeTruthy()
    expect(screen.getByText('Add Zone')).toBeTruthy()
  })

  it('names a zone with its id, leaving the name out unless it was typed', async () => {
    render(<NetworkCloudflareSection orgId="o1" />)
    fireEvent.click(screen.getByText('Add Zone'))
    fireEvent.change(screen.getByLabelText('Zone ID'), { target: { value: ' z8 ' } })
    fireEvent.click(screen.getByText('Check And Add'))
    await waitFor(() => expect(state.addZone).toHaveBeenCalledWith({ id: 'z8' }))
    fireEvent.click(screen.getByText('Add Zone'))
    fireEvent.change(screen.getByLabelText('Zone ID'), { target: { value: 'z7' } })
    fireEvent.change(screen.getByLabelText('Zone Name (only if asked)'), {
      target: { value: 'Docs.Example.net' },
    })
    fireEvent.click(screen.getByText('Check And Add'))
    await waitFor(() =>
      expect(state.addZone).toHaveBeenLastCalledWith({ id: 'z7', name: 'docs.example.net' })
    )
  })

  it('does not send a zone with a bad id or name', () => {
    render(<NetworkCloudflareSection orgId="o1" />)
    fireEvent.click(screen.getByText('Add Zone'))
    fireEvent.change(screen.getByLabelText('Zone ID'), { target: { value: 'not an id' } })
    expect((screen.getByText('Check And Add') as HTMLButtonElement).disabled).toBe(true)
  })

  it('lists what depends on a token that others do not cover', async () => {
    state.removeBadge.mockResolvedValue({
      ok: false,
      cause: new BadgeInUseError(
        '/x',
        [
          { kind: 'tunnel', id: 't1', name: 'web', zone: null },
          { kind: 'hostname', id: 'h1', name: 'blog.example.org', zone: 'example.org' },
        ],
        7
      ),
    })
    render(<NetworkCloudflareSection orgId="o1" />)
    fireEvent.click(screen.getByText('Remove'))
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('the tunnel web')
    expect(alert.textContent).toContain('the hostname blog.example.org (example.org)')
    expect(alert.textContent).toContain('and 5 more')
  })

  it('sends the zone named while adding a token', async () => {
    render(<NetworkCloudflareSection orgId="o1" />)
    fireEvent.click(screen.getByText('Add API Token'))
    fireEvent.change(screen.getAllByLabelText('Label')[1]!, { target: { value: 'Zone DNS' } })
    fireEvent.change(screen.getAllByLabelText('API Token')[1]!, {
      target: { value: 'cfat_abcdefghijklmnop' },
    })
    fireEvent.change(screen.getByLabelText('Zone ID (optional)'), { target: { value: 'z5' } })
    fireEvent.click(screen.getByText('Add'))
    await waitFor(() =>
      expect(state.addBadge).toHaveBeenCalledWith({
        label: 'Zone DNS',
        token: 'cfat_abcdefghijklmnop',
        zones: [{ id: 'z5' }],
      })
    )
  })
})
