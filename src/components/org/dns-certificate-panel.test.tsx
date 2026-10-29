// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DnsCertificate, TunnelCarrier } from '@/lib/instance-api'
import { DnsCertificatePanel } from './dns-certificate-panel'

type Props = Readonly<Record<string, unknown> & { children?: ReactNode }>

const state = vi.hoisted(() => ({
  carriers: [] as unknown[],
  certificates: [] as unknown[],
  order: vi.fn(async (_body: unknown) => ({
    ok: true,
    value: { reused: false, certificate: {} },
  })) as ReturnType<typeof vi.fn>,
  check: vi.fn(async (_id: string) => ({ ok: true })),
  retry: vi.fn(async (_id: string) => ({ ok: true })),
  advanced: [] as (readonly string[])[],
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
  EmptyState: ({ title }: Props) => <p>{title as string}</p>,
  FormField: ({ label, children }: Props) => (
    <div>
      <span>{label as string}</span>
      {children}
    </div>
  ),
  LoadingState: ({ label }: Props) => <p>{label as string}</p>,
  SectionPanel: ({ title, children }: Props) => (
    <section>
      <h2>{title as string}</h2>
      {children}
    </section>
  ),
  SegmentedControl: ({ options, onChange, accessibilityLabel }: Props) => (
    <div aria-label={accessibilityLabel as string}>
      {(options as { value: string; label: string }[]).map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => (onChange as (v: string) => void)(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  ),
  Select: ({ options, onChange, accessibilityLabel }: Props) => (
    <select
      aria-label={accessibilityLabel as string}
      onChange={(e) => (onChange as (v: string) => void)(e.target.value)}
    >
      <option value="" />
      {(options as { value: string; label: string }[]).map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  ),
  SettingRow: ({ label, children }: Props) => (
    <div>
      <span>{label as string}</span>
      {children}
    </div>
  ),
  TextField: ({ label, value, onChangeText, accessibilityLabel }: Props) => (
    <input
      aria-label={(accessibilityLabel as string) ?? (label as string)}
      value={value as string}
      onChange={(e) => (onChangeText as (v: string) => void)(e.target.value)}
    />
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
vi.mock('@/lib/queries/tunnels', () => ({
  useTunnelCarriers: () => ({ data: { carriers: state.carriers } }),
}))
vi.mock('@/lib/queries/dns-certificates', () => ({
  useAdvanceRunningOrders: (_org: string, ids: readonly string[]) => state.advanced.push(ids),
  useDnsCertificates: () => ({
    data: { certificates: state.certificates },
    isLoading: false,
    isError: false,
  }),
  useOrderDnsCertificate: () => ({ run: state.order, isPending: false }),
  useCheckDnsCertificate: () => ({ run: state.check, isPending: false }),
  useRetryDnsCertificate: () => ({ run: state.retry, isPending: false }),
}))

const carrier = (id: string, dns = 1): TunnelCarrier =>
  ({
    id,
    name: `Account ${id}`,
    badges: [
      {
        status: 'active',
        capabilities: {
          tunnels: false,
          dns: dns > 0 ? [{ id: 'z1', name: 'example.com' }] : [],
          certificates: [],
        },
      },
    ],
  }) as unknown as TunnelCarrier

const cert = (extra: Partial<DnsCertificate> = {}): DnsCertificate => ({
  id: 'c1',
  names: ['app.example.com'],
  wildcard: false,
  status: 'pending',
  stage: 'validating',
  staging: false,
  lastError: null,
  warning: null,
  attempts: 0,
  nextAttemptAt: null,
  renewAt: null,
  notAfter: null,
  issuer: null,
  createdAt: '2026-10-28T00:00:00Z',
  updatedAt: '2026-10-28T00:00:00Z',
  ...extra,
})

beforeEach(() => {
  state.carriers = [carrier('k1')]
  state.certificates = []
  state.order.mockClear()
  state.check.mockClear()
  state.retry.mockClear()
})
afterEach(cleanup)

const type = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } })

describe('the order form', () => {
  it('asks for a Cloudflare account that can edit DNS first', () => {
    state.carriers = [carrier('k1', 0)]
    render(<DnsCertificatePanel orgId="o1" acmeEnabled />)
    expect(
      screen.getByText(/Connect a Cloudflare account with an API Token that can edit DNS/)
    ).toBeTruthy()
    expect(screen.queryByText('Order Certificate')).toBeNull()
  })

  it('orders exact names by default, with the test service off', async () => {
    render(<DnsCertificatePanel orgId="o1" acmeEnabled />)
    expect((screen.getByText('Order Certificate') as HTMLButtonElement).disabled).toBe(true)
    type('Names for the certificate', 'app.example.com, shop.example.com')
    fireEvent.click(screen.getByText('Order Certificate'))
    await waitFor(() => expect(state.order).toHaveBeenCalledTimes(1))
    expect(state.order).toHaveBeenCalledWith({
      carrierId: 'k1',
      names: ['app.example.com', 'shop.example.com'],
      staging: false,
    })
  })

  it('a wildcard is only ordered after it is chosen, and covers the domain and its subnames', async () => {
    render(<DnsCertificatePanel orgId="o1" acmeEnabled />)
    fireEvent.click(screen.getByText('Use A Wildcard Certificate'))
    type('Domain for the wildcard certificate', 'example.com')
    fireEvent.click(screen.getByText('Order Certificate'))
    await waitFor(() => expect(state.order).toHaveBeenCalledTimes(1))
    expect(state.order).toHaveBeenCalledWith({
      carrierId: 'k1',
      names: ['example.com', '*.example.com'],
      staging: false,
    })
  })

  it('asks for test certificates only when the toggle is turned on', async () => {
    render(<DnsCertificatePanel orgId="o1" acmeEnabled />)
    type('Names for the certificate', 'app.example.com')
    fireEvent.click(screen.getByLabelText('Test Certificates'))
    fireEvent.click(screen.getByText('Order Certificate'))
    await waitFor(() => expect(state.order).toHaveBeenCalledTimes(1))
    expect((state.order.mock.calls[0]![0] as { staging: boolean }).staging).toBe(true)
  })

  it('cannot be sent while Let’s Encrypt is off for the organization', () => {
    render(<DnsCertificatePanel orgId="o1" acmeEnabled={false} />)
    type('Names for the certificate', 'app.example.com')
    expect((screen.getByText('Order Certificate') as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText(/Turn on/)).toBeTruthy()
  })

  it('says why a refused order was refused', async () => {
    state.order.mockResolvedValueOnce({
      ok: false,
      cause: new Error('/x failed: HTTP 400: no_dns_token'),
    } as never)
    render(<DnsCertificatePanel orgId="o1" acmeEnabled />)
    type('Names for the certificate', 'app.example.com')
    fireEvent.click(screen.getByText('Order Certificate'))
    expect(
      await screen.findByText(/No API Token on this account can edit DNS records/)
    ).toBeTruthy()
  })
})

describe('the orders list', () => {
  it('shows progress, the Test Certificate marker and a way to check now', async () => {
    state.certificates = [cert({ staging: true })]
    render(<DnsCertificatePanel orgId="o1" acmeEnabled />)
    expect(
      screen.getByText(/Waiting for Let’s Encrypt to check the records\. Step 3 of 4/)
    ).toBeTruthy()
    expect(screen.getByText('Test Certificate')).toBeTruthy()
    fireEvent.click(screen.getByText('Check Now'))
    await waitFor(() => expect(state.check).toHaveBeenCalledWith('c1'))
  })

  it('hands only the orders still running to the automatic stepping', () => {
    state.advanced = []
    state.certificates = [cert(), cert({ id: 'c2', status: 'ready' })]
    render(<DnsCertificatePanel orgId="o1" acmeEnabled />)
    expect(state.advanced.at(-1)).toEqual(['c1'])
  })

  it('shows a renewal warning and a failure reason, and offers Try Again only after giving up', async () => {
    state.certificates = [
      cert({
        status: 'failed',
        stage: 'failed',
        lastError: 'No matching record.',
        warning: 'No API Token can edit DNS for example.com any more.',
      }),
    ]
    render(<DnsCertificatePanel orgId="o1" acmeEnabled />)
    expect(screen.getByText(/The last try failed: No matching record\./)).toBeTruthy()
    expect(screen.getByText(/No API Token can edit DNS for example.com any more\./)).toBeTruthy()
    expect(screen.queryByText('Check Now')).toBeNull()
    fireEvent.click(screen.getByText('Try Again'))
    await waitFor(() => expect(state.retry).toHaveBeenCalledWith('c1'))
  })

  it('has an empty line when nothing was ordered', () => {
    render(<DnsCertificatePanel orgId="o1" acmeEnabled />)
    expect(screen.getByText('No certificates ordered here yet.')).toBeTruthy()
  })
})
