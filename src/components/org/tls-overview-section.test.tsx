// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { TlsRecord } from '@/lib/instance-api'

const state = vi.hoisted(() => ({
  deleteRun: vi.fn(),
  createRun: vi.fn(),
  rows: [] as TlsRecord[],
}))

vi.mock('react-native', async () => (await import('@/components/ui/v4/rn-stub')).reactNativeStub)
vi.mock('react-native-svg', async () => (await import('@/components/ui/v4/rn-stub')).svgStub)
vi.mock(
  '@/lib/theme-preference',
  async () => (await import('@/components/ui/v4/rn-stub')).themePreferenceStub
)
vi.mock('@/components/ui/panel-styles', () => ({ panelStyles: {} }))
vi.mock('@/components/org/organization-ca-panel', () => ({ OrganizationCaPanel: () => null }))
vi.mock('@/components/ui', () => ({
  Button: ({ label, onPress }: { label: string; onPress?: () => void }) => (
    <button onClick={onPress}>{label}</button>
  ),
  // Confirms on the first press: the two-step confirm has its own tests.
  ConfirmButton: ({ confirmLabel, onConfirm }: { confirmLabel: string; onConfirm: () => void }) => (
    <button onClick={onConfirm}>{confirmLabel}</button>
  ),
  EmptyState: () => null,
  LoadingState: () => null,
  SectionPanel: ({ children }: { children?: unknown }) => <div>{children as never}</div>,
  SegmentedControl: () => null,
  SettingRow: ({ children }: { children?: unknown }) => <div>{children as never}</div>,
  TextField: () => null,
  Toggle: () => null,
}))
vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ data: { acmeEnabled: true }, isLoading: false, isError: false }),
  useQueryClient: () => ({ setQueryData: vi.fn() }),
}))
vi.mock('@/lib/query-client', () => ({
  useApiMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useCan: () => true,
  queryKeys: { org: () => ({ settings: { tlsSettings: ['tls-settings'] } }) },
}))
vi.mock('@/lib/tls-managed-dates', () => ({ tlsDateLines: () => [], tlsStoredCopyLines: () => [] }))

const certificate = (id: string, name: string, source = 'lets_encrypt'): TlsRecord =>
  ({
    id,
    name,
    source,
    metadata: { status: 'automatic', dnsNames: [name] },
  }) as unknown as TlsRecord

vi.mock('@/lib/queries/tls', () => ({
  useTlsLibrary: () => ({
    data: { tls: state.rows },
    isLoading: false,
    isError: false,
  }),
  useCreateTlsCertificate: () => ({ run: state.createRun, isPending: false, isSuccess: false }),
  useDeleteTlsCertificate: () => ({ run: state.deleteRun, isPending: false, variables: undefined }),
}))

import { TlsOverviewSection } from './tls-overview-section'

beforeEach(() => {
  state.rows = [certificate('t1', 'one.example'), certificate('t2', 'two.example')]
  state.deleteRun = vi.fn(() => Promise.resolve({ ok: true, value: {} }))
  state.createRun = vi.fn(() => Promise.resolve({ ok: true, value: {} }))
})
afterEach(cleanup)

describe('TlsOverviewSection delete', () => {
  it('says why a delete failed on that certificate, even on the first failure', async () => {
    state.deleteRun = vi.fn(() =>
      Promise.resolve({ ok: false, error: 'This certificate is still pinned by a hosting.' })
    )
    render(<TlsOverviewSection orgId="o1" />)
    const [, second] = screen.getAllByText('Delete certificate')
    fireEvent.click(second as HTMLElement)
    const message = await screen.findByText('This certificate is still pinned by a hosting.')
    expect(state.deleteRun).toHaveBeenCalledWith('t2')
    expect(message.parentElement?.textContent).toContain('two.example')
    expect(message.parentElement?.textContent).not.toContain('one.example')
  })

  it('offers no Delete on the Organization CA and points to Rotate instead', () => {
    state.rows = [
      certificate('ca', 'Company root', 'organization_ca'),
      certificate('t2', 'two.example'),
    ]
    render(<TlsOverviewSection orgId="o1" />)
    expect(screen.getAllByText('Delete certificate')).toHaveLength(1)
    const hint = screen.getByText('Replace it with Rotate on the Organization CA panel.')
    expect(hint.parentElement?.textContent).toContain('Company root')
    expect(hint.parentElement?.textContent).not.toContain('two.example')
  })

  it('says why a new certificate was not added, under Add certificate', async () => {
    state.createRun = vi.fn(() => Promise.resolve({ ok: false, error: 'Bad PEM.' }))
    render(<TlsOverviewSection orgId="o1" />)
    fireEvent.click(screen.getByText('Add certificate'))
    const message = await screen.findByText('Bad PEM.')
    expect(message.previousElementSibling?.textContent).toBe('Add certificate')
  })
})
