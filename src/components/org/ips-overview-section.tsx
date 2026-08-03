import { useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { SectionPanel } from '@/components/org/section-panel'
import { orgPanelStyles, webPointer } from '@/components/org/org-panel-styles'
import type {
  DatacenterRecord,
  IpAllocation,
  IpRecord,
  IpScope,
  NetworkRecord,
  OrgServerRecord,
  VpnRecord,
} from '@/lib/instance-api'
import {
  useCreateIp,
  useDatacenters,
  useDeleteIp,
  useIps,
  useNetworks,
  useUpdateIp,
  useVpns,
} from '@/lib/queries/topology'
import { useOrgServers } from '@/lib/queries/servers'
import { useCan } from '@/lib/query-client'
import { chrome, colors, spacing } from '@/lib/theme'

const SCOPES: IpScope[] = ['public', 'datacenter', 'loopback', 'vpn']
const ALLOCATIONS: IpAllocation[] = ['dedicated', 'shared']

/** Simple client pre-check; server `ip-address.ts` is authoritative. */
const IP_LITERAL_OR_CIDR =
  /^(?:\d{1,3}(?:\.\d{1,3}){3}|\[[0-9a-fA-F:]+\]|[0-9a-fA-F:]+)(?:\/\d{1,3})?$/

function serverTitle(server: OrgServerRecord): string {
  return server.displayName?.trim() || server.hostname?.trim() || server.id
}

function FilterChip({
  label,
  active,
  onPress,
}: Readonly<{ label: string; active: boolean; onPress: () => void }>) {
  return (
    <Pressable
      style={[styles.chip, active && styles.chipActive, webPointer]}
      onPress={onPress}
    >
      <Text style={[styles.chipText, active && styles.chipTextActive]}>
        {label}
      </Text>
    </Pressable>
  )
}

function vpnTitle(vpn: VpnRecord): string {
  return vpn.displayName?.trim() || 'Unnamed VPN'
}

function buildIpListFilters(
  scopeFilter: IpScope | 'all',
  allocationFilter: IpAllocation | 'all',
  datacenterFilter: string,
): {
  scope?: IpScope
  allocation?: IpAllocation
  datacenterId?: string
} {
  const filters: {
    scope?: IpScope
    allocation?: IpAllocation
    datacenterId?: string
  } = {}
  if (scopeFilter !== 'all') filters.scope = scopeFilter
  if (allocationFilter !== 'all') filters.allocation = allocationFilter
  if (datacenterFilter) filters.datacenterId = datacenterFilter
  return filters
}

function resolveIpsQueryError(
  isError: boolean,
  error: unknown,
): string | null {
  if (!isError) return null
  if (error instanceof Error) return error.message
  return 'Failed to load IP addresses'
}

function isIpsOverviewLoading(queries: Readonly<{
  ipsLoading: boolean
  ipsPlaceholder: boolean
  serversLoading: boolean
  networksLoading: boolean
  datacentersLoading: boolean
  vpnsLoading: boolean
}>): boolean {
  if (queries.ipsLoading && !queries.ipsPlaceholder) return true
  return (
    queries.serversLoading ||
    queries.networksLoading ||
    queries.datacentersLoading ||
    queries.vpnsLoading
  )
}

function indexById<T extends { id: string }>(
  rows: readonly T[],
): Map<string, T> {
  const map = new Map<string, T>()
  for (const row of rows) map.set(row.id, row)
  return map
}

type CreateIpInput = {
  address: string
  allocation: IpAllocation
  scope: IpScope
  displayName?: string
  vpnId?: string
  datacenterId?: string
  networkId?: string
  serverId?: string
}

function buildCreateIpBody(input: Readonly<{
  address: string
  allocation: IpAllocation
  scope: IpScope
  displayName: string
  createVpnId: string
  createDatacenterId: string
  createNetworkId: string
  createServerId: string
}>): CreateIpInput {
  const body: CreateIpInput = {
    address: input.address,
    allocation: input.allocation,
    scope: input.scope,
    displayName: input.displayName.trim() || undefined,
  }
  if (input.scope === 'vpn') {
    body.vpnId = input.createVpnId
    return body
  }
  if (input.createDatacenterId) body.datacenterId = input.createDatacenterId
  if (input.createNetworkId) body.networkId = input.createNetworkId
  if (input.createServerId) body.serverId = input.createServerId
  return body
}

function CreateIpScopeFields({
  scope,
  vpns,
  datacenters,
  networks,
  servers,
  createVpnId,
  createDatacenterId,
  createNetworkId,
  createServerId,
  onVpnIdChange,
  onDatacenterIdChange,
  onNetworkIdChange,
  onServerIdChange,
}: Readonly<{
  scope: IpScope
  vpns: VpnRecord[]
  datacenters: DatacenterRecord[]
  networks: NetworkRecord[]
  servers: OrgServerRecord[]
  createVpnId: string
  createDatacenterId: string
  createNetworkId: string
  createServerId: string
  onVpnIdChange: (id: string) => void
  onDatacenterIdChange: (id: string) => void
  onNetworkIdChange: (id: string) => void
  onServerIdChange: (id: string) => void
}>) {
  if (scope === 'vpn') {
    return (
      <>
        <Text style={styles.fieldLabel}>VPN</Text>
        <View style={styles.chipRow}>
          {vpns.length === 0 ? (
            <Text style={orgPanelStyles.muted}>
              Create a VPN mesh first on the VPNs page.
            </Text>
          ) : (
            vpns.map((vpn) => (
              <FilterChip
                key={vpn.id}
                label={vpnTitle(vpn)}
                active={createVpnId === vpn.id}
                onPress={() => onVpnIdChange(vpn.id)}
              />
            ))
          )}
        </View>
      </>
    )
  }
  return (
    <>
      <Text style={styles.fieldLabel}>Datacenter (optional)</Text>
      <View style={styles.chipRow}>
        <FilterChip
          label="None"
          active={createDatacenterId === ''}
          onPress={() => onDatacenterIdChange('')}
        />
        {datacenters.map((row) => (
          <FilterChip
            key={row.id}
            label={row.displayName?.trim() || row.id}
            active={createDatacenterId === row.id}
            onPress={() => onDatacenterIdChange(row.id)}
          />
        ))}
      </View>
      <Text style={styles.fieldLabel}>Network (optional)</Text>
      <View style={styles.chipRow}>
        <FilterChip
          label="None"
          active={createNetworkId === ''}
          onPress={() => onNetworkIdChange('')}
        />
        {networks.map((row) => (
          <FilterChip
            key={row.id}
            label={row.displayName?.trim() || row.cidr || row.id}
            active={createNetworkId === row.id}
            onPress={() => onNetworkIdChange(row.id)}
          />
        ))}
      </View>
      <Text style={styles.fieldLabel}>Server (optional)</Text>
      <View style={styles.chipRow}>
        <FilterChip
          label="None"
          active={createServerId === ''}
          onPress={() => onServerIdChange('')}
        />
        {servers.map((server) => (
          <FilterChip
            key={server.id}
            label={serverTitle(server)}
            active={createServerId === server.id}
            onPress={() => onServerIdChange(server.id)}
          />
        ))}
      </View>
    </>
  )
}

export function IpListRow({
  ip,
  serverLabel,
  networkLabel,
  datacenterLabel,
  vpnLabel,
  isDeleting,
  onDelete,
  showDelete = true,
  onEdit,
  showEdit = false,
}: Readonly<{
  ip: IpRecord
  serverLabel?: string | null
  networkLabel?: string | null
  datacenterLabel?: string | null
  vpnLabel?: string | null
  isDeleting?: boolean
  onDelete?: (ipId: string) => void
  showDelete?: boolean
  onEdit?: (ipId: string) => void
  showEdit?: boolean
}>) {
  return (
    <View style={orgPanelStyles.detailCard}>
      <View style={styles.cardHeader}>
        <Text style={styles.mono} selectable>
          {ip.address}
        </Text>
        <View style={styles.cardActions}>
          {showEdit && onEdit ? (
            <Pressable
              style={styles.secondaryButton}
              onPress={() => onEdit(ip.id)}
            >
              <Text style={styles.secondaryButtonText}>Edit</Text>
            </Pressable>
          ) : null}
          {showDelete && onDelete ? (
            <Pressable
              style={[styles.secondaryButton, isDeleting && styles.buttonDisabled]}
              disabled={isDeleting}
              onPress={() => onDelete(ip.id)}
            >
              <Text style={styles.secondaryButtonText}>
                {isDeleting ? 'Deleting…' : 'Delete'}
              </Text>
            </Pressable>
          ) : null}
        </View>
      </View>
      {ip.displayName?.trim() ? (
        <Text style={orgPanelStyles.detailTitle}>{ip.displayName}</Text>
      ) : null}
      <View style={styles.badgeRow}>
        <Text style={styles.badge}>v{ip.version}</Text>
        <Text style={styles.badge}>{ip.scope}</Text>
        <Text style={styles.badge}>{ip.allocation}</Text>
      </View>
      <Text style={orgPanelStyles.detailLine}>
        <Text style={orgPanelStyles.detailLabel}>Server: </Text>
        {serverLabel ?? '—'}
      </Text>
      <Text style={orgPanelStyles.detailLine}>
        <Text style={orgPanelStyles.detailLabel}>Network: </Text>
        {networkLabel ?? '—'}
      </Text>
      <Text style={orgPanelStyles.detailLine}>
        <Text style={orgPanelStyles.detailLabel}>Datacenter: </Text>
        {datacenterLabel ?? '—'}
      </Text>
      {ip.vpnId ? (
        <Text style={orgPanelStyles.detailLine}>
          <Text style={orgPanelStyles.detailLabel}>VPN: </Text>
          {vpnLabel ?? '—'}
        </Text>
      ) : null}
      {ip.scope === 'vpn' ? (
        <Text style={orgPanelStyles.muted}>
          Mesh-managed address — override or remove the peer on the VPN detail
          page. Released when the peer is removed.
        </Text>
      ) : null}
    </View>
  )
}

function IpEditPanel({
  address,
  displayName,
  allocation,
  scope,
  datacenterId,
  networkId,
  serverId,
  datacenters,
  networks,
  servers,
  saving,
  onDisplayNameChange,
  onDatacenterIdChange,
  onNetworkIdChange,
  onServerIdChange,
  onCancel,
  onSave,
}: Readonly<{
  address: string
  displayName: string
  allocation: IpAllocation
  scope: IpScope
  datacenterId: string
  networkId: string
  serverId: string
  datacenters: DatacenterRecord[]
  networks: NetworkRecord[]
  servers: OrgServerRecord[]
  saving: boolean
  onDisplayNameChange: (value: string) => void
  onDatacenterIdChange: (value: string) => void
  onNetworkIdChange: (value: string) => void
  onServerIdChange: (value: string) => void
  onCancel: () => void
  onSave: () => void
}>) {
  return (
    <View style={[orgPanelStyles.detailCard, styles.editCard]}>
      <Text style={orgPanelStyles.detailTitle}>Edit address</Text>
      <Text style={styles.fieldLabel}>Address</Text>
      <Text style={orgPanelStyles.detailLine}>{address}</Text>
      <Text style={styles.fieldLabel}>Allocation</Text>
      <Text style={orgPanelStyles.detailLine}>{allocation}</Text>
      <Text style={styles.fieldLabel}>Scope</Text>
      <Text style={orgPanelStyles.detailLine}>{scope}</Text>
      <Text style={styles.fieldLabel}>Display name</Text>
      <TextInput
        value={displayName}
        onChangeText={onDisplayNameChange}
        placeholder="Optional label"
        placeholderTextColor={colors.textDim}
        style={styles.input}
      />
      <Text style={styles.fieldLabel}>Datacenter (optional)</Text>
      <View style={styles.chipRow}>
        <FilterChip
          label="None"
          active={datacenterId === ''}
          onPress={() => onDatacenterIdChange('')}
        />
        {datacenters.map((row) => (
          <FilterChip
            key={row.id}
            label={row.displayName?.trim() || row.id}
            active={datacenterId === row.id}
            onPress={() => onDatacenterIdChange(row.id)}
          />
        ))}
      </View>
      <Text style={styles.fieldLabel}>Network (optional)</Text>
      <View style={styles.chipRow}>
        <FilterChip
          label="None"
          active={networkId === ''}
          onPress={() => onNetworkIdChange('')}
        />
        {networks.map((row) => (
          <FilterChip
            key={row.id}
            label={row.displayName?.trim() || row.cidr || row.id}
            active={networkId === row.id}
            onPress={() => onNetworkIdChange(row.id)}
          />
        ))}
      </View>
      <Text style={styles.fieldLabel}>Server (optional)</Text>
      <View style={styles.chipRow}>
        <FilterChip
          label="None"
          active={serverId === ''}
          onPress={() => onServerIdChange('')}
        />
        {servers.map((server) => (
          <FilterChip
            key={server.id}
            label={serverTitle(server)}
            active={serverId === server.id}
            onPress={() => onServerIdChange(server.id)}
          />
        ))}
      </View>
      <View style={styles.editActions}>
        <Pressable
          style={[styles.secondaryButton, webPointer]}
          disabled={saving}
          onPress={onCancel}
        >
          <Text style={styles.secondaryButtonText}>Cancel</Text>
        </Pressable>
        <Pressable
          style={[
            orgPanelStyles.toolbarBtnPrimary,
            saving && styles.buttonDisabled,
            webPointer,
          ]}
          disabled={saving}
          onPress={onSave}
        >
          {saving ? (
            <ActivityIndicator size="small" color={colors.textMuted} />
          ) : (
            <Text style={orgPanelStyles.toolbarBtnTextPrimary}>Save</Text>
          )}
        </Pressable>
      </View>
    </View>
  )
}

export function IpsOverviewSection({
  orgId,
}: Readonly<{ orgId: string }>) {
  const canManage = useCan('organization', orgId, 'organization:manage')
  const [error, setError] = useState<string | null>(null)
  const [scopeFilter, setScopeFilter] = useState<IpScope | 'all'>('all')
  const [allocationFilter, setAllocationFilter] = useState<IpAllocation | 'all'>(
    'all',
  )
  const [datacenterFilter, setDatacenterFilter] = useState('')
  const [address, setAddress] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [allocation, setAllocation] = useState<IpAllocation>('dedicated')
  const [scope, setScope] = useState<IpScope>('public')
  const [createDatacenterId, setCreateDatacenterId] = useState('')
  const [createNetworkId, setCreateNetworkId] = useState('')
  const [createServerId, setCreateServerId] = useState('')
  const [createVpnId, setCreateVpnId] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editAddress, setEditAddress] = useState('')
  const [editDisplayName, setEditDisplayName] = useState('')
  const [editAllocation, setEditAllocation] = useState<IpAllocation>('dedicated')
  const [editScope, setEditScope] = useState<IpScope>('public')
  const [editDatacenterId, setEditDatacenterId] = useState('')
  const [editNetworkId, setEditNetworkId] = useState('')
  const [editServerId, setEditServerId] = useState('')

  const ipFilters = useMemo(
    () =>
      buildIpListFilters(scopeFilter, allocationFilter, datacenterFilter),
    [allocationFilter, datacenterFilter, scopeFilter],
  )

  const ipsQuery = useIps(orgId, ipFilters)
  const serversQuery = useOrgServers(orgId)
  const networksQuery = useNetworks(orgId)
  const datacentersQuery = useDatacenters(orgId)
  const vpnsQuery = useVpns(orgId)
  const createMutation = useCreateIp(orgId)
  const updateMutation = useUpdateIp(orgId)
  const deleteMutation = useDeleteIp(orgId)

  const ips = ipsQuery.data?.ips ?? []
  const servers = serversQuery.data?.servers ?? []
  const networks = networksQuery.data?.networks ?? []
  const datacenters = datacentersQuery.data?.datacenters ?? []
  const vpns = vpnsQuery.data?.vpns ?? []

  const loading = isIpsOverviewLoading({
    ipsLoading: ipsQuery.isLoading,
    ipsPlaceholder: ipsQuery.isPlaceholderData,
    serversLoading: serversQuery.isLoading,
    networksLoading: networksQuery.isLoading,
    datacentersLoading: datacentersQuery.isLoading,
    vpnsLoading: vpnsQuery.isLoading,
  })

  const queryError = resolveIpsQueryError(ipsQuery.isError, ipsQuery.error)
  const displayError =
    error ??
    createMutation.actionError ??
    updateMutation.actionError ??
    deleteMutation.actionError ??
    queryError

  const deletingId = deleteMutation.isPending
    ? deleteMutation.variables
    : undefined
  const creating = createMutation.isPending
  const createDisabled = creating || (scope === 'vpn' && !createVpnId)
  const savingEdit = updateMutation.isPending

  const serverById = useMemo(() => indexById(servers), [servers])
  const networkById = useMemo(() => indexById(networks), [networks])
  const datacenterById = useMemo(() => indexById(datacenters), [datacenters])
  const vpnById = useMemo(() => indexById(vpns), [vpns])

  const handleCreateScopeChange = (next: IpScope) => {
    setScope(next)
    if (next === 'vpn') {
      setCreateDatacenterId('')
      setCreateNetworkId('')
      setCreateServerId('')
      return
    }
    setCreateVpnId('')
  }

  const resetCreateForm = () => {
    setAddress('')
    setDisplayName('')
    setCreateDatacenterId('')
    setCreateNetworkId('')
    setCreateServerId('')
    setCreateVpnId('')
  }

  const handleCreate = () => {
    if (!canManage) return
    const trimmed = address.trim()
    if (!IP_LITERAL_OR_CIDR.test(trimmed)) {
      setError('Enter a valid IPv4/IPv6 address or CIDR.')
      return
    }
    if (scope === 'vpn' && !createVpnId) {
      setError('Select a VPN for vpn-scoped addresses.')
      return
    }
    setError(null)
    createMutation.mutate(
      buildCreateIpBody({
        address: trimmed,
        allocation,
        scope,
        displayName,
        createVpnId,
        createDatacenterId,
        createNetworkId,
        createServerId,
      }),
      {
        onSuccess: () => resetCreateForm(),
        onError: () => {
          setError(createMutation.actionError ?? 'Failed to create IP')
        },
      },
    )
  }

  const handleDelete = (ipId: string) => {
    if (!canManage) return
    const target = ips.find((row) => row.id === ipId)
    if (target?.scope === 'vpn') return
    setError(null)
    deleteMutation.mutate(ipId, {
      onSuccess: () => {
        if (editingId === ipId) setEditingId(null)
      },
      onError: () => {
        setError(deleteMutation.actionError ?? 'Failed to delete IP')
      },
    })
  }

  const beginEdit = (ip: IpRecord) => {
    if (ip.scope === 'vpn') return
    setEditingId(ip.id)
    setEditAddress(ip.address)
    setEditDisplayName(ip.displayName ?? '')
    setEditAllocation(ip.allocation)
    setEditScope(ip.scope)
    setEditDatacenterId(ip.datacenterId ?? '')
    setEditNetworkId(ip.networkId ?? '')
    setEditServerId(ip.serverId ?? '')
    setError(null)
  }

  const cancelEdit = () => {
    setEditingId(null)
  }

  const handleSaveEdit = () => {
    if (!canManage || !editingId) return
    setError(null)
    updateMutation.mutate(
      {
        ipId: editingId,
        body: {
          displayName: editDisplayName.trim() || null,
          datacenterId: editDatacenterId || null,
          networkId: editNetworkId || null,
          serverId: editServerId || null,
        },
      },
      {
        onSuccess: () => setEditingId(null),
        onError: () => {
          setError(updateMutation.actionError ?? 'Failed to update IP')
        },
      },
    )
  }

  return (
    <View style={styles.root}>
      <Text style={orgPanelStyles.pageTitle}>IP addresses</Text>
      <Text style={orgPanelStyles.pageCopy}>
        Managed address pool for ingress and internal routing across the
        organization.
      </Text>

      {displayError ? <Text style={orgPanelStyles.error}>{displayError}</Text> : null}

      <SectionPanel title="Filters" hint="Optional narrowing">
        <Text style={styles.fieldLabel}>Scope</Text>
        <View style={styles.chipRow}>
          <FilterChip
            label="All"
            active={scopeFilter === 'all'}
            onPress={() => setScopeFilter('all')}
          />
          {SCOPES.map((value) => (
            <FilterChip
              key={value}
              label={value}
              active={scopeFilter === value}
              onPress={() => setScopeFilter(value)}
            />
          ))}
        </View>
        <Text style={styles.fieldLabel}>Allocation</Text>
        <View style={styles.chipRow}>
          <FilterChip
            label="All"
            active={allocationFilter === 'all'}
            onPress={() => setAllocationFilter('all')}
          />
          {ALLOCATIONS.map((value) => (
            <FilterChip
              key={value}
              label={value}
              active={allocationFilter === value}
              onPress={() => setAllocationFilter(value)}
            />
          ))}
        </View>
        <Text style={styles.fieldLabel}>Datacenter</Text>
        <View style={styles.chipRow}>
          <FilterChip
            label="All"
            active={datacenterFilter === ''}
            onPress={() => setDatacenterFilter('')}
          />
          {datacenters.map((row) => (
            <FilterChip
              key={row.id}
              label={row.displayName?.trim() || row.id}
              active={datacenterFilter === row.id}
              onPress={() => setDatacenterFilter(row.id)}
            />
          ))}
        </View>
      </SectionPanel>

      {canManage ? (
        <SectionPanel title="Add IP address" hint="Manage-gated">
          <Text style={styles.fieldLabel}>Address</Text>
          <TextInput
            value={address}
            onChangeText={setAddress}
            placeholder="203.0.113.10 or 2001:db8::1"
            placeholderTextColor={colors.textDim}
            style={styles.input}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Text style={styles.fieldLabel}>Display name</Text>
          <TextInput
            value={displayName}
            onChangeText={setDisplayName}
            placeholder="Optional label"
            placeholderTextColor={colors.textDim}
            style={styles.input}
          />
          <Text style={styles.fieldLabel}>Allocation</Text>
          <View style={styles.chipRow}>
            {ALLOCATIONS.map((value) => (
              <FilterChip
                key={value}
                label={value}
                active={allocation === value}
                onPress={() => setAllocation(value)}
              />
            ))}
          </View>
          <Text style={styles.fieldLabel}>Scope</Text>
          <View style={styles.chipRow}>
            {SCOPES.map((value) => (
              <FilterChip
                key={value}
                label={value}
                active={scope === value}
                onPress={() => handleCreateScopeChange(value)}
              />
            ))}
          </View>
          <CreateIpScopeFields
            scope={scope}
            vpns={vpns}
            datacenters={datacenters}
            networks={networks}
            servers={servers}
            createVpnId={createVpnId}
            createDatacenterId={createDatacenterId}
            createNetworkId={createNetworkId}
            createServerId={createServerId}
            onVpnIdChange={setCreateVpnId}
            onDatacenterIdChange={setCreateDatacenterId}
            onNetworkIdChange={setCreateNetworkId}
            onServerIdChange={setCreateServerId}
          />
          <Pressable
            style={[
              orgPanelStyles.toolbarBtnPrimary,
              createDisabled && styles.buttonDisabled,
              webPointer,
            ]}
            disabled={createDisabled}
            onPress={handleCreate}
          >
            {creating ? (
              <ActivityIndicator size="small" color={colors.textMuted} />
            ) : (
              <Text style={orgPanelStyles.toolbarBtnTextPrimary}>Add address</Text>
            )}
          </Pressable>
        </SectionPanel>
      ) : null}

      <SectionPanel
        title="Address pool"
        hint={loading ? 'Loading…' : `${ips.length} address(es)`}
      >
        {loading && ips.length === 0 ? (
          <Text style={orgPanelStyles.muted}>Loading addresses…</Text>
        ) : null}
        {!loading && ips.length === 0 ? (
          <Text style={orgPanelStyles.muted}>No addresses match these filters.</Text>
        ) : null}
        <View style={styles.list}>
          {ips.map((ip) => {
            const server = ip.serverId ? serverById.get(ip.serverId) : null
            const network = ip.networkId ? networkById.get(ip.networkId) : null
            const datacenter = ip.datacenterId
              ? datacenterById.get(ip.datacenterId)
              : null
            const vpn = ip.vpnId ? vpnById.get(ip.vpnId) : null
            if (editingId === ip.id) {
              return (
                <IpEditPanel
                  key={ip.id}
                  address={editAddress}
                  displayName={editDisplayName}
                  allocation={editAllocation}
                  scope={editScope}
                  datacenterId={editDatacenterId}
                  networkId={editNetworkId}
                  serverId={editServerId}
                  datacenters={datacenters}
                  networks={networks}
                  servers={servers}
                  saving={savingEdit}
                  onDisplayNameChange={setEditDisplayName}
                  onDatacenterIdChange={setEditDatacenterId}
                  onNetworkIdChange={setEditNetworkId}
                  onServerIdChange={setEditServerId}
                  onCancel={cancelEdit}
                  onSave={handleSaveEdit}
                />
              )
            }
            // Mesh overlay rows are managed via VPN peer override/remove —
            // not the flat IP edit/delete actions.
            const isMeshManaged = ip.scope === 'vpn'
            return (
              <IpListRow
                key={ip.id}
                ip={ip}
                serverLabel={server ? serverTitle(server) : null}
                networkLabel={
                  network?.displayName?.trim() || network?.cidr || null
                }
                datacenterLabel={datacenter?.displayName?.trim() || null}
                vpnLabel={vpn ? vpnTitle(vpn) : null}
                isDeleting={deletingId === ip.id}
                showDelete={canManage && !isMeshManaged}
                showEdit={canManage && !isMeshManaged}
                onEdit={() => beginEdit(ip)}
                onDelete={handleDelete}
              />
            )
          })}
        </View>
      </SectionPanel>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    width: '100%',
    gap: spacing.lg,
  },
  list: {
    gap: 8,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  cardActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  editCard: {
    borderColor: chrome.accent,
  },
  editActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginVertical: spacing.xs,
  },
  badge: {
    color: colors.accent,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    borderWidth: 1,
    borderColor: colors.borderChip,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
    backgroundColor: colors.bgSecondary,
  },
  mono: {
    color: colors.text,
    fontFamily: 'monospace',
    fontSize: 14,
    fontWeight: '600',
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  chip: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.borderChip,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: colors.bgSecondary,
    minHeight: 36,
    justifyContent: 'center',
  },
  chipActive: {
    borderColor: chrome.accent,
    backgroundColor: chrome.bgActive,
  },
  chipText: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
  chipTextActive: {
    color: chrome.accent,
  },
  fieldLabel: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
    marginBottom: spacing.xs,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 6,
    backgroundColor: colors.bgInput,
    color: colors.text,
    fontSize: 14,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: spacing.sm,
    minHeight: 44,
  },
  secondaryButton: {
    alignSelf: 'flex-start',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.borderChip,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: colors.bgSecondary,
  },
  secondaryButtonText: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
})
