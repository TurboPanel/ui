// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DnsCertificate } from '@/lib/instance-api'
import { NO_RENEWAL_MESSAGE, ORDERING_OFF_MESSAGE } from '@/lib/dns-certificates'
import { DnsCertificatePanel } from './dns-certificate-panel'

type Props = Readonly<Record<string, unknown> & { children?: ReactNode }>

const state = vi.hoisted(() => ({ certificates: [] as unknown[] }))

vi.mock('react-native', async () => (await import('@/components/ui/v4/rn-stub')).reactNativeStub)
vi.mock('@/components/ui/panel-styles', () => ({ panelStyles: {} }))
vi.mock('@/components/ui', () => ({
  Badge: ({ label }: Props) => <span data-testid="badge">{label as string}</span>,
  EmptyState: ({ title }: Props) => <p>{title as string}</p>,
  LoadingState: ({ label }: Props) => <p>{label as string}</p>,
  SectionPanel: ({ title, hint, children }: Props) => (
    <section>
      <h2>{title as string}</h2>
      {hint ? <span>{hint as string}</span> : null}
      {children}
    </section>
  ),
}))
vi.mock('@/lib/queries/dns-certificates', () => ({
  useDnsCertificates: () => ({
    data: { certificates: state.certificates },
    isLoading: false,
    isError: false,
  }),
}))

const cert = (extra: Partial<DnsCertificate> = {}): DnsCertificate => ({
  id: 'c1',
  names: ['app.example.com'],
  wildcard: false,
  status: 'ready',
  stage: 'issued',
  staging: false,
  lastError: null,
  warning: NO_RENEWAL_MESSAGE,
  attempts: 0,
  nextAttemptAt: null,
  renewAt: null,
  notAfter: '2027-01-01T00:00:00Z',
  issuer: null,
  createdAt: '2026-10-28T00:00:00Z',
  updatedAt: '2026-10-28T00:00:00Z',
  ...extra,
})

beforeEach(() => {
  state.certificates = []
})
afterEach(cleanup)

describe('ordering is turned off', () => {
  it('says why in place of the order form, with nothing to press', () => {
    render(<DnsCertificatePanel orgId="o1" />)
    expect(screen.getByText('Order A Certificate')).toBeTruthy()
    expect(screen.getByText('Turned off')).toBeTruthy()
    expect(screen.getByText(ORDERING_OFF_MESSAGE)).toBeTruthy()
    expect(screen.queryAllByRole('button')).toEqual([])
    expect(screen.queryByText('Order Certificate')).toBeNull()
  })
})

describe('the certificates already ordered', () => {
  it('lists an issued one with its expiry and says it will not renew, once', () => {
    state.certificates = [cert()]
    render(<DnsCertificatePanel orgId="o1" />)
    expect(screen.getByText('app.example.com')).toBeTruthy()
    expect(screen.getByText('Ready')).toBeTruthy()
    expect(screen.getByText(/^Expires /)).toBeTruthy()
    expect(screen.getAllByText(NO_RENEWAL_MESSAGE)).toHaveLength(1)
  })

  it('says it will not renew even when the panel sends no note', () => {
    state.certificates = [cert({ warning: null })]
    render(<DnsCertificatePanel orgId="o1" />)
    expect(screen.getAllByText(NO_RENEWAL_MESSAGE)).toHaveLength(1)
  })

  it('does not say it keeps working on a certificate that is not in use', () => {
    state.certificates = [
      cert({ status: 'pending', stage: 'queued', notAfter: null }),
      cert({ id: 'c2', status: 'expired' }),
      cert({ id: 'c3', status: 'failed', stage: 'failed' }),
    ]
    render(<DnsCertificatePanel orgId="o1" />)
    expect(screen.queryByText(NO_RENEWAL_MESSAGE)).toBeNull()
  })

  it('an older panel that still renews is not described as stopped', () => {
    state.certificates = [
      cert({ warning: null, renewAt: '2026-12-01T00:00:00Z' }),
      cert({
        id: 'c2',
        status: 'pending',
        stage: 'backoff',
        warning: null,
        nextAttemptAt: '2026-11-05T00:00:00Z',
      }),
    ]
    render(<DnsCertificatePanel orgId="o1" />)
    expect(screen.queryByText(NO_RENEWAL_MESSAGE)).toBeNull()
    expect(screen.queryByText('Stopped')).toBeNull()
    expect(screen.getByText('Ordering.')).toBeTruthy()
  })

  it('marks an order left open as stopped, with no Check Now or Try Again', () => {
    state.certificates = [
      cert({
        status: 'pending',
        stage: 'validating',
        staging: true,
        notAfter: null,
        warning: null,
      }),
      cert({ id: 'c2', status: 'failed', stage: 'failed', lastError: 'No matching record.' }),
    ]
    render(<DnsCertificatePanel orgId="o1" />)
    expect(screen.getByText('Stopped')).toBeTruthy()
    expect(screen.getByText('This order was stopped and will not finish.')).toBeTruthy()
    expect(screen.getByText('Test Certificate')).toBeTruthy()
    expect(screen.getByText(/The last try failed: No matching record\./)).toBeTruthy()
    expect(screen.queryByText('Check Now')).toBeNull()
    expect(screen.queryByText('Try Again')).toBeNull()
  })

  it('shows a warning about the certificate itself', () => {
    state.certificates = [cert({ warning: 'No API Token can edit DNS for example.com any more.' })]
    render(<DnsCertificatePanel orgId="o1" />)
    expect(screen.getByText(/No API Token can edit DNS for example.com any more\./)).toBeTruthy()
  })

  it('has an empty line when nothing was ordered', () => {
    render(<DnsCertificatePanel orgId="o1" />)
    expect(screen.getByText('No certificates ordered here yet.')).toBeTruthy()
  })
})
