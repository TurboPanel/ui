import { useCallback, useEffect, useMemo, useState } from 'react'
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
import { useAuth } from '@/lib/auth-context'
import {
  createIp,
  deleteIp,
  fetchDatacenters,
  fetchIps,
  fetchNetworks,
  fetchOrgServers,
  fetchVpns,
  isForbiddenError,
  updateIp,
  type DatacenterRecord,
  type IpAllocation,
  type IpRecord,
  type IpScope,
  type NetworkRecord,
  type OrgServerRecord,
  type VpnRecord,
} from '@/lib/instance-api'
import { useCan } from '@/lib/query-client'
import { colors, spacing } from '@/lib/theme'

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

function buildCreateIpBody(input: Readonly<{
  address: string
  allocation: IpAllocation
  scope: IpScope
  displayName: string
  createVpnId: string
  createDatacenterId: string
  createNetworkId: string
  createServerId: string
}>) {
  const body: Parameters<typeof createIp>[0] = {
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
  const { handleUnauthorized } = useAuth()
  const canManage = useCan('organization', orgId, 'organization:manage')
  const [ips, setIps] = useState<IpRecord[]>([])
  const [servers, setServers] = useState<OrgServerRecord[]>([])
  const [networks, setNetworks] = useState<NetworkRecord[]>([])
  const [datacenters, setDatacenters] = useState<DatacenterRecord[]>([])
  const [vpns, setVpns] = useState<VpnRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [scopeFilter, setScopeFilter] = useState<IpScope | 'all'>('all')
  const [allocationFilter, setAllocationFilter] = useState<IpAllocation | 'all'>(
    'all',
  )
  const [datacenterFilter, setDatacenterFilter] = useState('')
  const [creating, setCreating] = useState(false)
  const [deleting, setDeleting] = useState<Set<string>>(() => new Set())
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
  const [savingEdit, setSavingEdit] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const filters = buildIpListFilters(
        scopeFilter,
        allocationFilter,
        datacenterFilter,
      )
      const [
        ipsResult,
        serversResult,
        networksResult,
        datacentersResult,
        vpnsResult,
      ] = await Promise.all([
        fetchIps(filters),
        fetchOrgServers(),
        fetchNetworks(),
        fetchDatacenters(),
        fetchVpns(),
      ])
      setIps(ipsResult.ips)
      setServers(serversResult.servers)
      setNetworks(networksResult.networks)
      setDatacenters(datacentersResult.datacenters)
      setVpns(vpnsResult.vpns)
    } catch (err) {
      if (isForbiddenError(err)) {
        await handleUnauthorized()
        return
      }
      setError(err instanceof Error ? err.message : 'Failed to load IP addresses')
    } finally {
      setLoading(false)
    }
  }, [
    allocationFilter,
    datacenterFilter,
    handleUnauthorized,
    scopeFilter,
  ])

  useEffect(() => {
    load().catch(() => {
      // Errors are surfaced via error state inside load.
    })
  }, [load, orgId])

  const serverById = useMemo(() => {
    const map = new Map<string, OrgServerRecord>()
    for (const server of servers) map.set(server.id, server)
    return map
  }, [servers])

  const networkById = useMemo(() => {
    const map = new Map<string, NetworkRecord>()
    for (const network of networks) map.set(network.id, network)
    return map
  }, [networks])

  const datacenterById = useMemo(() => {
    const map = new Map<string, DatacenterRecord>()
    for (const row of datacenters) map.set(row.id, row)
    return map
  }, [datacenters])

  const vpnById = useMemo(() => {
    const map = new Map<string, VpnRecord>()
    for (const vpn of vpns) map.set(vpn.id, vpn)
    return map
  }, [vpns])

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

  const handleCreate = async () => {
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
    setCreating(true)
    setError(null)
    try {
      await createIp(
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
      )
      resetCreateForm()
      await load()
    } catch (err) {
      if (isForbiddenError(err)) {
        await handleUnauthorized()
        return
      }
      setError(err instanceof Error ? err.message : 'Failed to create IP')
    } finally {
      setCreating(false)
    }
  }

  const handleDelete = async (ipId: string) => {
    if (!canManage) return
    const target = ips.find((row) => row.id === ipId)
    if (target?.scope === 'vpn') return
    setDeleting((current) => new Set(current).add(ipId))
    setError(null)
    try {
      await deleteIp(ipId)
      if (editingId === ipId) {
        setEditingId(null)
      }
      await load()
    } catch (err) {
      if (isForbiddenError(err)) {
        await handleUnauthorized()
        return
      }
      setError(err instanceof Error ? err.message : 'Failed to delete IP')
    } finally {
      setDeleting((current) => {
        const next = new Set(current)
        next.delete(ipId)
        return next
      })
    }
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

  const handleSaveEdit = async () => {
    if (!canManage || !editingId) return
    setSavingEdit(true)
    setError(null)
    try {
      await updateIp(editingId, {
        displayName: editDisplayName.trim() || null,
        datacenterId: editDatacenterId || null,
        networkId: editNetworkId || null,
        serverId: editServerId || null,
      })
      setEditingId(null)
      await load()
    } catch (err) {
      if (isForbiddenError(err)) {
        await handleUnauthorized()
        return
      }
      setError(err instanceof Error ? err.message : 'Failed to update IP')
    } finally {
      setSavingEdit(false)
    }
  }

  return (
    <View style={styles.root}>
      <Text style={orgPanelStyles.pageTitle}>IP addresses</Text>
      <Text style={orgPanelStyles.pageCopy}>
        Managed address pool for ingress and internal routing across the
        organization.
      </Text>

      {error ? <Text style={orgPanelStyles.error}>{error}</Text> : null}

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
              (creating || (scope === 'vpn' && !createVpnId)) &&
                styles.buttonDisabled,
              webPointer,
            ]}
            disabled={creating || (scope === 'vpn' && !createVpnId)}
            onPress={() => {
              handleCreate().catch(() => {
                // Errors are surfaced via error state.
              })
            }}
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
                  onSave={() => {
                    handleSaveEdit().catch(() => {
                      // Errors are surfaced via error state.
                    })
                  }}
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
                isDeleting={deleting.has(ip.id)}
                showDelete={canManage && !isMeshManaged}
                showEdit={canManage && !isMeshManaged}
                onEdit={() => beginEdit(ip)}
                onDelete={(id) => {
                  handleDelete(id).catch(() => {
                    // Errors are surfaced via error state.
                  })
                }}
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
    borderColor: colors.accent,
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
    borderColor: colors.accent,
    backgroundColor: colors.bgActive,
  },
  chipText: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
  chipTextActive: {
    color: colors.accent,
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
