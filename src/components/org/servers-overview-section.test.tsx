// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { OrgServerRecord } from '@/lib/instance-api'
import { ServersOverviewSection } from './servers-overview-section'

const { useAuth, useOrgServers, compactChrome } = vi.hoisted(() => ({
  useAuth: vi.fn(),
  useOrgServers: vi.fn(),
  compactChrome: { current: false },
}))

vi.mock('react-native', async () => (await import('@/components/ui/v4/rn-stub')).reactNativeStub)
vi.mock('react-native-svg', async () => (await import('@/components/ui/v4/rn-stub')).svgStub)
vi.mock(
  '@/lib/theme-preference',
  async () => (await import('@/components/ui/v4/rn-stub')).themePreferenceStub
)

vi.mock('@/lib/auth-context', () => ({ useAuth }))
vi.mock('@/lib/query-client', () => ({
  useCan: () => false,
  queryKeys: { org: () => ({ servers: { list: ['servers'] } }) },
}))
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries: vi.fn() }) }))
vi.mock('expo-router', () => ({
  useRouter: () => ({ push: vi.fn(), setParams: vi.fn() }),
  useLocalSearchParams: () => ({}),
}))

const idle = { data: undefined, isLoading: false, isError: false, refetch: vi.fn() }
vi.mock('@/lib/queries/fabric', () => ({ useOrgFabric: () => idle }))
vi.mock('@/lib/queries/servers', () => ({
  SERVERS_REFRESH_MS: 1000,
  useOrgServers,
  useServersUpdateStatus: () => idle,
  useOrgServerCapacity: () => idle,
  useOrgLicenses: () => idle,
  useFleetServerUsage: () => idle,
  useBatchTriggerServerUpdates: () => ({ isPending: false, variables: undefined, mutate: vi.fn() }),
}))
vi.mock('@/lib/servers-layout', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/servers-layout')>()),
  getStoredServersLayout: () => 'list',
  setStoredServersLayout: vi.fn(),
  usesCompactServersList: () => compactChrome.current,
}))
vi.mock('@/lib/pull-to-refresh', () => ({ usePullToRefresh: vi.fn() }))

vi.mock('@/components/org/add-server-wizard', () => ({ AddServerWizard: () => null }))
vi.mock('@/components/org/connection-status-dot', () => ({ ConnectionStatusDot: () => null }))
vi.mock('@/components/org/geo-location-lines', () => ({ GeoLocationLines: () => null }))
vi.mock('@/components/org/os-identity-mark', () => ({ OsIdentityMark: () => null }))
vi.mock('@/components/org/server-usage-bars', () => ({ ServerUsageBars: () => null }))
vi.mock('@/components/icons/nav-icons', () => ({ OverviewNavIcon: () => null }))
vi.mock('@/components/ui/panel-styles', () => ({ panelStyles: new Proxy({}, { get: () => ({}) }) }))

vi.mock('@/components/ui', async () => {
  const stub = (name: string) => {
    function Stub({ children }: { children?: unknown }) {
      return <div data-testid={name}>{children as never}</div>
    }
    return Stub
  }
  return new Proxy(
    {
      Badge: ({ label }: { label: string }) => <span data-testid="badge">{label}</span>,
      Checkbox: () => null,
      DataTable: ({
        columns,
        children,
      }: {
        columns: readonly { key: string; header: string }[]
        children?: unknown
      }) => (
        <div>
          {columns.map((column) => (
            <div key={column.key} data-testid="column-header">
              {column.header}
            </div>
          ))}
          {children as never}
        </div>
      ),
      DataTableCell: ({ column, children }: { column: { key: string }; children?: unknown }) => (
        <div data-testid={`cell-${column.key}`}>{children as never}</div>
      ),
      DataTableRow: stub('row'),
      EmptyState: () => null,
      LoadingState: () => null,
      SectionPanel: stub('panel'),
    } as Record<string, unknown>,
    // Any other UI piece the toolbar pulls in renders as an inert element.
    {
      get: (target, key) => {
        if (typeof key !== 'string' || key === 'then' || key === '__esModule') return undefined
        return target[key] ?? stub(key)
      },
    }
  )
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  compactChrome.current = false
})

function server(): OrgServerRecord {
  return {
    id: 'srv-1',
    name: 'web-1',
    organizationId: 'org-1',
    licenseId: 'lic-1',
    tierPlacement: {
      licenseTier: 'S4',
      requiredTier: 'S2',
      recommendedTier: 'S2',
      unwatched: { nics: 0, drives: 0, gpus: 0 },
      notice: null,
    },
    machineClass: null,
    layoutPaths: null,
    options: null,
    createdAt: '2026-01-01T00:00:00Z',
    connected: true,
    hostname: 'web-1',
    remoteAddress: null,
    address: null,
    addressSource: null,
    addressScope: null,
    addressInterface: null,
    geo: null,
    os: null,
    datacenters: [],
    labels: [],
  } as unknown as OrgServerRecord
}

function renderList(billingEnabled: boolean) {
  useAuth.mockReturnValue({ billingEnabled })
  useOrgServers.mockReturnValue({
    ...idle,
    data: { servers: [server()] },
  })
  return render(<ServersOverviewSection orgId="org-1" />)
}

describe('ServersOverviewSection tier display', () => {
  it('shows the Tier column and cell with the tier line when billing is enabled', () => {
    renderList(true)
    expect(screen.getAllByTestId('column-header').map((el) => el.textContent)).toContain('Tier')
    const cell = screen.getByTestId('cell-tier')
    expect(cell.textContent).toContain('S4')
  })

  it('hides the Tier column, cell and line on a self-hosted instance', () => {
    renderList(false)
    expect(screen.getAllByTestId('column-header').map((el) => el.textContent)).not.toContain('Tier')
    expect(screen.queryByTestId('cell-tier')).toBeNull()
    expect(screen.queryByText('S4')).toBeNull()
  })

  it('shows the tier line in the compact list when billing is enabled', () => {
    compactChrome.current = true
    renderList(true)
    expect(screen.getByText('S4')).toBeTruthy()
  })

  it('hides the tier line in the compact list on a self-hosted instance', () => {
    compactChrome.current = true
    renderList(false)
    expect(screen.queryByText('S4')).toBeNull()
  })
})
