// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { OrganizationCaLeaf } from '@/lib/instance-api'
import {
  leafFactsLine,
  MARK_STALE_PROMPT,
  leafOwnerLabel,
  OrganizationCaLeavesSection,
  renewalNotice,
  retireByNotice,
} from './organization-ca-leaves'

type MutationOptions = { onSuccess?: (value: unknown) => void; onError?: (err: unknown) => void }

const state = vi.hoisted(() => ({
  leaves: { data: undefined as unknown, isError: false, error: null as unknown },
  renew: { mutate: vi.fn() },
  stale: { mutate: vi.fn() },
  remove: { mutate: vi.fn() },
}))

vi.mock('react-native', async () => (await import('@/components/ui/v4/rn-stub')).reactNativeStub)
vi.mock('react-native-svg', async () => (await import('@/components/ui/v4/rn-stub')).svgStub)
vi.mock(
  '@/lib/theme-preference',
  async () => (await import('@/components/ui/v4/rn-stub')).themePreferenceStub
)
vi.mock('@/components/ui/panel-styles', () => ({
  panelStyles: { muted: {}, error: {}, detailCard: {}, detailTitle: {} },
}))
vi.mock('@/lib/queries/tls', () => ({
  useOrganizationCaLeaves: () => state.leaves,
  useRenewOrganizationCaLeaf: () => state.renew,
  useMarkOrganizationCaLeafStale: () => state.stale,
  useDeleteOrganizationCaLeaf: () => state.remove,
}))
vi.mock('@/components/ui', () => ({
  Badge: ({ label }: { label: string }) => <span>{label}</span>,
  Button: ({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) => (
    <button disabled={disabled} onClick={onPress}>
      {label}
    </button>
  ),
  ConfirmButton: ({
    label,
    onConfirm,
    disabled,
    prompt,
  }: {
    label: string
    onConfirm: () => void
    disabled?: boolean
    prompt?: string
  }) => (
    <button disabled={disabled} data-prompt={prompt} onClick={onConfirm}>
      {label}
    </button>
  ),
}))

function leaf(overrides: Partial<OrganizationCaLeaf> = {}): OrganizationCaLeaf {
  return {
    id: 'leaf-1',
    kind: 'ingress',
    state: 'due',
    reason: 'Still signed by a previous Organization CA generation.',
    serverId: 'srv-1',
    serverName: 'Frankfurt 1',
    managedId: null,
    managedName: null,
    environmentId: null,
    environmentName: null,
    projectName: null,
    caGeneration: 1,
    notAfter: '2027-01-01T00:00:00.000Z',
    issuedAt: '2026-10-01T00:00:00.000Z',
    attempts: 0,
    attemptedAt: null,
    lastError: null,
    staleAt: null,
    staleReason: null,
    ...overrides,
  }
}

function listing(leaves: OrganizationCaLeaf[], truncated = false) {
  return {
    leaves,
    dueCount: leaves.filter((row) => row.state === 'due').length,
    staleCount: leaves.filter((row) => row.state === 'stale').length,
    caGeneration: 2,
    truncated,
  }
}

beforeEach(() => {
  state.leaves = { data: listing([leaf()]), isError: false, error: null }
  state.renew.mutate = vi.fn()
  state.stale.mutate = vi.fn()
  state.remove.mutate = vi.fn()
})

afterEach(() => {
  cleanup()
})

describe('leaf wording helpers', () => {
  it('names what the certificate belongs to', () => {
    expect(leafOwnerLabel(leaf())).toBe('Database connections on Frankfurt 1')
    expect(leafOwnerLabel(leaf({ serverName: null }))).toBe('Database connections on a server')
    expect(
      leafOwnerLabel(
        leaf({
          kind: 'engine',
          managedName: 'orders',
          projectName: 'Shop',
          environmentName: 'Production',
        })
      )
    ).toBe('orders (Shop · Production) on Frankfurt 1')
    expect(leafOwnerLabel(leaf({ kind: 'engine', managedName: null }))).toBe(
      'A database cluster on Frankfurt 1'
    )
  })

  it('gives the expiry and how renewal has gone', () => {
    expect(leafFactsLine(leaf())).toMatch(/^Expires /)
    expect(leafFactsLine(leaf({ attempts: 1 }))).toMatch(/renewal tried once$/)
    expect(leafFactsLine(leaf({ attempts: 3, attemptedAt: '2026-10-18T10:00:00.000Z' }))).toMatch(
      /renewal tried 3 times, last /
    )
    expect(
      leafFactsLine(leaf({ state: 'stale', staleAt: '2026-10-10T00:00:00.000Z', attempts: 5 }))
    ).toMatch(/marked stale /)
  })

  it('explains each renewal outcome in plain words', () => {
    expect(renewalNotice({ ok: true, outcome: 'queued', reason: null })).toMatch(/queued/)
    expect(renewalNotice({ ok: true, outcome: 'stale', reason: 'Nothing here uses it.' })).toBe(
      'Nothing here uses it.'
    )
    expect(renewalNotice({ ok: true, outcome: 'stale', reason: null })).toMatch(/marked stale/)
    expect(renewalNotice({ ok: true, outcome: 'failed', reason: 'Server is offline.' })).toBe(
      'Server is offline.'
    )
    expect(renewalNotice({ ok: true, outcome: 'failed', reason: null })).toMatch(/could not be queued/)
    expect(renewalNotice({ ok: true, outcome: 'skipped', reason: null })).toMatch(/already being handled/)
  })

  it('says when the previous CA retires on its own', () => {
    expect(retireByNotice(null)).toBeNull()
    expect(retireByNotice(undefined)).toBeNull()
    expect(retireByNotice('2026-11-18T00:00:00.000Z')).toMatch(/retired on its own after/)
  })
})

describe('OrganizationCaLeavesSection', () => {
  it('warns that a server which still uses the certificate will lose trust', () => {
    render(<OrganizationCaLeavesSection orgId="org-1" canManage />)
    expect(MARK_STALE_PROMPT).toMatch(/stop being trusted once the previous Organization CA is retired/)
    expect(screen.getByText('Mark stale').getAttribute('data-prompt')).toBe(MARK_STALE_PROMPT)
  })

  it('lists each certificate with its owner, reason and last failure', () => {
    state.leaves = {
      data: listing([
        leaf({ lastError: 'The renewal could not be sent to the server.', attempts: 2 }),
        leaf({
          id: 'leaf-2',
          state: 'stale',
          staleAt: '2026-10-10T00:00:00.000Z',
          staleReason: 'The server has been offline since 2026-09-01.',
          serverName: 'Old box',
        }),
      ]),
      isError: false,
      error: null,
    }
    render(<OrganizationCaLeavesSection orgId="org-1" canManage />)
    expect(screen.getByText('Certificates that need attention')).toBeTruthy()
    expect(screen.getByText('Database connections on Frankfurt 1')).toBeTruthy()
    expect(screen.getByText('Still signed by a previous Organization CA generation.')).toBeTruthy()
    expect(screen.getByText('The renewal could not be sent to the server.')).toBeTruthy()
    expect(screen.getByText('Needs renewal')).toBeTruthy()
    expect(screen.getByText('Stale')).toBeTruthy()
    expect(screen.getByText('The server has been offline since 2026-09-01.')).toBeTruthy()
    // A stale certificate cannot be marked stale again.
    expect(screen.getAllByText('Mark stale')).toHaveLength(1)
    expect(screen.getAllByText('Renew now')).toHaveLength(2)
    expect(screen.getAllByText('Delete record')).toHaveLength(2)
  })

  it('renews now and shows what happened', () => {
    state.renew.mutate = vi.fn((_id: string, options: MutationOptions) =>
      options.onSuccess?.({ ok: true, outcome: 'queued', reason: null })
    )
    render(<OrganizationCaLeavesSection orgId="org-1" canManage />)
    fireEvent.click(screen.getByText('Renew now'))
    expect(state.renew.mutate.mock.calls[0]?.[0]).toBe('leaf-1')
    expect(screen.getByText(/Renewal queued/)).toBeTruthy()
  })

  it('marks stale and deletes, and shows a refusal in plain words', () => {
    state.stale.mutate = vi.fn((_id: string, options: MutationOptions) => options.onSuccess?.({ ok: true }))
    state.remove.mutate = vi.fn((_id: string, options: MutationOptions) =>
      options.onError?.(new Error('Request failed'))
    )
    render(<OrganizationCaLeavesSection orgId="org-1" canManage />)
    fireEvent.click(screen.getByText('Mark stale'))
    expect(state.stale.mutate.mock.calls[0]?.[0]).toBe('leaf-1')
    fireEvent.click(screen.getByText('Delete record'))
    expect(state.remove.mutate.mock.calls[0]?.[0]).toBe('leaf-1')
    expect(screen.getByText(/Request failed|Could not delete the record/)).toBeTruthy()
  })

  it('shows a failed renew and a failed mark-stale as errors', () => {
    state.renew.mutate = vi.fn((_id: string, options: MutationOptions) =>
      options.onError?.(new Error('Request failed'))
    )
    state.stale.mutate = vi.fn((_id: string, options: MutationOptions) =>
      options.onError?.(new Error('Request failed'))
    )
    render(<OrganizationCaLeavesSection orgId="org-1" canManage />)
    fireEvent.click(screen.getByText('Renew now'))
    expect(screen.getByText(/Request failed|Could not renew this certificate/)).toBeTruthy()
    fireEvent.click(screen.getByText('Mark stale'))
    expect(screen.getByText(/Request failed|Could not mark it stale/)).toBeTruthy()
  })

  it('hides the actions from someone who cannot manage the organization', () => {
    render(<OrganizationCaLeavesSection orgId="org-1" canManage={false} />)
    expect(screen.getByText('Database connections on Frankfurt 1')).toBeTruthy()
    expect(screen.queryByText('Renew now')).toBeNull()
    expect(screen.queryByText('Delete record')).toBeNull()
  })

  it('says when more need attention than the list shows', () => {
    state.leaves = { data: listing([leaf()], true), isError: false, error: null }
    render(<OrganizationCaLeavesSection orgId="org-1" canManage />)
    expect(screen.getByText(/More certificates need attention/)).toBeTruthy()
  })

  it('shows only the retire deadline when nothing needs attention', () => {
    state.leaves = { data: listing([]), isError: false, error: null }
    render(<OrganizationCaLeavesSection orgId="org-1" canManage retireBy="2026-11-18T00:00:00.000Z" />)
    expect(screen.queryByText('Certificates that need attention')).toBeNull()
    expect(screen.getByText(/retired on its own after/)).toBeTruthy()
  })

  it('renders nothing when there is nothing to say', () => {
    state.leaves = { data: listing([]), isError: false, error: null }
    const { container } = render(<OrganizationCaLeavesSection orgId="org-1" canManage />)
    expect(container.textContent).toBe('')
  })

  it('says so when the list cannot be loaded', () => {
    state.leaves = { data: undefined, isError: true, error: new Error('Request failed') }
    render(<OrganizationCaLeavesSection orgId="org-1" canManage />)
    expect(screen.getByText(/Request failed|Could not load the certificate list/)).toBeTruthy()
  })
})
