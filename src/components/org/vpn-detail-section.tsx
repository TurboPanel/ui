import { useMemo, useState, type ReactElement } from 'react'
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { SectionPanel } from '@/components/org/section-panel'
import { orgPanelStyles, webPointer } from '@/components/org/org-panel-styles'
import { useAuth } from '@/lib/auth-context'
import {
  applyVpn,
  createPeer,
  deletePeer,
  fetchIps,
  fetchNetworks,
  fetchOrgServers,
  fetchPeers,
  fetchVpn,
  isForbiddenError,
  updatePeer,
  updateVpn,
  type IpRecord,
  type NetworkRecord,
  type OrgServerRecord,
  type PeerRecord,
  type VpnApplyPeerResult,
  type VpnRecord,
} from '@/lib/instance-api'
import { useCan, useForbiddenRecovery } from '@/lib/query-client'
import { colors, spacing } from '@/lib/theme'

/** WireGuard Curve25519 public keys are 32 bytes → 44-char base64 with `=`. */
const WIREGUARD_PUBLIC_KEY_RE = /^[A-Za-z0-9+/]{43}=$/

type CreatePeerBody = {
  serverId: string
  publicKey: string
  tunnelAddress?: string
  listenPort?: number
  endpoint?: string
  ipId?: string
  presharedKey?: string
}

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback
}

function friendlyApiError(err: unknown, fallback: string): string {
  const raw = errorMessage(err, fallback)
  if (raw.includes('peer_server_conflict')) {
    return 'That server is already a peer on this VPN.'
  }
  if (raw.includes('peer_public_key_conflict')) {
    return 'That public key is already used by another peer on this VPN.'
  }
  if (raw.includes('vpn_has_no_peers')) {
    return 'Add at least one peer before applying.'
  }
  if (raw.includes('peer_tunnel_address_required')) {
    return 'Every peer needs a tunnel address before apply.'
  }
  if (raw.includes('daemon_key_unavailable')) {
    return 'A peer server is missing an active daemon key — reconnect the daemon.'
  }
  if (raw.includes('Invalid WireGuard public key')) {
    return 'Public key must be a 44-character WireGuard base64 key.'
  }
  return raw
}

function serverTitle(server: OrgServerRecord): string {
  return server.displayName?.trim() || server.hostname?.trim() || server.id
}

function vpnTitle(vpn: VpnRecord): string {
  return vpn.displayName?.trim() || 'Unnamed VPN'
}

function truncateKey(publicKey: string): string {
  if (publicKey.length <= 16) return publicKey
  return `${publicKey.slice(0, 8)}…${publicKey.slice(-6)}`
}

function parseOptionalListenPort(raw: string): number | undefined {
  const trimmed = raw.trim()
  if (trimmed.length === 0) return undefined
  const parsed = Number.parseInt(trimmed, 10)
  if (!Number.isInteger(parsed)) {
    throw new TypeError('Listen port must be an integer.')
  }
  return parsed
}

function buildCreatePeerBody(input: {
  serverId: string
  publicKey: string
  tunnelAddress: string
  listenPort: string
  endpoint: string
  ipId: string | null
  presharedKey: string
}): CreatePeerBody {
  const publicKey = input.publicKey.trim()
  if (!WIREGUARD_PUBLIC_KEY_RE.test(publicKey)) {
    throw new Error('Public key must be a 44-character WireGuard base64 key.')
  }
  if (!input.serverId) {
    throw new Error('Select a server for this peer.')
  }
  const listenPort = parseOptionalListenPort(input.listenPort)
  return {
    serverId: input.serverId,
    publicKey,
    ...(input.tunnelAddress.trim()
      ? { tunnelAddress: input.tunnelAddress.trim() }
      : {}),
    ...(listenPort !== undefined ? { listenPort } : {}),
    ...(input.endpoint.trim() ? { endpoint: input.endpoint.trim() } : {}),
    ...(input.ipId ? { ipId: input.ipId } : {}),
    ...(input.presharedKey.trim()
      ? { presharedKey: input.presharedKey.trim() }
      : {}),
  }
}

function PickerChip({
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

function PeerCard({
  peer,
  serverLabel,
  ipLabel,
  canManage,
  deleting,
  onDelete,
  onSaveTunnel,
}: Readonly<{
  peer: PeerRecord
  serverLabel: string
  ipLabel: string | null
  canManage: boolean
  deleting: boolean
  onDelete: () => void
  onSaveTunnel: (tunnelAddress: string) => void
}>) {
  const [tunnelDraft, setTunnelDraft] = useState(peer.tunnelAddress ?? '')
  const [confirmDelete, setConfirmDelete] = useState(false)

  return (
    <View style={orgPanelStyles.detailCard}>
      <Text style={orgPanelStyles.detailTitle}>{serverLabel}</Text>
      <Text style={orgPanelStyles.detailLine}>
        <Text style={orgPanelStyles.detailLabel}>Public key: </Text>
        <Text style={styles.mono} selectable>
          {truncateKey(peer.publicKey)}
        </Text>
      </Text>
      <Text style={orgPanelStyles.detailLine}>
        <Text style={orgPanelStyles.detailLabel}>Tunnel: </Text>
        {peer.tunnelAddress ?? '—'}
      </Text>
      <Text style={orgPanelStyles.detailLine}>
        <Text style={orgPanelStyles.detailLabel}>Listen port: </Text>
        {peer.listenPort ?? '—'}
      </Text>
      <Text style={orgPanelStyles.detailLine}>
        <Text style={orgPanelStyles.detailLabel}>Endpoint: </Text>
        {peer.endpoint ?? '—'}
      </Text>
      <Text style={orgPanelStyles.detailLine}>
        <Text style={orgPanelStyles.detailLabel}>Public IP: </Text>
        {ipLabel ?? '—'}
      </Text>

      {canManage ? (
        <View style={styles.peerEdit}>
          <Text style={styles.fieldLabel}>Tunnel address</Text>
          <TextInput
            value={tunnelDraft}
            onChangeText={setTunnelDraft}
            placeholder="e.g. 10.10.0.2"
            placeholderTextColor={colors.textDim}
            style={styles.input}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <View style={styles.actionsRow}>
            <Pressable
              style={[orgPanelStyles.toolbarBtnSecondary, webPointer]}
              onPress={() => onSaveTunnel(tunnelDraft.trim())}
            >
              <Text style={orgPanelStyles.toolbarBtnTextSecondary}>
                Save tunnel
              </Text>
            </Pressable>
            {confirmDelete ? (
              <>
                <Pressable
                  style={[
                    orgPanelStyles.toolbarBtnPrimary,
                    deleting && styles.buttonDisabled,
                    webPointer,
                  ]}
                  disabled={deleting}
                  onPress={onDelete}
                >
                  <Text style={orgPanelStyles.toolbarBtnTextPrimary}>
                    {deleting ? 'Removing…' : 'Confirm remove'}
                  </Text>
                </Pressable>
                <Pressable
                  style={[orgPanelStyles.toolbarBtnSecondary, webPointer]}
                  onPress={() => setConfirmDelete(false)}
                >
                  <Text style={orgPanelStyles.toolbarBtnTextSecondary}>
                    Cancel
                  </Text>
                </Pressable>
              </>
            ) : (
              <Pressable
                style={[orgPanelStyles.toolbarBtnSecondary, webPointer]}
                onPress={() => setConfirmDelete(true)}
              >
                <Text style={orgPanelStyles.toolbarBtnTextSecondary}>
                  Remove peer
                </Text>
              </Pressable>
            )}
          </View>
        </View>
      ) : null}
    </View>
  )
}

function formatApplyPeerStatus(result: VpnApplyPeerResult): string {
  if (result.status === 'queued') {
    return `queued (${result.commandId ?? '…'})`
  }
  if (result.error) {
    return `failed — ${result.error}`
  }
  return 'failed'
}

function ApplyResults({
  interfaceName,
  results,
  serverLabel,
}: Readonly<{
  interfaceName: string
  results: VpnApplyPeerResult[]
  serverLabel: (serverId: string) => string
}>) {
  return (
    <View style={styles.applyResults}>
      <Text style={orgPanelStyles.detailLine}>
        <Text style={orgPanelStyles.detailLabel}>Interface: </Text>
        {interfaceName}
      </Text>
      {results.map((result) => (
        <Text key={result.peerId} style={orgPanelStyles.detailLine}>
          {serverLabel(result.serverId)}: {formatApplyPeerStatus(result)}
        </Text>
      ))}
    </View>
  )
}

function VpnNetworkPanel({
  vpnNetworks,
  selectedNetworkId,
  canManage,
  dirty,
  pending,
  onSelect,
  onSave,
}: Readonly<{
  vpnNetworks: NetworkRecord[]
  selectedNetworkId: string | null
  canManage: boolean
  dirty: boolean
  pending: boolean
  onSelect: (networkId: string | null) => void
  onSave: () => void
}>) {
  return (
    <SectionPanel title="VPN network" hint="Optional CIDR link">
      <Text style={orgPanelStyles.muted}>
        Prefer a network of kind VPN so apply can derive interface prefixes
        from the CIDR.
      </Text>
      <View style={styles.chipRow}>
        <PickerChip
          label="None"
          active={selectedNetworkId === null}
          onPress={() => onSelect(null)}
        />
        {vpnNetworks.map((network) => {
          const label =
            network.displayName?.trim() ||
            network.cidr?.trim() ||
            network.id
          return (
            <PickerChip
              key={network.id}
              label={label}
              active={selectedNetworkId === network.id}
              onPress={() => onSelect(network.id)}
            />
          )
        })}
      </View>
      {canManage ? (
        <Pressable
          style={[
            orgPanelStyles.toolbarBtnSecondary,
            (!dirty || pending) && styles.buttonDisabled,
            webPointer,
          ]}
          disabled={!dirty || pending}
          onPress={onSave}
        >
          <Text style={orgPanelStyles.toolbarBtnTextSecondary}>
            {pending ? 'Saving…' : 'Save network link'}
          </Text>
        </Pressable>
      ) : null}
    </SectionPanel>
  )
}

function PeersPanel({
  peers,
  serverById,
  ipById,
  canManage,
  deletingPeerId,
  onDelete,
  onSaveTunnel,
}: Readonly<{
  peers: PeerRecord[]
  serverById: Map<string, OrgServerRecord>
  ipById: Map<string, IpRecord>
  canManage: boolean
  deletingPeerId: string | undefined
  onDelete: (peerId: string) => void
  onSaveTunnel: (peerId: string, tunnelAddress: string) => void
}>) {
  return (
    <SectionPanel title="Peers" hint={`${peers.length} peer(s)`}>
      {peers.length === 0 ? (
        <Text style={orgPanelStyles.muted}>
          No peers yet. Add at least two servers (one per site) to mesh
          datacenters.
        </Text>
      ) : (
        <View style={styles.list}>
          {peers.map((peer) => {
            const server = serverById.get(peer.serverId)
            const ip = peer.ipId ? ipById.get(peer.ipId) : undefined
            return (
              <PeerCard
                key={`${peer.id}-${peer.tunnelAddress ?? ''}`}
                peer={peer}
                serverLabel={server ? serverTitle(server) : peer.serverId}
                ipLabel={ip?.address ?? null}
                canManage={canManage}
                deleting={deletingPeerId === peer.id}
                onDelete={() => onDelete(peer.id)}
                onSaveTunnel={(tunnelAddress) =>
                  onSaveTunnel(peer.id, tunnelAddress)
                }
              />
            )
          })}
        </View>
      )}
    </SectionPanel>
  )
}

function AddPeerPanel({
  availableServers,
  publicIps,
  peerServerId,
  peerPublicKey,
  peerTunnelAddress,
  peerListenPort,
  peerEndpoint,
  peerIpId,
  peerPresharedKey,
  pending,
  onServerId,
  onPublicKey,
  onTunnelAddress,
  onListenPort,
  onEndpoint,
  onIpId,
  onPresharedKey,
  onSubmit,
}: Readonly<{
  availableServers: OrgServerRecord[]
  publicIps: IpRecord[]
  peerServerId: string
  peerPublicKey: string
  peerTunnelAddress: string
  peerListenPort: string
  peerEndpoint: string
  peerIpId: string | null
  peerPresharedKey: string
  pending: boolean
  onServerId: (id: string) => void
  onPublicKey: (value: string) => void
  onTunnelAddress: (value: string) => void
  onListenPort: (value: string) => void
  onEndpoint: (value: string) => void
  onIpId: (id: string | null) => void
  onPresharedKey: (value: string) => void
  onSubmit: () => void
}>) {
  return (
    <SectionPanel title="Add peer" hint="Manage-gated">
      <Text style={styles.fieldLabel}>Server</Text>
      {availableServers.length === 0 ? (
        <Text style={orgPanelStyles.muted}>
          All org servers are already peers, or none are enrolled.
        </Text>
      ) : (
        <View style={styles.chipRow}>
          {availableServers.map((server) => (
            <PickerChip
              key={server.id}
              label={serverTitle(server)}
              active={peerServerId === server.id}
              onPress={() => onServerId(server.id)}
            />
          ))}
        </View>
      )}

      <Text style={styles.fieldLabel}>WireGuard public key</Text>
      <TextInput
        value={peerPublicKey}
        onChangeText={onPublicKey}
        placeholder="44-character base64 key"
        placeholderTextColor={colors.textDim}
        style={[styles.input, styles.mono]}
        autoCapitalize="none"
        autoCorrect={false}
      />

      <Text style={styles.fieldLabel}>Tunnel address</Text>
      <TextInput
        value={peerTunnelAddress}
        onChangeText={onTunnelAddress}
        placeholder="Required before apply"
        placeholderTextColor={colors.textDim}
        style={styles.input}
        autoCapitalize="none"
        autoCorrect={false}
      />

      <Text style={styles.fieldLabel}>Listen port (optional)</Text>
      <TextInput
        value={peerListenPort}
        onChangeText={onListenPort}
        placeholder="51820"
        placeholderTextColor={colors.textDim}
        style={styles.input}
        keyboardType="number-pad"
      />

      <Text style={styles.fieldLabel}>Endpoint (optional)</Text>
      <TextInput
        value={peerEndpoint}
        onChangeText={onEndpoint}
        placeholder="host:port — or derive from public IP + port"
        placeholderTextColor={colors.textDim}
        style={styles.input}
        autoCapitalize="none"
        autoCorrect={false}
      />

      <Text style={styles.fieldLabel}>Public IP (optional)</Text>
      <View style={styles.chipRow}>
        <PickerChip
          label="None"
          active={peerIpId === null}
          onPress={() => onIpId(null)}
        />
        {publicIps.map((ip) => (
          <PickerChip
            key={ip.id}
            label={ip.displayName?.trim() || ip.address}
            active={peerIpId === ip.id}
            onPress={() => onIpId(ip.id)}
          />
        ))}
      </View>

      <Text style={styles.fieldLabel}>Preshared key (optional, write-only)</Text>
      <TextInput
        value={peerPresharedKey}
        onChangeText={onPresharedKey}
        placeholder="Never shown again after save"
        placeholderTextColor={colors.textDim}
        style={styles.input}
        secureTextEntry
        autoCapitalize="none"
        autoCorrect={false}
      />

      <Pressable
        style={[
          orgPanelStyles.toolbarBtnPrimary,
          pending && styles.buttonDisabled,
          webPointer,
        ]}
        disabled={pending || availableServers.length === 0}
        onPress={onSubmit}
      >
        {pending ? (
          <ActivityIndicator size="small" color={colors.textMuted} />
        ) : (
          <Text style={orgPanelStyles.toolbarBtnTextPrimary}>Add peer</Text>
        )}
      </Pressable>
    </SectionPanel>
  )
}

function ApplyWireguardPanel({
  peerCount,
  pending,
  applyResults,
  serverById,
  onApply,
}: Readonly<{
  peerCount: number
  pending: boolean
  applyResults: {
    interfaceName: string
    results: VpnApplyPeerResult[]
  } | null
  serverById: Map<string, OrgServerRecord>
  onApply: () => void
}>) {
  return (
    <SectionPanel title="Apply WireGuard" hint="Enqueues per-peer commands">
      <Text style={orgPanelStyles.muted}>
        Runs server.wireguard.apply on each peer host. Private keys stay on
        the daemon; preshared keys are never returned to the UI.
      </Text>
      <Pressable
        style={[
          orgPanelStyles.toolbarBtnPrimary,
          (pending || peerCount === 0) && styles.buttonDisabled,
          webPointer,
        ]}
        disabled={pending || peerCount === 0}
        onPress={onApply}
      >
        {pending ? (
          <ActivityIndicator size="small" color={colors.textMuted} />
        ) : (
          <Text style={orgPanelStyles.toolbarBtnTextPrimary}>Apply mesh</Text>
        )}
      </Pressable>
      {applyResults ? (
        <ApplyResults
          interfaceName={applyResults.interfaceName}
          results={applyResults.results}
          serverLabel={(serverId) => {
            const server = serverById.get(serverId)
            return server ? serverTitle(server) : serverId
          }}
        />
      ) : null}
    </SectionPanel>
  )
}

function vpnDetailGate(input: {
  vpnId: string
  vpn: VpnRecord | undefined
  loading: boolean
  loadError: unknown
  isError: boolean
}): ReactElement | null {
  if (!input.vpnId) {
    return (
      <View style={styles.root}>
        <Text style={orgPanelStyles.error}>Missing VPN id.</Text>
      </View>
    )
  }
  if (input.isError) {
    return (
      <View style={styles.root}>
        <Text style={orgPanelStyles.error}>
          {friendlyApiError(input.loadError, 'Failed to load VPN')}
        </Text>
      </View>
    )
  }
  if (input.loading && !input.vpn) {
    return (
      <View style={styles.root}>
        <Text style={orgPanelStyles.muted}>Loading VPN…</Text>
      </View>
    )
  }
  if (!input.vpn) {
    return (
      <View style={styles.root}>
        <Text style={orgPanelStyles.error}>VPN not found.</Text>
      </View>
    )
  }
  return null
}

export function VpnDetailSection({
  orgId,
  vpnId,
}: Readonly<{ orgId: string; vpnId: string }>) {
  const { handleUnauthorized } = useAuth()
  const queryClient = useQueryClient()
  const canManage = useCan('organization', orgId, 'organization:manage')
  const [error, setError] = useState<string | null>(null)
  const [linkNetworkId, setLinkNetworkId] = useState<string | null | undefined>(
    undefined,
  )

  const [peerServerId, setPeerServerId] = useState('')
  const [peerPublicKey, setPeerPublicKey] = useState('')
  const [peerTunnelAddress, setPeerTunnelAddress] = useState('')
  const [peerListenPort, setPeerListenPort] = useState('')
  const [peerEndpoint, setPeerEndpoint] = useState('')
  const [peerIpId, setPeerIpId] = useState<string | null>(null)
  const [peerPresharedKey, setPeerPresharedKey] = useState('')

  const [applyResults, setApplyResults] = useState<{
    interfaceName: string
    results: VpnApplyPeerResult[]
  } | null>(null)

  const vpnQuery = useQuery({
    queryKey: ['org', orgId, 'vpns', vpnId],
    queryFn: () => fetchVpn(vpnId),
    enabled: vpnId.length > 0,
  })
  const peersQuery = useQuery({
    queryKey: ['org', orgId, 'vpns', vpnId, 'peers'],
    queryFn: () => fetchPeers(vpnId),
    enabled: vpnId.length > 0,
  })
  const serversQuery = useQuery({
    queryKey: ['org', orgId, 'servers'],
    queryFn: fetchOrgServers,
  })
  const networksQuery = useQuery({
    queryKey: ['org', orgId, 'networks', 'vpn'],
    queryFn: () => fetchNetworks({ kind: 'vpn' }),
  })
  const publicIpsQuery = useQuery({
    queryKey: ['org', orgId, 'ips', 'public'],
    queryFn: () => fetchIps({ scope: 'public' }),
  })

  useForbiddenRecovery(vpnQuery.error)
  useForbiddenRecovery(peersQuery.error)
  useForbiddenRecovery(serversQuery.error)

  const invalidateVpn = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['org', orgId, 'vpns', vpnId] }),
      queryClient.invalidateQueries({
        queryKey: ['org', orgId, 'vpns', vpnId, 'peers'],
      }),
      queryClient.invalidateQueries({ queryKey: ['org', orgId, 'vpns'] }),
    ])
  }

  const onMutationError = async (err: unknown, fallback: string) => {
    if (isForbiddenError(err)) {
      await handleUnauthorized()
      return
    }
    setError(friendlyApiError(err, fallback))
  }

  const linkNetworkMutation = useMutation({
    mutationFn: (nextNetworkId: string | null) =>
      updateVpn(vpnId, { networkId: nextNetworkId }),
    onSuccess: async () => {
      setError(null)
      setLinkNetworkId(undefined)
      await invalidateVpn()
    },
    onError: (err) => onMutationError(err, 'Failed to update VPN network'),
  })

  const createPeerMutation = useMutation({
    mutationFn: () =>
      createPeer(
        vpnId,
        buildCreatePeerBody({
          serverId: peerServerId,
          publicKey: peerPublicKey,
          tunnelAddress: peerTunnelAddress,
          listenPort: peerListenPort,
          endpoint: peerEndpoint,
          ipId: peerIpId,
          presharedKey: peerPresharedKey,
        }),
      ),
    onSuccess: async () => {
      setError(null)
      setPeerServerId('')
      setPeerPublicKey('')
      setPeerTunnelAddress('')
      setPeerListenPort('')
      setPeerEndpoint('')
      setPeerIpId(null)
      setPeerPresharedKey('')
      await invalidateVpn()
    },
    onError: (err) => onMutationError(err, 'Failed to add peer'),
  })

  const updateTunnelMutation = useMutation({
    mutationFn: ({
      peerId,
      tunnelAddress,
    }: {
      peerId: string
      tunnelAddress: string
    }) =>
      updatePeer(vpnId, peerId, {
        tunnelAddress: tunnelAddress.length > 0 ? tunnelAddress : null,
      }),
    onSuccess: async () => {
      setError(null)
      await invalidateVpn()
    },
    onError: (err) => onMutationError(err, 'Failed to update peer'),
  })

  const deletePeerMutation = useMutation({
    mutationFn: (peerId: string) => deletePeer(vpnId, peerId),
    onSuccess: async () => {
      setError(null)
      await invalidateVpn()
    },
    onError: (err) => onMutationError(err, 'Failed to remove peer'),
  })

  const applyMutation = useMutation({
    mutationFn: () => applyVpn(vpnId),
    onSuccess: (data) => {
      setError(null)
      setApplyResults({
        interfaceName: data.interfaceName,
        results: data.results,
      })
    },
    onError: (err) => onMutationError(err, 'Failed to apply WireGuard'),
  })

  const vpn = vpnQuery.data?.vpn
  const peers = peersQuery.data?.peers ?? []
  const servers = serversQuery.data?.servers ?? []
  const vpnNetworks = networksQuery.data?.networks ?? []
  const publicIps = publicIpsQuery.data?.ips ?? []

  const serverById = useMemo(() => {
    const map = new Map<string, OrgServerRecord>()
    for (const server of servers) {
      map.set(server.id, server)
    }
    return map
  }, [servers])

  const ipById = useMemo(() => {
    const map = new Map<string, IpRecord>()
    for (const ip of publicIps) {
      map.set(ip.id, ip)
    }
    return map
  }, [publicIps])

  const peerServerIds = useMemo(
    () => new Set(peers.map((peer) => peer.serverId)),
    [peers],
  )

  const availableServers = servers
    .filter((server) => !peerServerIds.has(server.id))
    .sort((a, b) => serverTitle(a).localeCompare(serverTitle(b)))

  const selectedNetworkId =
    linkNetworkId === undefined ? (vpn?.networkId ?? null) : linkNetworkId

  const gate = vpnDetailGate({
    vpnId,
    vpn,
    loading: vpnQuery.isLoading || peersQuery.isLoading,
    loadError: vpnQuery.error,
    isError: vpnQuery.isError,
  })
  if (gate || !vpn) return gate

  return (
    <View style={styles.root}>
      <Text style={orgPanelStyles.pageTitle}>{vpnTitle(vpn)}</Text>
      <Text style={orgPanelStyles.pageCopy}>
        Peer servers form the WireGuard mesh. Apply pushes config to each peer
        daemon — tunnel addresses are required on every peer.
      </Text>

      {error ? <Text style={orgPanelStyles.error}>{error}</Text> : null}

      <VpnNetworkPanel
        vpnNetworks={vpnNetworks}
        selectedNetworkId={selectedNetworkId}
        canManage={canManage}
        dirty={linkNetworkId !== undefined}
        pending={linkNetworkMutation.isPending}
        onSelect={setLinkNetworkId}
        onSave={() => linkNetworkMutation.mutate(selectedNetworkId)}
      />

      <PeersPanel
        peers={peers}
        serverById={serverById}
        ipById={ipById}
        canManage={canManage}
        deletingPeerId={
          deletePeerMutation.isPending
            ? deletePeerMutation.variables
            : undefined
        }
        onDelete={(peerId) => deletePeerMutation.mutate(peerId)}
        onSaveTunnel={(peerId, tunnelAddress) =>
          updateTunnelMutation.mutate({ peerId, tunnelAddress })
        }
      />

      {canManage ? (
        <AddPeerPanel
          availableServers={availableServers}
          publicIps={publicIps}
          peerServerId={peerServerId}
          peerPublicKey={peerPublicKey}
          peerTunnelAddress={peerTunnelAddress}
          peerListenPort={peerListenPort}
          peerEndpoint={peerEndpoint}
          peerIpId={peerIpId}
          peerPresharedKey={peerPresharedKey}
          pending={createPeerMutation.isPending}
          onServerId={setPeerServerId}
          onPublicKey={setPeerPublicKey}
          onTunnelAddress={setPeerTunnelAddress}
          onListenPort={setPeerListenPort}
          onEndpoint={setPeerEndpoint}
          onIpId={setPeerIpId}
          onPresharedKey={setPeerPresharedKey}
          onSubmit={() => createPeerMutation.mutate()}
        />
      ) : null}

      {canManage ? (
        <ApplyWireguardPanel
          peerCount={peers.length}
          pending={applyMutation.isPending}
          applyResults={applyResults}
          serverById={serverById}
          onApply={() => applyMutation.mutate()}
        />
      ) : null}
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
  peerEdit: {
    marginTop: spacing.xs,
    gap: spacing.xs,
  },
  actionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
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
  mono: {
    fontFamily: 'monospace',
    fontSize: 12,
  },
  buttonDisabled: {
    opacity: 0.55,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginBottom: spacing.sm,
    marginTop: spacing.xs,
  },
  chip: {
    borderWidth: 1,
    borderColor: colors.borderArea,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    minHeight: 44,
    justifyContent: 'center',
    backgroundColor: colors.bgInset,
  },
  chipActive: {
    borderColor: colors.accent,
    backgroundColor: colors.bgSecondary,
  },
  chipText: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
  chipTextActive: {
    color: colors.accent,
  },
  applyResults: {
    marginTop: spacing.sm,
    gap: spacing.xs,
  },
})
