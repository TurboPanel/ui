import { useMemo, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { NetworkErrorLine } from '@/components/org/network/network-error-line'
import { NetworkListItem } from '@/components/org/network/network-rows'
import { panelStyles } from '@/components/ui/panel-styles'
import {
  Button,
  ButtonRow,
  EmptyState,
  FormField,
  InlineNotice,
  LoadingState,
  SectionPanel,
  SegmentedControl,
  TextField,
} from '@/components/ui'
import {
  isValidDefaultBridgeCidr,
  parseDockerAddressPoolDrafts,
  parseDockerNetworkAddressingDraft,
  type DockerAddressPoolDraft,
  type DockerAddressPoolDraftError,
  type DockerNetworkAddressingDraft,
  type DockerNetworkAddressingField,
} from '@/lib/docker-addressing'
import {
  DOCKER_ADDRESS_POOLS_MAX,
  DOCKER_NETWORK_MTU_MAX,
  DOCKER_NETWORK_MTU_MIN,
  type NetworkRecord,
  type OrganizationDockerNetworking,
  type OrgServerRecord,
} from '@/lib/instance-api'
import {
  describeNetworkError,
  type NetworkErrorDescription,
} from '@/lib/network-error-copy'
import {
  useCreateNetwork,
  useDeleteNetwork,
  useNetworks,
  useOrgDockerNetworking,
  useSaveOrgDockerNetworking,
} from '@/lib/queries/topology'
import { useOrgServers } from '@/lib/queries/servers'
import { useCan } from '@/lib/query-client'
import { spacing } from '@/lib/theme'

// RFC1918 form placeholders — documentation examples, not reachable hosts.
const PLACEHOLDER_POOL_BASE = '10.210.0.0/16' // NOSONAR typescript:S1313 — form placeholder, not a reachable host
const PLACEHOLDER_BRIDGE_BIP = '172.17.0.1/16' // NOSONAR typescript:S1313 — Docker default docker0 bip example, not a reachable host
const PLACEHOLDER_DOCKER_SUBNET = '10.212.0.0/24' // NOSONAR typescript:S1313 — form placeholder, not a reachable host
const PLACEHOLDER_DOCKER_IP_RANGE = '10.212.0.128/25' // NOSONAR typescript:S1313 — form placeholder, not a reachable host
const PLACEHOLDER_DOCKER_GATEWAY = '10.212.0.1' // NOSONAR typescript:S1313 — form placeholder, not a reachable host

function serverTitle(server: OrgServerRecord): string {
  return server.name?.trim() || server.hostname?.trim() || server.id
}

const EMPTY_POOL_DRAFT: DockerAddressPoolDraft = { base: '', size: '' }

type AddressPoolRowDraft = DockerAddressPoolDraft & { id: string }

function newPoolRowId(): string {
  return crypto.randomUUID()
}

function poolDraftsFrom(stored: OrganizationDockerNetworking | undefined): AddressPoolRowDraft[] {
  return (stored?.addressPools ?? []).map((pool) => ({
    id: newPoolRowId(),
    base: pool.base,
    size: String(pool.size),
  }))
}

function poolFieldError(
  error: DockerAddressPoolDraftError | null,
  index: number,
  field: 'base' | 'size',
): string | null {
  if (error?.index !== index) return null
  if (error === null) return null
  if (error.field === field) return error.message
  // Overlap is a property of the pair; hang it on the base field.
  if (error.field === 'overlap' && field === 'base') return error.message
  return null
}

function AddressPoolRow({
  index,
  draft,
  error,
  disabled,
  onChange,
  onRemove,
}: Readonly<{
  index: number
  draft: DockerAddressPoolDraft
  error: DockerAddressPoolDraftError | null
  disabled: boolean
  onChange: (next: DockerAddressPoolDraft) => void
  onRemove: () => void
}>) {
  return (
    <View style={styles.poolRow}>
      <View style={styles.poolBase}>
        <TextField
          label={`Pool ${index + 1} base`}
          value={draft.base}
          onChangeText={(base) => onChange({ ...draft, base })}
          placeholder={PLACEHOLDER_POOL_BASE}
          error={poolFieldError(error, index, 'base')}
          editable={!disabled}
          accessibilityLabel={`Address pool ${index + 1} base CIDR`}
          autoCapitalize="none"
          autoCorrect={false}
          mono
        />
      </View>
      <View style={styles.poolSize}>
        <TextField
          label="Size"
          value={draft.size}
          onChangeText={(size) => onChange({ ...draft, size })}
          placeholder="24"
          error={poolFieldError(error, index, 'size')}
          editable={!disabled}
          keyboardType="number-pad"
          accessibilityLabel={`Address pool ${index + 1} network size`}
          mono
        />
      </View>
      <Button
        label="Remove"
        size="sm"
        disabled={disabled}
        onPress={onRemove}
        accessibilityLabel={`Remove address pool ${index + 1}`}
      />
    </View>
  )
}

/**
 * Org-wide dockerd `default-address-pools` + `bip`. Host configuration, not
 * a per-network registration: every enrolled host merges it into
 * `/etc/docker/daemon.json` and restarts dockerd.
 */
function DockerHostAddressPoolsPanel({ orgId }: Readonly<{ orgId: string }>) {
  const query = useOrgDockerNetworking(orgId)
  const saveMutation = useSaveOrgDockerNetworking(orgId)
  const [poolDrafts, setPoolDrafts] = useState<AddressPoolRowDraft[] | null>(null)
  const [bridgeDraft, setBridgeDraft] = useState<string | null>(null)
  const [poolError, setPoolError] = useState<DockerAddressPoolDraftError | null>(null)
  const [bridgeError, setBridgeError] = useState<string | null>(null)
  const [error, setError] = useState<NetworkErrorDescription | null>(null)

  const stored = query.data
  const storedPools = useMemo(() => poolDraftsFrom(stored), [stored])
  // A failed read (anything but the 403 the hook already folds into Docker
  // defaults) must not look like an empty configuration: the PUT is
  // replace-all, so saving over a config that never loaded would wipe it.
  // Editing stays off until a retry or refetch brings real data back.
  const queryError = query.isError
    ? describeNetworkError(query.error, 'Failed to load Docker host addressing')
    : null
  const unloaded = query.isError && stored === undefined
  const pools = poolDrafts ?? storedPools
  const bridge = bridgeDraft ?? stored?.defaultBridgeCidr ?? ''
  const pending = saveMutation.isPending || query.isLoading || unloaded
  const dirty = poolDrafts !== null || bridgeDraft !== null
  const usingDefaults =
    !unloaded &&
    pools.every((row) => row.base.trim().length === 0 && row.size.trim().length === 0) &&
    bridge.trim().length === 0

  const updatePool = (index: number, next: DockerAddressPoolDraft) => {
    setPoolError(null)
    setPoolDrafts(pools.map((row, i) => (i === index ? { ...row, ...next } : row)))
  }
  const removePool = (index: number) => {
    setPoolError(null)
    setPoolDrafts(pools.filter((_, i) => i !== index))
  }
  const addPool = () => {
    setPoolError(null)
    setPoolDrafts([...pools, { id: newPoolRowId(), ...EMPTY_POOL_DRAFT }])
  }
  const reset = () => {
    setPoolDrafts(null)
    setBridgeDraft(null)
    setPoolError(null)
    setBridgeError(null)
    setError(null)
  }

  const save = () => {
    setError(null)
    const parsed = parseDockerAddressPoolDrafts(pools)
    if (!parsed.ok) {
      setPoolError(parsed.error)
      return
    }
    setPoolError(null)
    const bridgeText = bridge.trim()
    if (bridgeText.length > 0 && !isValidDefaultBridgeCidr(bridgeText)) {
      setBridgeError(
        `Enter the bridge host address with its prefix (${PLACEHOLDER_BRIDGE_BIP}), not the network address.`,
      )
      return
    }
    setBridgeError(null)
    saveMutation.mutate(
      {
        addressPools: parsed.pools,
        defaultBridgeCidr: bridgeText.length > 0 ? bridgeText : null,
      },
      {
        onSuccess: reset,
        onError: (err) => {
          setError(describeNetworkError(err, 'Failed to save Docker host addressing'))
        },
      },
    )
  }

  return (
    <SectionPanel
      title="Host address pools"
      hint="Manage-gated · every enrolled host"
      collapsible
      defaultCollapsed
    >
      <InlineNotice
        tone="warning"
        title="Saving restarts dockerd on every enrolled host."
        body="Hosts merge this into /etc/docker/daemon.json on their next daemon session and restart dockerd. Networks and containers that already exist keep their addresses — pools only affect networks created afterwards."
      />
      <NetworkErrorLine error={queryError} />
      {unloaded ? (
        <Button
          label="Retry"
          size="sm"
          busy={query.isFetching}
          onPress={() => void query.refetch()}
          accessibilityLabel="Retry loading host addressing"
        />
      ) : null}
      <NetworkErrorLine error={error} />
      {query.isLoading ? <LoadingState label="Loading host addressing…" /> : null}
      {usingDefaults ? (
        <Text style={panelStyles.muted}>
          Docker&apos;s built-in defaults apply: no pools are declared and the
          default bridge keeps its own address. Add a pool to move new networks
          off the ranges Docker picks by itself.
        </Text>
      ) : null}
      <View style={styles.poolList}>
        {pools.map((draft, index) => (
          <AddressPoolRow
            key={draft.id}
            index={index}
            draft={draft}
            error={poolError}
            disabled={pending}
            onChange={(next) => updatePool(index, next)}
            onRemove={() => removePool(index)}
          />
        ))}
      </View>
      <Text style={panelStyles.muted}>
        Base is the pool CIDR; size is the prefix length dockerd carves each
        new network at — at least the base prefix, at most /30 (IPv4) or /126
        (IPv6). Up to {DOCKER_ADDRESS_POOLS_MAX} pools.
      </Text>
      <Button
        label="Add pool"
        size="sm"
        disabled={pending || pools.length >= DOCKER_ADDRESS_POOLS_MAX}
        onPress={addPool}
        accessibilityLabel="Add address pool"
      />
      <TextField
        label="Default bridge (optional)"
        value={bridge}
        onChangeText={(next) => {
          setBridgeError(null)
          setBridgeDraft(next)
        }}
        placeholder={PLACEHOLDER_BRIDGE_BIP}
        hint="dockerd bip — the docker0 bridge's own host address with prefix, not a network address. Empty keeps Docker's default."
        error={bridgeError}
        editable={!pending}
        accessibilityLabel="Default bridge host address"
        autoCapitalize="none"
        autoCorrect={false}
        mono
      />
      <ButtonRow>
        <Button
          label="Save"
          variant="primary"
          busy={saveMutation.isPending}
          disabled={pending || !dirty}
          onPress={save}
          accessibilityLabel="Save host address pools"
        />
        {dirty ? (
          <Button label="Discard" disabled={pending} onPress={reset} />
        ) : null}
      </ButtonRow>
    </SectionPanel>
  )
}

const EMPTY_ADDRESSING: DockerNetworkAddressingDraft = {
  subnet: '',
  ipRange: '',
  gateway: '',
  mtu: '',
}

function addressingFieldError(
  error: { field: DockerNetworkAddressingField; message: string } | null,
  field: DockerNetworkAddressingField,
): string | null {
  return error?.field === field ? error.message : null
}

/**
 * Optional addressing for a new Docker registration. The dependencies the
 * API enforces are encoded in the hints and pre-validated: IP range and
 * gateway require a subnet and must sit inside it; MTU is 1280–9000.
 */
function DockerNetworkAddressingFields({
  draft,
  error,
  disabled,
  onChange,
}: Readonly<{
  draft: DockerNetworkAddressingDraft
  error: { field: DockerNetworkAddressingField; message: string } | null
  disabled: boolean
  onChange: (next: DockerNetworkAddressingDraft) => void
}>) {
  const hasSubnet = draft.subnet.trim().length > 0
  return (
    <>
      <TextField
        label="Subnet (optional)"
        value={draft.subnet}
        onChangeText={(subnet) => onChange({ ...draft, subnet })}
        placeholder={PLACEHOLDER_DOCKER_SUBNET}
        hint="Given to docker network create --subnet the first time the daemon creates it. Empty lets Docker pick from the host pools."
        error={addressingFieldError(error, 'subnet')}
        editable={!disabled}
        accessibilityLabel="Docker network subnet"
        autoCapitalize="none"
        autoCorrect={false}
        mono
      />
      <TextField
        label="IP range (optional)"
        value={draft.ipRange}
        onChangeText={(ipRange) => onChange({ ...draft, ipRange })}
        placeholder={PLACEHOLDER_DOCKER_IP_RANGE}
        hint={
          hasSubnet
            ? 'Slice of the subnet containers are assigned from (--ip-range).'
            : 'Requires a subnet.'
        }
        error={addressingFieldError(error, 'ipRange')}
        editable={!disabled && hasSubnet}
        accessibilityLabel="Docker network IP range"
        autoCapitalize="none"
        autoCorrect={false}
        mono
      />
      <TextField
        label="Gateway (optional)"
        value={draft.gateway}
        onChangeText={(gateway) => onChange({ ...draft, gateway })}
        placeholder={PLACEHOLDER_DOCKER_GATEWAY}
        hint={
          hasSubnet
            ? 'Bare address inside the subnet (--gateway), no prefix.'
            : 'Requires a subnet.'
        }
        error={addressingFieldError(error, 'gateway')}
        editable={!disabled && hasSubnet}
        accessibilityLabel="Docker network gateway"
        autoCapitalize="none"
        autoCorrect={false}
        mono
      />
      <TextField
        label="MTU (optional)"
        value={draft.mtu}
        onChangeText={(mtu) => onChange({ ...draft, mtu })}
        placeholder="1500"
        hint={`Bridge MTU, ${DOCKER_NETWORK_MTU_MIN}–${DOCKER_NETWORK_MTU_MAX}. Lower it when the network rides a tunnel.`}
        error={addressingFieldError(error, 'mtu')}
        editable={!disabled}
        keyboardType="number-pad"
        accessibilityLabel="Docker network MTU"
        mono
      />
    </>
  )
}

/**
 * Register-network form. Owns its own field state so the parent section only
 * coordinates data fetching and layout. Addressing goes under `options`
 * only — never a top-level `cidr` beside `options.subnet`, which the API
 * refuses when the pair disagrees.
 */
function DockerNetworkRegisterPanel({
  orgId,
  servers,
}: Readonly<{ orgId: string; servers: OrgServerRecord[] }>) {
  const [error, setError] = useState<NetworkErrorDescription | null>(null)
  const [displayName, setDisplayName] = useState('')
  const [dockerNetworkName, setDockerNetworkName] = useState('')
  const [hostPinServerId, setHostPinServerId] = useState('')
  const [addressing, setAddressing] =
    useState<DockerNetworkAddressingDraft>(EMPTY_ADDRESSING)
  const [addressingError, setAddressingError] = useState<{
    field: DockerNetworkAddressingField
    message: string
  } | null>(null)
  const createMutation = useCreateNetwork(orgId)

  const hostPinOptions = useMemo(
    () => [
      { value: '', label: 'None' },
      ...servers.map((server) => ({
        value: server.id,
        label: serverTitle(server),
      })),
    ],
    [servers],
  )

  const creating = createMutation.isPending
  const createDisabled = creating || dockerNetworkName.trim().length === 0

  function handleRegister() {
    setError(null)
    const parsed = parseDockerNetworkAddressingDraft(addressing)
    if (!parsed.ok) {
      setAddressingError({ field: parsed.field, message: parsed.message })
      return
    }
    setAddressingError(null)
    createMutation.mutate(
      {
        organizationId: orgId,
        kind: 'docker',
        name: displayName.trim() || undefined,
        serverId: hostPinServerId || undefined,
        options: {
          dockerNetworkName: dockerNetworkName.trim(),
          ...parsed.addressing,
        },
      },
      {
        onSuccess: () => {
          setDisplayName('')
          setDockerNetworkName('')
          setHostPinServerId('')
          setAddressing(EMPTY_ADDRESSING)
        },
        onError: (err) => {
          setError(describeNetworkError(err, 'Failed to create Docker network'))
        },
      },
    )
  }

  return (
    <SectionPanel
      title="Register Docker network"
      hint="Manage-gated"
      collapsible
      defaultCollapsed
    >
      <NetworkErrorLine error={error} />
      <TextField
        label="Display name"
        placeholder="Optional label"
        value={displayName}
        onChangeText={setDisplayName}
      />
      <TextField
        label="Docker network name"
        hint="Must match compose networks.*.name on deploy."
        placeholder="turbopanel-shared"
        value={dockerNetworkName}
        onChangeText={setDockerNetworkName}
        autoCapitalize="none"
        autoCorrect={false}
        mono
      />
      <FormField
        label="Host pin (optional)"
        hint="Pin to a host for a host-local external network."
      >
        <SegmentedControl
          options={hostPinOptions}
          value={hostPinServerId}
          onChange={setHostPinServerId}
          accessibilityLabel="Host pin"
        />
      </FormField>
      <DockerNetworkAddressingFields
        draft={addressing}
        error={addressingError}
        disabled={creating}
        onChange={(next) => {
          setAddressingError(null)
          setAddressing(next)
        }}
      />
      <Text style={panelStyles.muted}>
        Addressing applies when the daemon first creates the network. Docker
        cannot re-range an existing network.
      </Text>
      <Button
        label="Register"
        variant="primary"
        busy={creating}
        disabled={createDisabled}
        onPress={handleRegister}
      />
    </SectionPanel>
  )
}

function DockerNetworkListPanel({
  orgId,
  networks,
  loading,
  canManage,
}: Readonly<{
  orgId: string
  networks: NetworkRecord[]
  loading: boolean
  canManage: boolean
}>) {
  const [error, setError] = useState<NetworkErrorDescription | null>(null)
  const deleteMutation = useDeleteNetwork(orgId)
  const deletingId = deleteMutation.isPending ? deleteMutation.variables : undefined

  function handleDelete(networkId: string) {
    setError(null)
    deleteMutation.mutate(networkId, {
      onError: (err) => {
        setError(describeNetworkError(err, 'Failed to delete Docker network'))
      },
    })
  }

  return (
    <SectionPanel
      title="Docker networks"
      hint={loading ? 'Loading…' : `${networks.length} network(s)`}
    >
      <NetworkErrorLine error={error} />
      {loading && networks.length === 0 ? (
        <LoadingState label="Loading Docker networks…" />
      ) : null}
      {!loading && networks.length === 0 ? (
        <EmptyState title="No Docker networks registered yet." />
      ) : null}
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
  )
}

/**
 * Platform-allocated managed-engine network. The API refuses PATCH and DELETE
 * on these rows, so this is a read-only listing with no affordances. Hidden
 * entirely until the platform has allocated one.
 */
function ManagedNetworkListPanel({
  networks,
}: Readonly<{ networks: NetworkRecord[] }>) {
  if (networks.length === 0) return null

  return (
    <SectionPanel title="Managed networks" hint="Platform-allocated">
      <View style={styles.list}>
        {networks.map((network) => (
          <NetworkListItem key={network.id} network={network} showDelete={false} />
        ))}
      </View>
    </SectionPanel>
  )
}

/**
 * Docker network registry for compose external networks, plus the org-wide
 * host addressing dockerd carves new networks from.
 * Deliberately quiet — deploy identity, not topology.
 */
export function NetworkDockerSection({
  orgId,
}: Readonly<{ orgId: string }>) {
  const canManage = useCan('organization', orgId, 'organization:manage')

  const networksQuery = useNetworks(orgId, { kind: 'docker' })
  const managedQuery = useNetworks(orgId, { kind: 'managed' })
  const serversQuery = useOrgServers(orgId)

  const networks = networksQuery.data?.networks ?? []
  const managedNetworks = managedQuery.data?.networks ?? []
  const servers = serversQuery.data?.servers ?? []

  const loading =
    (networksQuery.isLoading && !networksQuery.isPlaceholderData) ||
    serversQuery.isLoading

  const queryError = networksQuery.isError
    ? describeNetworkError(networksQuery.error, 'Failed to load Docker networks')
    : null

  return (
    <View style={styles.root}>
      <Text style={panelStyles.pageTitle}>Docker networks</Text>
      <Text style={panelStyles.pageCopy}>
        External Docker network registry for compose. Compose must reference the
        same name under networks.*.name. Host address pools decide which ranges
        dockerd hands to networks that name no subnet.
      </Text>

      <NetworkErrorLine error={queryError} />

      {canManage ? <DockerHostAddressPoolsPanel orgId={orgId} /> : null}

      {canManage ? (
        <DockerNetworkRegisterPanel orgId={orgId} servers={servers} />
      ) : null}

      <DockerNetworkListPanel
        orgId={orgId}
        networks={networks}
        loading={loading}
        canManage={canManage}
      />

      <ManagedNetworkListPanel networks={managedNetworks} />
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
  poolList: {
    gap: spacing.sm,
  },
  poolRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-end',
    gap: spacing.sm,
  },
  poolBase: {
    flexGrow: 1,
    flexBasis: 220,
    minWidth: 0,
  },
  poolSize: {
    width: 96,
  },
})
