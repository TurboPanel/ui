// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ExistingOriginCertificateRecord, OriginCertificateRecord } from '@/lib/instance-api'
import { NetworkOriginCertificates } from './network-origin-certificates'

type Props = Readonly<Record<string, unknown> & { children?: ReactNode }>

const state = vi.hoisted(() => ({
  issued: { data: { originCertificates: [] as unknown[] }, isLoading: false, isError: false } as {
    data?: { originCertificates: unknown[] }
    isLoading: boolean
    isError: boolean
    error?: unknown
  },
  existing: { data: undefined, isError: false, isFetching: false } as {
    data?: { zone: string; certificates: unknown[] }
    isError: boolean
    isFetching: boolean
    error?: unknown
  },
  askedZone: [] as string[],
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
  LoadingState: ({ label }: Props) => <p>{label as string}</p>,
  MonoText: ({ children }: Props) => <code>{children}</code>,
  TextField: ({ label, value, onChangeText }: Props) => (
    <input
      aria-label={label as string}
      value={value as string}
      onChange={(e) => (onChangeText as (v: string) => void)(e.target.value)}
    />
  ),
}))
vi.mock('@/lib/queries/tunnel-routes', () => ({
  useOriginCertificates: () => state.issued,
  useExistingOriginCertificates: (_org: string, _carrier: string, zone: string) => {
    state.askedZone.push(zone)
    return state.existing
  },
}))

const issued = (extra: Partial<OriginCertificateRecord> = {}): OriginCertificateRecord => ({
  id: 'tls1',
  carrierId: 'c1',
  zone: 'example.com',
  names: ['app.example.com'],
  scope: 'names',
  retired: false,
  notAfter: '2027-10-29T00:00:00.000Z',
  status: 'ready',
  createdAt: '2026-10-29T00:00:00.000Z',
  inUse: false,
  renewalDue: false,
  ...extra,
})

const existing = (
  extra: Partial<ExistingOriginCertificateRecord> = {}
): ExistingOriginCertificateRecord => ({
  externalId: 'x1',
  hostnames: ['made-elsewhere.example.com'],
  notAfter: '2027-10-29T00:00:00.000Z',
  issuedHere: false,
  tlsId: null,
  retired: false,
  wildcard: false,
  note: 'Created outside TurboPanel. The private key stays with whoever made it.',
  ...extra,
})

beforeEach(() => {
  state.issued = { data: { originCertificates: [] }, isLoading: false, isError: false }
  state.existing = { data: undefined, isError: false, isFetching: false }
  state.askedZone = []
})
afterEach(cleanup)

describe('the origin certificates of a Cloudflare account', () => {
  it('says plainly that none were issued yet', () => {
    render(<NetworkOriginCertificates orgId="o1" carrierId="c1" />)
    expect(screen.getByText('TurboPanel has not issued any certificates yet.')).toBeTruthy()
  })

  it('lists exact names, marks a wildcard, and hides a replaced certificate nothing uses', () => {
    state.issued.data = {
      originCertificates: [
        issued({ names: ['a.example.com', 'b.example.com', 'c.example.com', 'd.example.com'] }),
        issued({
          id: 'tls2',
          names: ['example.com', '*.example.com'],
          scope: 'wildcard',
          inUse: true,
        }),
        issued({ id: 'tls3', names: ['old.example.com'], retired: true }),
        issued({ id: 'tls4', names: ['kept.example.com'], retired: true, inUse: true }),
      ],
    }
    render(<NetworkOriginCertificates orgId="o1" carrierId="c1" />)
    expect(screen.getByText('a.example.com, b.example.com, c.example.com and 1 more')).toBeTruthy()
    expect(screen.getByText('Wildcard')).toBeTruthy()
    expect(screen.queryByText('old.example.com')).toBeNull()
    // A replaced certificate a site still uses stays visible, with the reason.
    expect(screen.getByText('kept.example.com')).toBeTruthy()
    expect(screen.getByText('Replaced')).toBeTruthy()
    expect(screen.getByText(/revoked once no site uses it/)).toBeTruthy()
  })

  it('shows a loading line, and a plain error when the list cannot be loaded', () => {
    state.issued = { data: undefined, isLoading: true, isError: false }
    render(<NetworkOriginCertificates orgId="o1" carrierId="c1" />)
    expect(screen.getByText('Loading certificates…')).toBeTruthy()
    cleanup()
    state.issued = { data: undefined, isLoading: false, isError: true, error: new Error('x') }
    render(<NetworkOriginCertificates orgId="o1" carrierId="c1" />)
    expect(screen.getByRole('alert').textContent).toBe('Failed to load certificates')
  })

  it('looks a zone up only when asked, and explains a certificate made elsewhere', () => {
    const view = render(<NetworkOriginCertificates orgId="o1" carrierId="c1" />)
    const lookUp = screen.getByText('Look Up') as HTMLButtonElement
    expect(lookUp.disabled).toBe(true)
    fireEvent.change(screen.getByLabelText('Zone'), { target: { value: ' Example.COM ' } })
    expect(state.askedZone.at(-1)).toBe('')
    state.existing = {
      data: {
        zone: 'example.com',
        certificates: [
          existing(),
          existing({
            externalId: 'x2',
            issuedHere: true,
            wildcard: true,
            note: 'Issued by TurboPanel.',
          }),
        ],
      },
      isError: false,
      isFetching: false,
    }
    fireEvent.click(screen.getByText('Look Up'))
    view.rerender(<NetworkOriginCertificates orgId="o1" carrierId="c1" />)
    expect(state.askedZone.at(-1)).toBe('example.com')
    expect(screen.getByText('Created Elsewhere')).toBeTruthy()
    expect(screen.getByText('Issued Here')).toBeTruthy()
    expect(screen.getByText(/private key stays with whoever made it/)).toBeTruthy()
  })

  it('says when Cloudflare holds nothing for the zone', () => {
    state.existing = {
      data: { zone: 'example.com', certificates: [] },
      isError: false,
      isFetching: false,
    }
    render(<NetworkOriginCertificates orgId="o1" carrierId="c1" />)
    fireEvent.change(screen.getByLabelText('Zone'), { target: { value: 'example.com' } })
    fireEvent.click(screen.getByText('Look Up'))
    expect(screen.getByText('Cloudflare holds no certificates for example.com.')).toBeTruthy()
  })

  it('shows a lookup refusal in plain words', () => {
    state.existing = {
      data: undefined,
      isError: true,
      isFetching: false,
      error: new Error('HTTP 400: badge_cannot_certify'),
    }
    render(<NetworkOriginCertificates orgId="o1" carrierId="c1" />)
    expect(screen.getByRole('alert').textContent).toMatch(/can manage certificates for that zone/)
  })
})
