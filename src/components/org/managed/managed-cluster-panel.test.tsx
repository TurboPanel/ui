// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ManagedMemberRecord } from '@/lib/managed-services'
import { MANAGED_FAILOVER_UNSUPPORTED_REASON } from '@/lib/managed-releases'
import { ManagedClusterPanel } from './managed-cluster-panel'

vi.mock('react-native', async () => (await import('@/components/ui/v4/rn-stub')).reactNativeStub)
vi.mock('react-native-svg', async () => (await import('@/components/ui/v4/rn-stub')).svgStub)
vi.mock('@/lib/theme-preference', async () => (await import('@/components/ui/v4/rn-stub')).themePreferenceStub)
vi.mock('@/components/ui/panel-styles', () => ({ panelStyles: {} }))
vi.mock('expo-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/components/ui', () => ({
  SectionPanel: ({ children }: { children?: unknown }) => <div>{children as never}</div>,
  ButtonRow: ({ children }: { children?: unknown }) => <div>{children as never}</div>,
  Button: ({
    label,
    disabled,
    onPress,
  }: {
    label: string
    disabled?: boolean
    onPress?: () => void
  }) => (
    <button disabled={disabled} onClick={onPress}>
      {label}
    </button>
  ),
  ConfirmButton: ({ label, disabled }: { label: string; disabled?: boolean }) => (
    <button disabled={disabled}>{label}</button>
  ),
  Checkbox: () => null,
  EmptyState: () => null,
  SegmentedControl: () => null,
  TextField: () => null,
}))
vi.mock('@/components/org/managed/refresh-health-row', () => ({
  RefreshHealthRow: () => null,
}))
vi.mock('@/lib/queries/servers', () => ({
  useOrgServers: () => ({ data: { servers: [] } }),
}))
vi.mock('@/lib/queries/topology', () => ({
  useDatacenters: () => ({ data: { datacenters: [] } }),
}))
vi.mock('@/lib/queries/fabric', () => ({
  useOrgFabric: () => ({ data: { relays: [] } }),
}))
vi.mock('@/lib/queries/managed', () => ({
  useAddManagedReplica: () => ({ mutateAsync: vi.fn() }),
  usePromoteManagedDisasterRecovery: () => ({ mutateAsync: vi.fn() }),
  usePromoteManagedMember: () => ({ mutateAsync: vi.fn() }),
  useResyncManagedMember: () => ({ mutateAsync: vi.fn() }),
  useRemoveManagedMember: () => ({ mutateAsync: vi.fn() }),
  useUpdateManagedMemberReadEligible: () => ({ mutateAsync: vi.fn() }),
  useUpdateManagedMemberReplicaClass: () => ({ mutateAsync: vi.fn() }),
}))

afterEach(cleanup)

function member(
  partial: Pick<ManagedMemberRecord, 'id' | 'serverId' | 'role'> &
    Partial<ManagedMemberRecord>,
): ManagedMemberRecord {
  return {
    serverName: partial.serverId,
    replicaClass: partial.role === 'replica' ? 'read' : null,
    readEligible: partial.role === 'replica',
    ordinal: 1,
    status: 'running',
    replicationTransport: 'local',
    privatePort: 45000,
    ...partial,
  }
}

const members: ManagedMemberRecord[] = [
  member({ id: 'm1', serverId: 'srv-1', role: 'primary', replicaClass: null, ordinal: 0 }),
  member({ id: 'm2', serverId: 'srv-2', role: 'replica', replicaClass: 'read', ordinal: 1 }),
]

function renderPanel(engine: string, series: string) {
  render(
    <ManagedClusterPanel
      orgId="org-1"
      environmentId="env-1"
      members={members}
      managedDisplayName="shop-db"
      engine={engine}
      imageOrSeries={series}
      canManage
      busy={false}
      onRegisterCommand={vi.fn()}
    />,
  )
}

describe('managed cluster failover capability', () => {
  it('disables add replica and convert on MariaDB 12.3 and shows the note', () => {
    renderPanel('mariadb', '12.3')
    expect(screen.getAllByText(MANAGED_FAILOVER_UNSUPPORTED_REASON).length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: 'Add replica' })).toHaveProperty('disabled', true)
    expect(screen.getByRole('button', { name: 'Convert to failover' })).toHaveProperty(
      'disabled',
      true,
    )
  })

  it('leaves add replica and convert enabled on MariaDB 11.8', () => {
    renderPanel('mariadb', '11.8')
    expect(screen.queryByText(MANAGED_FAILOVER_UNSUPPORTED_REASON)).toBeNull()
    expect(screen.getByRole('button', { name: 'Add replica' })).toHaveProperty('disabled', false)
    expect(screen.getByRole('button', { name: 'Convert to failover' })).toHaveProperty(
      'disabled',
      false,
    )
  })
})
