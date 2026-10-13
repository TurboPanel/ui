// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { OrgPrincipalRecord } from '@/lib/instance-api'
import { OrgPrincipalsTab } from './org-principals-tab'

const state = vi.hoisted(() => ({
  query: { isLoading: false, error: null as Error | null, data: undefined as unknown },
  mutate: vi.fn(),
  canManage: true,
}))

vi.mock('react-native', async () => (await import('@/components/ui/v4/rn-stub')).reactNativeStub)
vi.mock('react-native-svg', async () => (await import('@/components/ui/v4/rn-stub')).svgStub)
vi.mock(
  '@/lib/theme-preference',
  async () => (await import('@/components/ui/v4/rn-stub')).themePreferenceStub
)
vi.mock('@/components/ui/panel-styles', () => ({
  panelStyles: { muted: {}, error: {}, detailLine: {} },
}))
vi.mock('@/components/org/principal-defaults-settings-section', () => ({
  PrincipalDefaultsSettingsSection: () => <div>Principal names panel</div>,
}))
vi.mock('@/lib/query-client', () => ({ useCan: () => state.canManage }))
vi.mock('@/lib/queries/org-principals', () => ({
  useOrgPrincipals: () => state.query,
  useDeleteOrgPrincipal: () => ({
    mutate: state.mutate,
    isPending: false,
    variables: undefined,
    actionError: null,
  }),
}))
vi.mock('@/components/ui', () => {
  const passthrough = ({ children }: { children?: unknown }) => <div>{children as never}</div>
  return {
    Badge: ({ label }: { label: string }) => <span>{label}</span>,
    ConfirmButton: ({ label, onConfirm }: { label: string; onConfirm: () => void }) => (
      <button onClick={onConfirm}>{label}</button>
    ),
    DataTable: passthrough,
    DataTableCell: passthrough,
    DataTableEmpty: passthrough,
    DataTableRow: passthrough,
    InlineNotice: ({ title }: { title: string }) => <strong>{title}</strong>,
    LoadingState: ({ label }: { label?: string }) => <div>{label}</div>,
    MonoText: ({ children }: { children?: unknown }) => <code>{children as never}</code>,
    SectionPanel: ({ title, children }: { title?: string; children?: unknown }) => (
      <section>
        <h2>{title}</h2>
        {children as never}
      </section>
    ),
  }
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  state.query = { isLoading: false, error: null, data: undefined }
  state.canManage = true
})

function row(patch: Partial<OrgPrincipalRecord>): OrgPrincipalRecord {
  return {
    id: 'p1',
    name: 'shop',
    appliedUsername: 'shop_abc',
    kind: 'system',
    provider: 'server',
    forms: ['system'],
    projectId: null,
    projectName: null,
    servers: [
      { serverId: 's1', serverName: 'Alpha', state: 'present', uid: 15001, gid: 15001 },
    ],
    logins: [],
    usedBy: { tenancies: 0, bindings: 0, storages: 0, secrets: 0, logins: 0 },
    state: 'present',
    orphaned: true,
    canDelete: true,
    createdAt: '2026-10-13T00:00:00.000Z',
    ...patch,
  }
}

describe('OrgPrincipalsTab', () => {
  it('defines a principal once and keeps the name scheme panel on the tab', () => {
    state.query.data = { principals: [] }
    render(<OrgPrincipalsTab orgId="org-1" />)
    expect(screen.getByText(/A principal is an account responsible for the contents/)).toBeTruthy()
    expect(screen.getByText('Principal names panel')).toBeTruthy()
    expect(screen.getByText(/No principals yet/)).toBeTruthy()
  })

  it('lists principals and deletes one a project left behind', () => {
    state.query.data = {
      principals: [
        row({}),
        row({
          id: 'p2',
          name: 'kept',
          appliedUsername: 'kept',
          projectId: 'proj',
          projectName: 'Shop site',
          orphaned: false,
          canDelete: false,
        }),
      ],
    }
    render(<OrgPrincipalsTab orgId="org-1" />)
    expect(screen.getByText('Left behind')).toBeTruthy()
    expect(screen.getByText('Project Shop site')).toBeTruthy()
    expect(screen.getByText('Belongs to the project Shop site. Remove it from that project.')).toBeTruthy()
    fireEvent.click(screen.getByText('Delete'))
    expect(state.mutate).toHaveBeenCalledWith('p1')
  })

  it('shows a load error without the table', () => {
    state.query.error = new Error('nope')
    render(<OrgPrincipalsTab orgId="org-1" />)
    expect(screen.getByText('Could not load principals')).toBeTruthy()
  })

  it('tells members without manager rights the list is for managers', () => {
    state.canManage = false
    render(<OrgPrincipalsTab orgId="org-1" />)
    expect(screen.getByText(/Only organization owners and managers/)).toBeTruthy()
  })

  it('asks a shorter question when the principal is on no server', () => {
    state.query.data = { principals: [row({ servers: [], state: 'none' })] }
    render(<OrgPrincipalsTab orgId="org-1" />)
    expect(screen.getByText('Linux name shop_abc')).toBeTruthy()
  })
})
