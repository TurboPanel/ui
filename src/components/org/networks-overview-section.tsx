import { useEffect, useMemo, useState } from 'react'
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
  NetworkKind,
  NetworkRecord,
  OrgServerRecord,
} from '@/lib/instance-api'
import {
  useCreateNetwork,
  useDatacenters,
  useDeleteNetwork,
  useNetworks,
} from '@/lib/queries/topology'
import { useOrgServers } from '@/lib/queries/servers'
import { useCan } from '@/lib/query-client'
import { chrome, colors, spacing } from '@/lib/theme'

const NETWORK_KINDS: NetworkKind[] = ['datacenter', 'server', 'docker']

function serverTitle(server: OrgServerRecord): string {
  return server.displayName?.trim() || server.hostname?.trim() || server.id
}

function networkTitle(network: NetworkRecord): string {
  const dockerName = readDockerNetworkName(network)
  if (dockerName) return network.displayName?.trim() || dockerName
  return network.displayName?.trim() || network.cidr?.trim() || network.id
}

function readDockerNetworkName(network: NetworkRecord): string | null {
  const options = network.options
  if (options && typeof options === 'object' && !Array.isArray(options)) {
    const raw = (options as { dockerNetworkName?: unknown }).dockerNetworkName
    if (typeof raw === 'string' && raw.trim().length > 0) return raw.trim()
  }
  return null
}

function kindLabel(kind: NetworkKind): string {
  switch (kind) {
    case 'datacenter':
      return 'Datacenter'
    case 'server':
      return 'Server'
    case 'docker':
      return 'Docker'
  }
}

export function NetworkListItem({
  network,
  isDeleting,
  onDelete,
  showDelete = true,
}: Readonly<{
  network: NetworkRecord
  isDeleting?: boolean
  onDelete?: (networkId: string) => void
  showDelete?: boolean
}>) {
  return (
    <View style={orgPanelStyles.detailCard}>
      <View style={styles.cardHeader}>
        <Text style={orgPanelStyles.detailTitle}>{networkTitle(network)}</Text>
        {showDelete && onDelete ? (
          <Pressable
            style={[styles.secondaryButton, isDeleting && styles.buttonDisabled]}
            disabled={isDeleting}
            onPress={() => onDelete(network.id)}
          >
            <Text style={styles.secondaryButtonText}>
              {isDeleting ? 'Deleting…' : 'Delete'}
            </Text>
          </Pressable>
        ) : null}
      </View>
      <View style={styles.badgeRow}>
        <Text style={styles.badge}>{kindLabel(network.kind)}</Text>
        {(() => {
          const dockerName = readDockerNetworkName(network)
          return dockerName ? (
            <Text style={styles.mono} selectable>
              {dockerName}
            </Text>
          ) : null
        })()}
        {network.cidr ? (
          <Text style={styles.mono} selectable>
            {network.cidr}
          </Text>
        ) : (
          <Text style={orgPanelStyles.muted}>No CIDR</Text>
        )}
      </View>
      <Text style={orgPanelStyles.detailLine}>
        <Text style={orgPanelStyles.detailLabel}>Created: </Text>
        {new Date(network.createdAt).toLocaleString()}
      </Text>
    </View>
  )
}

function ServerPickerList({
  servers,
  selectedServerId,
  onSelect,
}: Readonly<{
  servers: OrgServerRecord[]
  selectedServerId: string
  onSelect: (id: string) => void
}>) {
  return (
    <View style={styles.list}>
      {servers.map((server) => {
        const isSelected = server.id === selectedServerId
        return (
          <Pressable
            key={server.id}
            style={[
              orgPanelStyles.detailCard,
              isSelected && styles.selectedCard,
              webPointer,
            ]}
            onPress={() => onSelect(server.id)}
          >
            <Text style={orgPanelStyles.detailTitle}>
              {serverTitle(server)}
            </Text>
            <Text style={orgPanelStyles.detailLine}>
              <Text style={orgPanelStyles.detailLabel}>Status: </Text>
              {server.connected ? 'Online' : 'Offline'}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}

function DatacenterPickerList({
  datacenters,
  selectedId,
  onSelect,
}: Readonly<{
  datacenters: DatacenterRecord[]
  selectedId: string
  onSelect: (id: string) => void
}>) {
  return (
    <View style={styles.list}>
      {datacenters.map((row) => {
        const isSelected = row.id === selectedId
        return (
          <Pressable
            key={row.id}
            style={[
              orgPanelStyles.detailCard,
              isSelected && styles.selectedCard,
              webPointer,
            ]}
            onPress={() => onSelect(row.id)}
          >
            <Text style={orgPanelStyles.detailTitle}>
              {row.displayName?.trim() || row.id}
            </Text>
            {row.description?.trim() ? (
              <Text style={orgPanelStyles.detailLine}>{row.description}</Text>
            ) : null}
          </Pressable>
        )
      })}
    </View>
  )
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

type NetworkListFilters = {
  kind?: NetworkKind
  datacenterId?: string
  serverId?: string
}

function buildNetworkListFilters(
  kindFilter: NetworkKind | 'all',
  datacenterFilter: string,
  serverFilter: string,
): NetworkListFilters {
  const filters: NetworkListFilters = {}
  if (kindFilter !== 'all') filters.kind = kindFilter
  if (datacenterFilter) filters.datacenterId = datacenterFilter
  if (serverFilter) filters.serverId = serverFilter
  return filters
}

type CreateNetworkFormState = Readonly<{
  organizationId: string
  kind: NetworkKind
  displayName: string
  cidr: string
  serverId: string
  datacenterId: string
  dockerNetworkName: string
}>

function createScopeReady(form: CreateNetworkFormState): boolean {
  if (form.kind === 'datacenter') return form.datacenterId.length > 0
  if (form.kind === 'server') return form.serverId.length > 0
  return true
}

function buildCreateNetworkBody(form: CreateNetworkFormState) {
  const body: {
    organizationId: string
    kind: NetworkKind
    displayName?: string
    cidr?: string
    serverId?: string
    datacenterId?: string
    options?: { dockerNetworkName: string }
  } = {
    organizationId: form.organizationId,
    kind: form.kind,
    displayName: form.displayName.trim() || undefined,
    cidr: form.cidr.trim() || undefined,
  }
  if (form.kind === 'server' && form.serverId) {
    body.serverId = form.serverId
  }
  if (form.kind === 'datacenter' && form.datacenterId) {
    body.datacenterId = form.datacenterId
  }
  const dockerName = form.dockerNetworkName.trim()
  if (form.kind === 'docker' && dockerName) {
    body.options = { dockerNetworkName: dockerName }
  }
  return body
}

function CreateNetworkKindFields({
  kind,
  servers,
  datacenters,
  serverId,
  datacenterId,
  dockerNetworkName,
  onServerIdChange,
  onDatacenterIdChange,
  onDockerNetworkNameChange,
}: Readonly<{
  kind: NetworkKind
  servers: OrgServerRecord[]
  datacenters: DatacenterRecord[]
  serverId: string
  datacenterId: string
  dockerNetworkName: string
  onServerIdChange: (id: string) => void
  onDatacenterIdChange: (id: string) => void
  onDockerNetworkNameChange: (name: string) => void
}>) {
  if (kind === 'server') {
    return (
      <>
        <Text style={styles.fieldLabel}>Server</Text>
        <ServerPickerList
          servers={servers}
          selectedServerId={serverId}
          onSelect={onServerIdChange}
        />
      </>
    )
  }
  if (kind === 'datacenter') {
    return (
      <>
        <Text style={styles.fieldLabel}>Datacenter</Text>
        <DatacenterPickerList
          datacenters={datacenters}
          selectedId={datacenterId}
          onSelect={onDatacenterIdChange}
        />
      </>
    )
  }
  if (kind !== 'docker') return null
  return (
    <>
      <Text style={styles.fieldLabel}>Docker network name</Text>
      <Text style={orgPanelStyles.muted}>
        Org-scoped external Docker network. Compose must use the same name in
        networks.*.name.
      </Text>
      <TextInput
        value={dockerNetworkName}
        onChangeText={onDockerNetworkNameChange}
        placeholder="turbopanel-shared"
        placeholderTextColor={colors.textDim}
        style={styles.input}
        autoCapitalize="none"
        autoCorrect={false}
      />
    </>
  )
}

function CreateNetworkPanel({
  orgId,
  servers,
  datacenters,
  creating,
  onCreate,
}: Readonly<{
  orgId: string
  servers: OrgServerRecord[]
  datacenters: DatacenterRecord[]
  creating: boolean
  onCreate: (form: CreateNetworkFormState) => Promise<boolean>
}>) {
  const [kind, setKind] = useState<NetworkKind>('server')
  const [displayName, setDisplayName] = useState('')
  const [cidr, setCidr] = useState('')
  const [serverId, setServerId] = useState('')
  const [datacenterId, setDatacenterId] = useState('')
  const [dockerNetworkName, setDockerNetworkName] = useState('')

  const resetForm = () => {
    setDisplayName('')
    setCidr('')
    setServerId('')
    setDatacenterId('')
    setDockerNetworkName('')
  }

  const form: CreateNetworkFormState = {
    organizationId: orgId,
    kind,
    displayName,
    cidr,
    serverId,
    datacenterId,
    dockerNetworkName,
  }
  const scopeReady = createScopeReady(form)
  const createDisabled = creating || !scopeReady

  return (
    <SectionPanel title="Create network" hint="Manage-gated">
      <Text style={styles.fieldLabel}>Kind</Text>
      <View style={styles.chipRow}>
        {NETWORK_KINDS.map((networkKind) => (
          <FilterChip
            key={networkKind}
            label={kindLabel(networkKind)}
            active={kind === networkKind}
            onPress={() => setKind(networkKind)}
          />
        ))}
      </View>
      <Text style={styles.fieldLabel}>Display name</Text>
      <TextInput
        value={displayName}
        onChangeText={setDisplayName}
        placeholder="Optional name"
        placeholderTextColor={colors.textDim}
        style={styles.input}
      />
      <Text style={styles.fieldLabel}>CIDR</Text>
      <TextInput
        value={cidr}
        onChangeText={setCidr}
        placeholder="e.g. 10.0.0.0/24"
        placeholderTextColor={colors.textDim}
        style={styles.input}
        autoCapitalize="none"
        autoCorrect={false}
      />
      <CreateNetworkKindFields
        kind={kind}
        servers={servers}
        datacenters={datacenters}
        serverId={serverId}
        datacenterId={datacenterId}
        dockerNetworkName={dockerNetworkName}
        onServerIdChange={setServerId}
        onDatacenterIdChange={setDatacenterId}
        onDockerNetworkNameChange={setDockerNetworkName}
      />
      <Pressable
        style={[
          orgPanelStyles.toolbarBtnPrimary,
          createDisabled && styles.buttonDisabled,
          webPointer,
        ]}
        disabled={createDisabled}
        onPress={() => {
          onCreate(form)
            .then((created) => {
              if (created) resetForm()
            })
            .catch(() => {
              // Errors are surfaced via error state.
            })
        }}
      >
        {creating ? (
          <ActivityIndicator size="small" color={colors.textMuted} />
        ) : (
          <Text style={orgPanelStyles.toolbarBtnTextPrimary}>
            Create network
          </Text>
        )}
      </Pressable>
    </SectionPanel>
  )
}

function NetworksEmptyHint({
  loading,
  count,
}: Readonly<{ loading: boolean; count: number }>) {
  if (loading && count === 0) {
    return <Text style={orgPanelStyles.muted}>Loading networks…</Text>
  }
  if (!loading && count === 0) {
    return (
      <Text style={orgPanelStyles.muted}>No networks match these filters.</Text>
    )
  }
  return null
}

export function NetworksOverviewSection({
  orgId,
  serverId,
}: Readonly<{
  orgId: string
  /** Optional pre-filter when linked from a server detail page. */
  serverId?: string
}>) {
  const canManage = useCan('organization', orgId, 'organization:manage')
  const [error, setError] = useState<string | null>(null)
  const [kindFilter, setKindFilter] = useState<NetworkKind | 'all'>('all')
  const [datacenterFilter, setDatacenterFilter] = useState<string>('')
  const [serverFilter, setServerFilter] = useState<string>(serverId?.trim() ?? '')

  const networkFilters = useMemo(
    () => buildNetworkListFilters(kindFilter, datacenterFilter, serverFilter),
    [datacenterFilter, kindFilter, serverFilter],
  )

  const networksQuery = useNetworks(orgId, networkFilters)
  const serversQuery = useOrgServers(orgId)
  const datacentersQuery = useDatacenters(orgId)
  const createMutation = useCreateNetwork(orgId)
  const deleteMutation = useDeleteNetwork(orgId)

  const networks = networksQuery.data?.networks ?? []
  const servers = serversQuery.data?.servers ?? []
  const datacenters = datacentersQuery.data?.datacenters ?? []

  const loading =
    (networksQuery.isLoading && !networksQuery.isPlaceholderData) ||
    serversQuery.isLoading ||
    datacentersQuery.isLoading

  let queryError: string | null = null
  if (networksQuery.isError) {
    if (networksQuery.error instanceof Error) {
      queryError = networksQuery.error.message
    } else {
      queryError = 'Failed to load networks'
    }
  }
  const displayError =
    error ?? createMutation.actionError ?? deleteMutation.actionError ?? queryError

  const deletingId = deleteMutation.isPending
    ? deleteMutation.variables
    : undefined
  const creating = createMutation.isPending

  useEffect(() => {
    const pinned = serverId?.trim()
    if (pinned) setServerFilter(pinned)
  }, [serverId])

  const handleCreate = async (form: CreateNetworkFormState): Promise<boolean> => {
    if (!canManage) return false
    setError(null)
    return new Promise((resolve) => {
      createMutation.mutate(buildCreateNetworkBody(form), {
        onSuccess: () => resolve(true),
        onError: () => {
          setError(createMutation.actionError ?? 'Failed to create network')
          resolve(false)
        },
      })
    })
  }

  const handleDelete = (networkId: string) => {
    if (!canManage) return
    setError(null)
    deleteMutation.mutate(networkId, {
      onError: () => {
        setError(deleteMutation.actionError ?? 'Failed to delete network')
      },
    })
  }

  const serverOptions = useMemo(
    () =>
      [{ id: '', label: 'All servers' }].concat(
        servers.map((server) => ({
          id: server.id,
          label: serverTitle(server),
        })),
      ),
    [servers],
  )

  const datacenterOptions = useMemo(
    () =>
      [{ id: '', label: 'All datacenters' }].concat(
        datacenters.map((row) => ({
          id: row.id,
          label: row.displayName?.trim() || row.id,
        })),
      ),
    [datacenters],
  )

  return (
    <View style={styles.root}>
      <Text style={orgPanelStyles.pageTitle}>Networks</Text>
      <Text style={orgPanelStyles.pageCopy}>
        Organization networks across datacenters, servers, and Docker. Manage VPN
        meshes on the VPNs page.
      </Text>

      {displayError ? <Text style={orgPanelStyles.error}>{displayError}</Text> : null}

      <SectionPanel title="Filters" hint="Optional scope narrowing">
        <View style={styles.chipRow}>
          <FilterChip
            label="All"
            active={kindFilter === 'all'}
            onPress={() => setKindFilter('all')}
          />
          {NETWORK_KINDS.map((kind) => (
            <FilterChip
              key={kind}
              label={kindLabel(kind)}
              active={kindFilter === kind}
              onPress={() => setKindFilter(kind)}
            />
          ))}
        </View>
        <View style={styles.filterRow}>
          <View style={styles.filterCol}>
            <Text style={styles.fieldLabel}>Datacenter</Text>
            <View style={styles.chipRow}>
              {datacenterOptions.map((option) => (
                <FilterChip
                  key={option.id || 'all-dc'}
                  label={option.label}
                  active={datacenterFilter === option.id}
                  onPress={() => setDatacenterFilter(option.id)}
                />
              ))}
            </View>
          </View>
          <View style={styles.filterCol}>
            <Text style={styles.fieldLabel}>Server</Text>
            <View style={styles.chipRow}>
              {serverOptions.map((option) => (
                <FilterChip
                  key={option.id || 'all-srv'}
                  label={option.label}
                  active={serverFilter === option.id}
                  onPress={() => setServerFilter(option.id)}
                />
              ))}
            </View>
          </View>
        </View>
      </SectionPanel>

      {canManage ? (
        <CreateNetworkPanel
          orgId={orgId}
          servers={servers}
          datacenters={datacenters}
          creating={creating}
          onCreate={handleCreate}
        />
      ) : null}

      <SectionPanel
        title="Networks"
        hint={loading ? 'Loading…' : `${networks.length} network(s)`}
      >
        <NetworksEmptyHint loading={loading} count={networks.length} />
        <View style={styles.list}>
          {networks.map((network) => (
            <NetworkListItem
              key={network.id}
              network={network}
              isDeleting={deletingId === network.id}
              showDelete={canManage}
              onDelete={handleDelete}
            />
          ))}
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
  selectedCard: {
    borderColor: chrome.accent,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.xs,
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
    fontSize: 13,
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
  filterRow: {
    gap: spacing.md,
  },
  filterCol: {
    gap: spacing.xs,
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
