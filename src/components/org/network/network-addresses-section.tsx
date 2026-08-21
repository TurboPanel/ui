import { useMemo, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { SectionPanel } from '@/components/org/section-panel'
import { IpListRow } from '@/components/org/network/network-rows'
import { orgPanelStyles } from '@/components/org/org-panel-styles'
import {
  Button,
  ButtonRow,
  EmptyState,
  FormField,
  LoadingState,
  SegmentedControl,
  TextField,
  type SegmentedOption,
} from '@/components/ui'
import type {
  DatacenterRecord,
  IpAllocation,
  IpRecord,
  IpScope,
  NetworkRecord,
  OrgServerRecord,
} from '@/lib/instance-api'
import {
  useCreateIp,
  useDatacenters,
  useDeleteIp,
  useIps,
  useNetworks,
  useUpdateIp,
} from '@/lib/queries/topology'
import { useOrgServers } from '@/lib/queries/servers'
import { orEmptyArray } from '@/lib/or-empty-array'
import { useCan } from '@/lib/query-client'
import { DESCRIPTION_MAX_LENGTH } from '@/lib/display-name'
import { chrome, colors, spacing } from '@/lib/theme'

const SCOPES: IpScope[] = ['public', 'datacenter']
const ALLOCATIONS: IpAllocation[] = ['dedicated', 'shared']

const SCOPE_OPTIONS: readonly SegmentedOption<IpScope>[] = SCOPES.map(
  (value) => ({ value, label: value }),
)
const ALLOCATION_OPTIONS: readonly SegmentedOption<IpAllocation>[] =
  ALLOCATIONS.map((value) => ({ value, label: value }))
const SCOPE_FILTER_OPTIONS: readonly SegmentedOption<IpScope | 'all'>[] = [
  { value: 'all', label: 'All' },
  ...SCOPE_OPTIONS,
]
const ALLOCATION_FILTER_OPTIONS: readonly SegmentedOption<
  IpAllocation | 'all'
>[] = [{ value: 'all', label: 'All' }, ...ALLOCATION_OPTIONS]

/** Simple client pre-check; server `ip-address.ts` is authoritative. */
const IP_LITERAL_OR_CIDR =
  /^(?:\d{1,3}(?:\.\d{1,3}){3}|\[[0-9a-fA-F:]+\]|[0-9a-fA-F:]+)(?:\/\d{1,3})?$/

function serverTitle(server: OrgServerRecord): string {
  return server.name?.trim() || server.hostname?.trim() || server.id
}

function datacenterOptions(
  datacenters: readonly DatacenterRecord[],
  emptyLabel: string,
): SegmentedOption<string>[] {
  return [
    { value: '', label: emptyLabel },
    ...datacenters.map((row) => ({
      value: row.id,
      label: row.name?.trim() || row.id,
    })),
  ]
}

function siteSubnetsForDatacenter(
  networks: readonly NetworkRecord[],
  datacenterId: string,
): NetworkRecord[] {
  if (!datacenterId) return []
  return networks.filter(
    (row) => row.kind === 'datacenter' && row.datacenterId === datacenterId,
  )
}

function isDatacenterMembershipPin(scope: IpScope, serverId: string): boolean {
  return scope === 'datacenter' && serverId.length > 0
}

function isMembershipPinIncomplete(
  scope: IpScope,
  datacenterId: string,
  networkId: string,
  serverId: string,
): boolean {
  if (!isDatacenterMembershipPin(scope, serverId)) return false
  return datacenterId.length === 0 || networkId.length === 0
}

function isCreateIpDisabled(
  creating: boolean,
  membershipIncomplete: boolean,
): boolean {
  return creating || membershipIncomplete
}

function retainedNetworkId(
  networks: readonly NetworkRecord[],
  datacenterId: string,
  networkId: string,
  requireSiteSubnet: boolean,
): string {
  if (!networkId) return ''
  if (!requireSiteSubnet) return networkId
  const stillValid = siteSubnetsForDatacenter(networks, datacenterId).some(
    (row) => row.id === networkId,
  )
  return stillValid ? networkId : ''
}

function resolveSubmittedNetworkId(
  scope: IpScope,
  serverId: string,
  networkId: string,
): string | null {
  if (serverId && networkId) return networkId
  if (scope !== 'datacenter' && networkId) return networkId
  return null
}

function mutationErrorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback
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
}>): boolean {
  if (queries.ipsLoading && !queries.ipsPlaceholder) return true
  return (
    queries.serversLoading ||
    queries.networksLoading ||
    queries.datacentersLoading
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
  description?: string
  datacenterId?: string
  networkId?: string
  serverId?: string
}

function buildCreateIpBody(input: Readonly<{
  address: string
  allocation: IpAllocation
  scope: IpScope
  description: string
  createDatacenterId: string
  createNetworkId: string
  createServerId: string
}>): CreateIpInput {
  const body: CreateIpInput = {
    address: input.address,
    allocation: input.allocation,
    scope: input.scope,
    description: input.description.trim() || undefined,
  }
  if (input.createDatacenterId) body.datacenterId = input.createDatacenterId
  if (input.createServerId) body.serverId = input.createServerId
  const networkId = resolveSubmittedNetworkId(
    input.scope,
    input.createServerId,
    input.createNetworkId,
  )
  if (networkId) body.networkId = networkId
  return body
}

function buildUpdateIpBody(input: Readonly<{
  description: string
  scope: IpScope
  datacenterId: string
  networkId: string
  serverId: string
}>): {
  description: string | null
  datacenterId: string | null
  networkId: string | null
  serverId: string | null
} {
  return {
    description: input.description.trim() || null,
    datacenterId: input.datacenterId || null,
    serverId: input.serverId || null,
    networkId: resolveSubmittedNetworkId(
      input.scope,
      input.serverId,
      input.networkId,
    ),
  }
}

function CreateIpScopeFields({
  scope,
  datacenters,
  networks,
  servers,
  createDatacenterId,
  createNetworkId,
  createServerId,
  onDatacenterIdChange,
  onNetworkIdChange,
  onServerIdChange,
}: Readonly<{
  scope: IpScope
  datacenters: DatacenterRecord[]
  networks: NetworkRecord[]
  servers: OrgServerRecord[]
  createDatacenterId: string
  createNetworkId: string
  createServerId: string
  onDatacenterIdChange: (id: string) => void
  onNetworkIdChange: (id: string) => void
  onServerIdChange: (id: string) => void
}>) {
  const requireSiteSubnet = isDatacenterMembershipPin(scope, createServerId)
  const networkRows = requireSiteSubnet
    ? siteSubnetsForDatacenter(networks, createDatacenterId)
    : networks
  let datacenterLabel = 'Datacenter (optional)'
  let networkLabel = 'Network (optional)'
  if (scope === 'datacenter') datacenterLabel = 'Datacenter'
  if (requireSiteSubnet) networkLabel = 'Site subnet'

  const networkOptions: SegmentedOption<string>[] = [
    ...(requireSiteSubnet ? [] : [{ value: '', label: 'None' }]),
    ...networkRows.map((row) => ({
      value: row.id,
      label: row.name?.trim() || row.cidr || row.id,
    })),
  ]
  const serverOptions: SegmentedOption<string>[] = [
    { value: '', label: 'None' },
    ...servers.map((server) => ({
      value: server.id,
      label: serverTitle(server),
    })),
  ]

  return (
    <>
      <FormField label={datacenterLabel}>
        <SegmentedControl
          options={datacenterOptions(datacenters, 'None')}
          value={createDatacenterId}
          onChange={onDatacenterIdChange}
          accessibilityLabel={datacenterLabel}
        />
      </FormField>
      {scope === 'public' || requireSiteSubnet ? (
        <FormField label={networkLabel}>
          <SegmentedControl
            options={networkOptions}
            value={createNetworkId}
            onChange={onNetworkIdChange}
            accessibilityLabel={networkLabel}
          />
        </FormField>
      ) : null}
      <FormField label="Server (optional)">
        <SegmentedControl
          options={serverOptions}
          value={createServerId}
          onChange={onServerIdChange}
          accessibilityLabel="Server (optional)"
        />
      </FormField>
    </>
  )
}

function IpEditPanel({
  address,
  description,
  allocation,
  scope,
  datacenterId,
  networkId,
  serverId,
  datacenters,
  networks,
  servers,
  saving,
  onDescriptionChange,
  onDatacenterIdChange,
  onNetworkIdChange,
  onServerIdChange,
  onCancel,
  onSave,
}: Readonly<{
  address: string
  description: string
  allocation: IpAllocation
  scope: IpScope
  datacenterId: string
  networkId: string
  serverId: string
  datacenters: DatacenterRecord[]
  networks: NetworkRecord[]
  servers: OrgServerRecord[]
  saving: boolean
  onDescriptionChange: (value: string) => void
  onDatacenterIdChange: (value: string) => void
  onNetworkIdChange: (value: string) => void
  onServerIdChange: (value: string) => void
  onCancel: () => void
  onSave: () => void
}>) {
  const saveDisabled = saving ||
    isMembershipPinIncomplete(scope, datacenterId, networkId, serverId)
  return (
    <View style={[orgPanelStyles.detailCard, styles.editCard]}>
      <Text style={orgPanelStyles.detailTitle}>Edit address</Text>
      <Text style={styles.fieldLabel}>Address</Text>
      <Text style={orgPanelStyles.detailLine}>{address}</Text>
      <Text style={styles.fieldLabel}>Allocation</Text>
      <Text style={orgPanelStyles.detailLine}>{allocation}</Text>
      <Text style={styles.fieldLabel}>Scope</Text>
      <Text style={orgPanelStyles.detailLine}>{scope}</Text>
      <TextField
        label="Description"
        value={description}
        onChangeText={onDescriptionChange}
        placeholder="Optional note"
        maxLength={DESCRIPTION_MAX_LENGTH}
      />
      <CreateIpScopeFields
        scope={scope}
        datacenters={datacenters}
        networks={networks}
        servers={servers}
        createDatacenterId={datacenterId}
        createNetworkId={networkId}
        createServerId={serverId}
        onDatacenterIdChange={onDatacenterIdChange}
        onNetworkIdChange={onNetworkIdChange}
        onServerIdChange={onServerIdChange}
      />
      <ButtonRow>
        <Button label="Cancel" disabled={saving} onPress={onCancel} />
        <Button
          label="Save"
          variant="primary"
          busy={saving}
          disabled={saveDisabled}
          onPress={onSave}
        />
      </ButtonRow>
    </View>
  )
}

function AddressFiltersPanel({
  scopeFilter,
  allocationFilter,
  datacenterFilter,
  datacenters,
  onScopeFilterChange,
  onAllocationFilterChange,
  onDatacenterFilterChange,
}: Readonly<{
  scopeFilter: IpScope | 'all'
  allocationFilter: IpAllocation | 'all'
  datacenterFilter: string
  datacenters: DatacenterRecord[]
  onScopeFilterChange: (value: IpScope | 'all') => void
  onAllocationFilterChange: (value: IpAllocation | 'all') => void
  onDatacenterFilterChange: (value: string) => void
}>) {
  return (
    <SectionPanel title="Filters" hint="Optional narrowing">
      <FormField label="Scope">
        <SegmentedControl
          options={SCOPE_FILTER_OPTIONS}
          value={scopeFilter}
          onChange={onScopeFilterChange}
          accessibilityLabel="Scope filter"
        />
      </FormField>
      <FormField label="Allocation">
        <SegmentedControl
          options={ALLOCATION_FILTER_OPTIONS}
          value={allocationFilter}
          onChange={onAllocationFilterChange}
          accessibilityLabel="Allocation filter"
        />
      </FormField>
      <FormField label="Site">
        <SegmentedControl
          options={datacenterOptions(datacenters, 'All')}
          value={datacenterFilter}
          onChange={onDatacenterFilterChange}
          accessibilityLabel="Site filter"
        />
      </FormField>
    </SectionPanel>
  )
}

function AddAddressPanel({
  address,
  description,
  allocation,
  scope,
  datacenters,
  networks,
  servers,
  createDatacenterId,
  createNetworkId,
  createServerId,
  createDisabled,
  creating,
  onAddressChange,
  onDescriptionChange,
  onAllocationChange,
  onScopeChange,
  onDatacenterIdChange,
  onNetworkIdChange,
  onServerIdChange,
  onCreate,
}: Readonly<{
  address: string
  description: string
  allocation: IpAllocation
  scope: IpScope
  datacenters: DatacenterRecord[]
  networks: NetworkRecord[]
  servers: OrgServerRecord[]
  createDatacenterId: string
  createNetworkId: string
  createServerId: string
  createDisabled: boolean
  creating: boolean
  onAddressChange: (value: string) => void
  onDescriptionChange: (value: string) => void
  onAllocationChange: (value: IpAllocation) => void
  onScopeChange: (value: IpScope) => void
  onDatacenterIdChange: (id: string) => void
  onNetworkIdChange: (id: string) => void
  onServerIdChange: (id: string) => void
  onCreate: () => void
}>) {
  return (
    <SectionPanel
      title="Add IP address"
      hint="Manage-gated"
      collapsible
      defaultCollapsed
    >
      <TextField
        label="Address"
        value={address}
        onChangeText={onAddressChange}
        placeholder="203.0.113.10 or 2001:db8::1"
        autoCapitalize="none"
        autoCorrect={false}
        mono
      />
      <TextField
        label="Description"
        value={description}
        onChangeText={onDescriptionChange}
        placeholder="Optional note"
        maxLength={DESCRIPTION_MAX_LENGTH}
      />
      <FormField label="Allocation">
        <SegmentedControl
          options={ALLOCATION_OPTIONS}
          value={allocation}
          onChange={onAllocationChange}
          accessibilityLabel="Allocation"
        />
      </FormField>
      <FormField label="Scope">
        <SegmentedControl
          options={SCOPE_OPTIONS}
          value={scope}
          onChange={onScopeChange}
          accessibilityLabel="Scope"
        />
      </FormField>
      <CreateIpScopeFields
        scope={scope}
        datacenters={datacenters}
        networks={networks}
        servers={servers}
        createDatacenterId={createDatacenterId}
        createNetworkId={createNetworkId}
        createServerId={createServerId}
        onDatacenterIdChange={onDatacenterIdChange}
        onNetworkIdChange={onNetworkIdChange}
        onServerIdChange={onServerIdChange}
      />
      <Button
        label="Add address"
        variant="primary"
        busy={creating}
        disabled={createDisabled}
        onPress={onCreate}
      />
    </SectionPanel>
  )
}

function addressRowLabels(
  ip: IpRecord,
  lookups: Readonly<{
    serverById: Map<string, OrgServerRecord>
    networkById: Map<string, NetworkRecord>
    datacenterById: Map<string, DatacenterRecord>
  }>,
): {
  serverLabel: string | null
  networkLabel: string | null
  datacenterLabel: string | null
} {
  const server = ip.serverId ? lookups.serverById.get(ip.serverId) : null
  const network = ip.networkId ? lookups.networkById.get(ip.networkId) : null
  const datacenter = ip.datacenterId
    ? lookups.datacenterById.get(ip.datacenterId)
    : null
  return {
    serverLabel: server ? serverTitle(server) : null,
    networkLabel: network?.name?.trim() || network?.cidr || null,
    datacenterLabel: datacenter?.name?.trim() || null,
  }
}

function AddressPoolPanel({
  loading,
  ips,
  editingId,
  editAddress,
  editDescription,
  editAllocation,
  editScope,
  editDatacenterId,
  editNetworkId,
  editServerId,
  datacenters,
  networks,
  servers,
  savingEdit,
  deletingId,
  canManage,
  serverById,
  networkById,
  datacenterById,
  onDescriptionChange,
  onDatacenterIdChange,
  onNetworkIdChange,
  onServerIdChange,
  onCancelEdit,
  onSaveEdit,
  onBeginEdit,
  onDelete,
}: Readonly<{
  loading: boolean
  ips: IpRecord[]
  editingId: string | null
  editAddress: string
  editDescription: string
  editAllocation: IpAllocation
  editScope: IpScope
  editDatacenterId: string
  editNetworkId: string
  editServerId: string
  datacenters: DatacenterRecord[]
  networks: NetworkRecord[]
  servers: OrgServerRecord[]
  savingEdit: boolean
  deletingId: string | undefined
  canManage: boolean
  serverById: Map<string, OrgServerRecord>
  networkById: Map<string, NetworkRecord>
  datacenterById: Map<string, DatacenterRecord>
  onDescriptionChange: (value: string) => void
  onDatacenterIdChange: (value: string) => void
  onNetworkIdChange: (value: string) => void
  onServerIdChange: (value: string) => void
  onCancelEdit: () => void
  onSaveEdit: () => void
  onBeginEdit: (ip: IpRecord) => void
  onDelete: (ipId: string) => void
}>) {
  return (
    <SectionPanel
      title="Address pool"
      hint={loading ? 'Loading…' : `${ips.length} address(es)`}
    >
      {loading && ips.length === 0 ? (
        <LoadingState label="Loading addresses…" />
      ) : null}
      {!loading && ips.length === 0 ? (
        <EmptyState title="No addresses match these filters." />
      ) : null}
      <View style={styles.list}>
        {ips.map((ip) => {
          if (editingId === ip.id) {
            return (
              <IpEditPanel
                key={ip.id}
                address={editAddress}
                description={editDescription}
                allocation={editAllocation}
                scope={editScope}
                datacenterId={editDatacenterId}
                networkId={editNetworkId}
                serverId={editServerId}
                datacenters={datacenters}
                networks={networks}
                servers={servers}
                saving={savingEdit}
                onDescriptionChange={onDescriptionChange}
                onDatacenterIdChange={onDatacenterIdChange}
                onNetworkIdChange={onNetworkIdChange}
                onServerIdChange={onServerIdChange}
                onCancel={onCancelEdit}
                onSave={onSaveEdit}
              />
            )
          }
          const labels = addressRowLabels(ip, {
            serverById,
            networkById,
            datacenterById,
          })
          return (
            <IpListRow
              key={ip.id}
              ip={ip}
              serverLabel={labels.serverLabel}
              networkLabel={labels.networkLabel}
              datacenterLabel={labels.datacenterLabel}
              isDeleting={deletingId === ip.id}
              showDelete={canManage}
              showEdit={canManage}
              onEdit={() => onBeginEdit(ip)}
              onDelete={onDelete}
            />
          )
        })}
      </View>
    </SectionPanel>
  )
}

export function NetworkAddressesSection({
  orgId,
}: Readonly<{
  orgId: string
}>) {
  const canManage = useCan('organization', orgId, 'organization:manage')
  const [error, setError] = useState<string | null>(null)
  const [scopeFilter, setScopeFilter] = useState<IpScope | 'all'>('all')
  const [allocationFilter, setAllocationFilter] = useState<IpAllocation | 'all'>(
    'all',
  )
  const [datacenterFilter, setDatacenterFilter] = useState('')
  const [address, setAddress] = useState('')
  const [description, setDescription] = useState('')
  const [allocation, setAllocation] = useState<IpAllocation>('dedicated')
  const [scope, setScope] = useState<IpScope>('public')
  const [createDatacenterId, setCreateDatacenterId] = useState('')
  const [createNetworkId, setCreateNetworkId] = useState('')
  const [createServerId, setCreateServerId] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editAddress, setEditAddress] = useState('')
  const [editDescription, setEditDescription] = useState('')
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
  const createMutation = useCreateIp(orgId)
  const updateMutation = useUpdateIp(orgId)
  const deleteMutation = useDeleteIp(orgId)

  const ips = ipsQuery.data?.ips ?? []
  const servers = orEmptyArray(serversQuery.data?.servers)
  const networks = orEmptyArray(networksQuery.data?.networks)
  const datacenters = orEmptyArray(datacentersQuery.data?.datacenters)

  const loading = isIpsOverviewLoading({
    ipsLoading: ipsQuery.isLoading,
    ipsPlaceholder: ipsQuery.isPlaceholderData,
    serversLoading: serversQuery.isLoading,
    networksLoading: networksQuery.isLoading,
    datacentersLoading: datacentersQuery.isLoading,
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
  const createDisabled = isCreateIpDisabled(
    creating,
    isMembershipPinIncomplete(
      scope,
      createDatacenterId,
      createNetworkId,
      createServerId,
    ),
  )
  const savingEdit = updateMutation.isPending

  const serverById = useMemo(() => indexById(servers), [servers])
  const networkById = useMemo(() => indexById(networks), [networks])
  const datacenterById = useMemo(() => indexById(datacenters), [datacenters])

  const handleCreateScopeChange = (next: IpScope) => {
    setScope(next)
    setCreateNetworkId((current) => {
      if (next === 'datacenter' && !createServerId) return ''
      return retainedNetworkId(
        networks,
        createDatacenterId,
        current,
        isDatacenterMembershipPin(next, createServerId),
      )
    })
  }

  const handleCreateDatacenterIdChange = (id: string) => {
    setCreateDatacenterId(id)
    setCreateNetworkId((current) =>
      retainedNetworkId(
        networks,
        id,
        current,
        isDatacenterMembershipPin(scope, createServerId),
      ),
    )
  }

  const handleCreateServerIdChange = (id: string) => {
    setCreateServerId(id)
    setCreateNetworkId((current) => {
      if (scope === 'datacenter' && !id) return ''
      return retainedNetworkId(
        networks,
        createDatacenterId,
        current,
        isDatacenterMembershipPin(scope, id),
      )
    })
  }

  const handleEditDatacenterIdChange = (id: string) => {
    setEditDatacenterId(id)
    setEditNetworkId((current) =>
      retainedNetworkId(
        networks,
        id,
        current,
        isDatacenterMembershipPin(editScope, editServerId),
      ),
    )
  }

  const handleEditServerIdChange = (id: string) => {
    setEditServerId(id)
    setEditNetworkId((current) => {
      if (editScope === 'datacenter' && !id) return ''
      return retainedNetworkId(
        networks,
        editDatacenterId,
        current,
        isDatacenterMembershipPin(editScope, id),
      )
    })
  }

  const resetCreateForm = () => {
    setAddress('')
    setDescription('')
    setCreateDatacenterId('')
    setCreateNetworkId('')
    setCreateServerId('')
  }

  const handleCreate = () => {
    if (!canManage) return
    if (
      isMembershipPinIncomplete(
        scope,
        createDatacenterId,
        createNetworkId,
        createServerId,
      )
    ) {
      return
    }
    const trimmed = address.trim()
    if (!IP_LITERAL_OR_CIDR.test(trimmed)) {
      setError('Enter a valid IPv4/IPv6 address or CIDR.')
      return
    }
    setError(null)
    createMutation.mutate(
      buildCreateIpBody({
        address: trimmed,
        allocation,
        scope,
        description,
        createDatacenterId,
        createNetworkId,
        createServerId,
      }),
      {
        onSuccess: () => resetCreateForm(),
        onError: (err) => {
          setError(mutationErrorMessage(err, 'Failed to create IP'))
        },
      },
    )
  }

  const handleDelete = (ipId: string) => {
    if (!canManage) return
    setError(null)
    deleteMutation.mutate(ipId, {
      onSuccess: () => {
        if (editingId === ipId) setEditingId(null)
      },
      onError: (err) => {
        setError(mutationErrorMessage(err, 'Failed to delete IP'))
      },
    })
  }

  const beginEdit = (ip: IpRecord) => {
    setEditingId(ip.id)
    setEditAddress(ip.address)
    setEditDescription(ip.description ?? '')
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
    if (
      isMembershipPinIncomplete(
        editScope,
        editDatacenterId,
        editNetworkId,
        editServerId,
      )
    ) {
      return
    }
    setError(null)
    updateMutation.mutate(
      {
        ipId: editingId,
        body: buildUpdateIpBody({
          description: editDescription,
          scope: editScope,
          datacenterId: editDatacenterId,
          networkId: editNetworkId,
          serverId: editServerId,
        }),
      },
      {
        onSuccess: () => setEditingId(null),
        onError: (err) => {
          setError(mutationErrorMessage(err, 'Failed to update IP'))
        },
      },
    )
  }

  return (
    <View style={styles.root}>
      <Text style={orgPanelStyles.pageTitle}>Addresses</Text>
      <Text style={orgPanelStyles.pageCopy}>
        Organization address pool for ingress and internal routing.
      </Text>

      {displayError ? (
        <Text style={orgPanelStyles.error}>{displayError}</Text>
      ) : null}

      <AddressFiltersPanel
        scopeFilter={scopeFilter}
        allocationFilter={allocationFilter}
        datacenterFilter={datacenterFilter}
        datacenters={datacenters}
        onScopeFilterChange={setScopeFilter}
        onAllocationFilterChange={setAllocationFilter}
        onDatacenterFilterChange={setDatacenterFilter}
      />

      {canManage ? (
        <AddAddressPanel
          address={address}
          description={description}
          allocation={allocation}
          scope={scope}
          datacenters={datacenters}
          networks={networks}
          servers={servers}
          createDatacenterId={createDatacenterId}
          createNetworkId={createNetworkId}
          createServerId={createServerId}
          createDisabled={createDisabled}
          creating={creating}
          onAddressChange={setAddress}
          onDescriptionChange={setDescription}
          onAllocationChange={setAllocation}
          onScopeChange={handleCreateScopeChange}
          onDatacenterIdChange={handleCreateDatacenterIdChange}
          onNetworkIdChange={setCreateNetworkId}
          onServerIdChange={handleCreateServerIdChange}
          onCreate={handleCreate}
        />
      ) : null}

      <AddressPoolPanel
        loading={loading}
        ips={ips}
        editingId={editingId}
        editAddress={editAddress}
        editDescription={editDescription}
        editAllocation={editAllocation}
        editScope={editScope}
        editDatacenterId={editDatacenterId}
        editNetworkId={editNetworkId}
        editServerId={editServerId}
        datacenters={datacenters}
        networks={networks}
        servers={servers}
        savingEdit={savingEdit}
        deletingId={deletingId}
        canManage={canManage}
        serverById={serverById}
        networkById={networkById}
        datacenterById={datacenterById}
        onDescriptionChange={setEditDescription}
        onDatacenterIdChange={handleEditDatacenterIdChange}
        onNetworkIdChange={setEditNetworkId}
        onServerIdChange={handleEditServerIdChange}
        onCancelEdit={cancelEdit}
        onSaveEdit={handleSaveEdit}
        onBeginEdit={beginEdit}
        onDelete={handleDelete}
      />
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
  editCard: {
    borderColor: chrome.accent,
  },
  fieldLabel: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
    marginBottom: spacing.xs,
  },
})
