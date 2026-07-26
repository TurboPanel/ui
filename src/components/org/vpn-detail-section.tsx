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
  GATEWAY_DATACENTER_CIDR_REQUIRED_ERROR,
  GATEWAY_DATACENTER_REQUIRED_ERROR,
  PEER_TUNNEL_IP_CONFLICT_ERROR,
  VPN_ADDRESS_CONFLICT_ERROR,
  VPN_ADDRESS_POOL_EXHAUSTED_ERROR,
  VPN_CIDR_EXCLUDES_ADDRESSES_ERROR,
  VPN_CIDR_IN_USE_ERROR,
  applyVpn,
  createIp,
  createPeer,
  deleteIp,
  deletePeer,
  fetchIps,
  fetchOrgServers,
  fetchPeers,
  fetchVpn,
  isForbiddenError,
  updatePeer,
  updateVpn,
  type IpRecord,
  type OrgServerRecord,
  type PeerRecord,
  type PeerRole,
  type VpnApplyPeerResult,
  type VpnRecord,
} from '@/lib/instance-api'
import { useCan, useForbiddenRecovery } from '@/lib/query-client'
import { colors, spacing } from '@/lib/theme'
import {
  overlayAddressForPeer,
  resolvePrimaryGatewayByDatacenter,
} from '@/lib/vpn-mesh'

/** WireGuard Curve25519 public keys are 32 bytes → 44-char base64 with `=`. */
const WIREGUARD_PUBLIC_KEY_RE = /^[A-Za-z0-9+/]{43}=$/

type CreatePeerBody = {
  serverId: string
  publicKey: string
  role?: PeerRole
  tunnelAddress?: string
  listenPort?: number
  endpoint?: string
  endpointIpId?: string
  presharedKey?: string
}

function errorMessage(err: unknown, fallback: string): string {
  if (typeof err === 'string' && err.length > 0) return err
  return err instanceof Error ? err.message : fallback
}

/** Override createIp succeeded but peer attach + deleteIp cleanup both failed. */
class OverrideAddressCleanupError extends Error {
  readonly cleanupFailed = true as const

  constructor(originalMessage: string, options?: ErrorOptions) {
    super(
      `${originalMessage} The reserved overlay IP could not be released.`,
      options,
    )
    this.name = 'OverrideAddressCleanupError'
  }
}

function friendlyApiError(err: unknown, fallback: string): string {
  if (err instanceof OverrideAddressCleanupError) {
    return err.message
  }
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
  if (raw.includes(VPN_ADDRESS_POOL_EXHAUSTED_ERROR)) {
    return 'This mesh CIDR is full — widen it or remove a peer.'
  }
  if (raw.includes(VPN_ADDRESS_CONFLICT_ERROR)) {
    return 'That overlay address conflicts with another address on this mesh.'
  }
  if (raw.includes(PEER_TUNNEL_IP_CONFLICT_ERROR)) {
    return 'That tunnel IP is already assigned to another peer.'
  }
  if (raw.includes(GATEWAY_DATACENTER_REQUIRED_ERROR)) {
    return "Assign this gateway's server to a datacenter first."
  }
  if (raw.includes(GATEWAY_DATACENTER_CIDR_REQUIRED_ERROR)) {
    return 'Add a datacenter network CIDR before applying — the gateway has no site route to advertise.'
  }
  if (raw.includes(VPN_CIDR_IN_USE_ERROR)) {
    return 'That CIDR is already used by another VPN.'
  }
  if (raw.includes(VPN_CIDR_EXCLUDES_ADDRESSES_ERROR)) {
    return 'That CIDR would exclude an existing peer tunnel address — widen the prefix or reassign tunnels first.'
  }
  if (raw.includes('ip_address_in_use')) {
    return 'That IP address is already in use.'
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
  role: PeerRole
  tunnelAddress: string
  listenPort: string
  endpoint: string
  endpointIpId: string | null
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
    role: input.role,
    ...(input.tunnelAddress.trim()
      ? { tunnelAddress: input.tunnelAddress.trim() }
      : {}),
    ...(listenPort !== undefined ? { listenPort } : {}),
    ...(input.endpoint.trim() ? { endpoint: input.endpoint.trim() } : {}),
    ...(input.endpointIpId ? { endpointIpId: input.endpointIpId } : {}),
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

function RoleChip({ role }: Readonly<{ role: PeerRole }>) {
  return (
    <View style={orgPanelStyles.segmentGroup}>
      <View
        style={[
          orgPanelStyles.segmentChip,
          role === 'gateway' && orgPanelStyles.segmentChipActive,
        ]}
      >
        <Text
          style={[
            orgPanelStyles.segmentChipText,
            role === 'gateway' && orgPanelStyles.segmentChipTextActive,
          ]}
        >
          Gateway
        </Text>
      </View>
      <View
        style={[
          orgPanelStyles.segmentChip,
          role === 'member' && orgPanelStyles.segmentChipActive,
        ]}
      >
        <Text
          style={[
            orgPanelStyles.segmentChipText,
            role === 'member' && orgPanelStyles.segmentChipTextActive,
          ]}
        >
          Member
        </Text>
      </View>
    </View>
  )
}

function PeerCard({
  peer,
  serverLabel,
  siteLabel,
  overlayAddress,
  endpointIpLabel,
  isPrimary,
  canManage,
  deleting,
  overridePending,
  overrideError,
  onDelete,
  onOverrideAddress,
}: Readonly<{
  peer: PeerRecord
  serverLabel: string
  siteLabel: string | null
  overlayAddress: string | null
  endpointIpLabel: string | null
  isPrimary: boolean
  canManage: boolean
  deleting: boolean
  overridePending: boolean
  overrideError: string | null
  onDelete: () => void
  onOverrideAddress: (address: string) => void
}>) {
  const [overrideDraft, setOverrideDraft] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)

  return (
    <View style={orgPanelStyles.detailCard}>
      <View style={styles.peerHeader}>
        <Text style={orgPanelStyles.detailTitle}>{serverLabel}</Text>
        {isPrimary ? (
          <View style={styles.primaryBadge}>
            <Text style={styles.primaryBadgeText}>Primary</Text>
          </View>
        ) : null}
      </View>

      <Text style={styles.fieldLabel}>Role</Text>
      <RoleChip role={peer.role} />

      <Text style={orgPanelStyles.detailLine}>
        <Text style={orgPanelStyles.detailLabel}>Public key: </Text>
        <Text style={styles.mono} selectable>
          {truncateKey(peer.publicKey)}
        </Text>
      </Text>
      <Text style={orgPanelStyles.detailLine}>
        <Text style={orgPanelStyles.detailLabel}>Overlay: </Text>
        {overlayAddress ?? '—'}
      </Text>
      <Text style={orgPanelStyles.detailLine}>
        <Text style={orgPanelStyles.detailLabel}>Site: </Text>
        {siteLabel ?? '—'}
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
        <Text style={orgPanelStyles.detailLabel}>Endpoint IP: </Text>
        {endpointIpLabel ?? '—'}
      </Text>

      {canManage ? (
        <View style={styles.peerEdit}>
          <Text style={styles.fieldLabel}>Override address</Text>
          <Text style={orgPanelStyles.muted}>
            Overlay address is auto-assigned from the mesh CIDR. Enter an
            address to pin a dedicated overlay IP for this peer.
          </Text>
          <TextInput
            value={overrideDraft}
            onChangeText={setOverrideDraft}
            placeholder="e.g. 10.10.0.2"
            placeholderTextColor={colors.textDim}
            style={styles.input}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {overrideError ? (
            <Text style={orgPanelStyles.error}>{overrideError}</Text>
          ) : null}
          <View style={styles.actionsRow}>
            <Pressable
              style={[
                orgPanelStyles.toolbarBtnSecondary,
                (overridePending || overrideDraft.trim().length === 0) &&
                  styles.buttonDisabled,
                webPointer,
              ]}
              disabled={overridePending || overrideDraft.trim().length === 0}
              onPress={() => onOverrideAddress(overrideDraft.trim())}
            >
              <Text style={orgPanelStyles.toolbarBtnTextSecondary}>
                {overridePending ? 'Saving…' : 'Save override'}
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
    return `failed — ${friendlyApiError(result.error, result.error)}`
  }
  return 'failed'
}

function ApplyResults({
  interfaceName,
  results,
  error,
  serverLabel,
}: Readonly<{
  interfaceName: string | null
  results: VpnApplyPeerResult[]
  error: string | null
  serverLabel: (serverId: string) => string
}>) {
  return (
    <View style={styles.applyResults}>
      {error ? (
        <View style={orgPanelStyles.calloutWarning}>
          <Text style={orgPanelStyles.calloutWarningText}>{error}</Text>
        </View>
      ) : null}
      {interfaceName ? (
        <Text style={orgPanelStyles.detailLine}>
          <Text style={orgPanelStyles.detailLabel}>Interface: </Text>
          {interfaceName}
        </Text>
      ) : null}
      {results.map((result) => (
        <Text key={result.peerId} style={orgPanelStyles.detailLine}>
          {serverLabel(result.serverId)}: {formatApplyPeerStatus(result)}
        </Text>
      ))}
    </View>
  )
}

function MeshPanel({
  cidr,
  canManage,
  dirty,
  pending,
  onChange,
  onSave,
}: Readonly<{
  cidr: string
  canManage: boolean
  dirty: boolean
  pending: boolean
  onChange: (cidr: string) => void
  onSave: () => void
}>) {
  return (
    <SectionPanel title="Mesh" hint="Shared overlay CIDR">
      <Text style={orgPanelStyles.muted}>
        Every peer's WireGuard interface takes an address from this prefix.
        Widening adds capacity; shrinking is rejected when any peer tunnel
        address would fall outside the new prefix.
      </Text>
      {canManage ? (
        <>
          <Text style={styles.fieldLabel}>CIDR</Text>
          <TextInput
            value={cidr}
            onChangeText={onChange}
            placeholder="e.g. 10.10.0.0/24"
            placeholderTextColor={colors.textDim}
            style={[styles.input, styles.mono]}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Pressable
            style={[
              orgPanelStyles.toolbarBtnSecondary,
              (!dirty || pending || cidr.trim().length === 0) &&
                styles.buttonDisabled,
              webPointer,
            ]}
            disabled={!dirty || pending || cidr.trim().length === 0}
            onPress={onSave}
          >
            <Text style={orgPanelStyles.toolbarBtnTextSecondary}>
              {pending ? 'Saving…' : 'Save CIDR'}
            </Text>
          </Pressable>
        </>
      ) : (
        <Text style={[orgPanelStyles.detailLine, styles.mono]} selectable>
          {cidr}
        </Text>
      )}
    </SectionPanel>
  )
}

function PeersPanel({
  peers,
  serverById,
  overlayIpById,
  publicIpById,
  primaryPeerIds,
  canManage,
  deletingPeerId,
  overridePeerId,
  overridePending,
  overrideError,
  onDelete,
  onOverrideAddress,
}: Readonly<{
  peers: PeerRecord[]
  serverById: Map<string, OrgServerRecord>
  overlayIpById: Map<string, IpRecord>
  publicIpById: Map<string, IpRecord>
  primaryPeerIds: Set<string>
  canManage: boolean
  deletingPeerId: string | undefined
  overridePeerId: string | undefined
  overridePending: boolean
  overrideError: string | null
  onDelete: (peerId: string) => void
  onOverrideAddress: (peerId: string, address: string) => void
}>) {
  return (
    <SectionPanel title="Peers" hint={`${peers.length} peer(s)`}>
      {peers.length === 0 ? (
        <View style={orgPanelStyles.statePanel}>
          <Text style={orgPanelStyles.statePanelTitle}>No peers yet</Text>
          <Text style={orgPanelStyles.muted}>
            Add at least two servers (one per site) to mesh datacenters.
          </Text>
        </View>
      ) : (
        <View style={styles.list}>
          {peers.map((peer) => {
            const server = serverById.get(peer.serverId)
            const endpointIp = peer.endpointIpId
              ? publicIpById.get(peer.endpointIpId)
              : undefined
            return (
              <PeerCard
                key={`${peer.id}-${peer.tunnelIpId ?? ''}`}
                peer={peer}
                serverLabel={server ? serverTitle(server) : peer.serverId}
                siteLabel={server?.datacenterDisplayName ?? null}
                overlayAddress={overlayAddressForPeer(peer, overlayIpById)}
                endpointIpLabel={endpointIp?.address ?? null}
                isPrimary={primaryPeerIds.has(peer.id)}
                canManage={canManage}
                deleting={deletingPeerId === peer.id}
                overridePending={overridePending && overridePeerId === peer.id}
                overrideError={
                  overridePeerId === peer.id ? overrideError : null
                }
                onDelete={() => onDelete(peer.id)}
                onOverrideAddress={(address) =>
                  onOverrideAddress(peer.id, address)
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
  peerRole,
  peerPublicKey,
  peerTunnelAddress,
  peerListenPort,
  peerEndpoint,
  peerEndpointIpId,
  peerPresharedKey,
  pending,
  onServerId,
  onRole,
  onPublicKey,
  onTunnelAddress,
  onListenPort,
  onEndpoint,
  onEndpointIpId,
  onPresharedKey,
  onSubmit,
}: Readonly<{
  availableServers: OrgServerRecord[]
  publicIps: IpRecord[]
  peerServerId: string
  peerRole: PeerRole
  peerPublicKey: string
  peerTunnelAddress: string
  peerListenPort: string
  peerEndpoint: string
  peerEndpointIpId: string | null
  peerPresharedKey: string
  pending: boolean
  onServerId: (id: string) => void
  onRole: (role: PeerRole) => void
  onPublicKey: (value: string) => void
  onTunnelAddress: (value: string) => void
  onListenPort: (value: string) => void
  onEndpoint: (value: string) => void
  onEndpointIpId: (id: string | null) => void
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

      <Text style={styles.fieldLabel}>Role</Text>
      <View style={orgPanelStyles.segmentGroup}>
        <Pressable
          style={[
            orgPanelStyles.segmentChip,
            peerRole === 'gateway' && orgPanelStyles.segmentChipActive,
            webPointer,
          ]}
          onPress={() => onRole('gateway')}
        >
          <Text
            style={[
              orgPanelStyles.segmentChipText,
              peerRole === 'gateway' && orgPanelStyles.segmentChipTextActive,
            ]}
          >
            Gateway
          </Text>
        </Pressable>
        <Pressable
          style={[
            orgPanelStyles.segmentChip,
            peerRole === 'member' && orgPanelStyles.segmentChipActive,
            webPointer,
          ]}
          onPress={() => onRole('member')}
        >
          <Text
            style={[
              orgPanelStyles.segmentChipText,
              peerRole === 'member' && orgPanelStyles.segmentChipTextActive,
            ]}
          >
            Member
          </Text>
        </Pressable>
      </View>

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

      <Text style={styles.fieldLabel}>Tunnel address (optional)</Text>
      <Text style={orgPanelStyles.muted}>
        Leave blank to auto-assign from the mesh CIDR.
      </Text>
      <TextInput
        value={peerTunnelAddress}
        onChangeText={onTunnelAddress}
        placeholder="Auto-assign from mesh CIDR"
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
        placeholder="host:port — or derive from endpoint IP + port"
        placeholderTextColor={colors.textDim}
        style={styles.input}
        autoCapitalize="none"
        autoCorrect={false}
      />

      <Text style={styles.fieldLabel}>Endpoint IP (optional)</Text>
      <View style={styles.chipRow}>
        <PickerChip
          label="None"
          active={peerEndpointIpId === null}
          onPress={() => onEndpointIpId(null)}
        />
        {publicIps.map((ip) => (
          <PickerChip
            key={ip.id}
            label={ip.displayName?.trim() || ip.address}
            active={peerEndpointIpId === ip.id}
            onPress={() => onEndpointIpId(ip.id)}
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
  applyError,
  serverById,
  onApply,
}: Readonly<{
  peerCount: number
  pending: boolean
  applyResults: {
    interfaceName: string
    results: VpnApplyPeerResult[]
  } | null
  applyError: string | null
  serverById: Map<string, OrgServerRecord>
  onApply: () => void
}>) {
  const showResults = applyResults !== null || applyError !== null
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
      {showResults ? (
        <ApplyResults
          interfaceName={applyResults?.interfaceName ?? null}
          results={applyResults?.results ?? []}
          error={applyError}
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
  const [cidrDraft, setCidrDraft] = useState<string | undefined>(undefined)
  const [overrideError, setOverrideError] = useState<string | null>(null)
  const [overridePeerId, setOverridePeerId] = useState<string | undefined>(
    undefined,
  )

  const [peerServerId, setPeerServerId] = useState('')
  const [peerRole, setPeerRole] = useState<PeerRole>('member')
  const [peerPublicKey, setPeerPublicKey] = useState('')
  const [peerTunnelAddress, setPeerTunnelAddress] = useState('')
  const [peerListenPort, setPeerListenPort] = useState('')
  const [peerEndpoint, setPeerEndpoint] = useState('')
  const [peerEndpointIpId, setPeerEndpointIpId] = useState<string | null>(null)
  const [peerPresharedKey, setPeerPresharedKey] = useState('')

  const [applyResults, setApplyResults] = useState<{
    interfaceName: string
    results: VpnApplyPeerResult[]
  } | null>(null)
  const [applyError, setApplyError] = useState<string | null>(null)

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
  const overlayIpsQuery = useQuery({
    queryKey: ['org', orgId, 'ips', 'vpn', vpnId],
    queryFn: () => fetchIps({ vpnId }),
    enabled: vpnId.length > 0,
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
      queryClient.invalidateQueries({
        queryKey: ['org', orgId, 'ips', 'vpn', vpnId],
      }),
    ])
  }

  const onMutationError = async (err: unknown, fallback: string) => {
    if (isForbiddenError(err)) {
      await handleUnauthorized()
      return
    }
    setError(friendlyApiError(err, fallback))
  }

  const saveCidrMutation = useMutation({
    mutationFn: (nextCidr: string) => updateVpn(vpnId, { cidr: nextCidr }),
    onSuccess: async () => {
      setError(null)
      setCidrDraft(undefined)
      await invalidateVpn()
    },
    onError: (err) => onMutationError(err, 'Failed to update mesh CIDR'),
  })

  const createPeerMutation = useMutation({
    mutationFn: () =>
      createPeer(
        vpnId,
        buildCreatePeerBody({
          serverId: peerServerId,
          publicKey: peerPublicKey,
          role: peerRole,
          tunnelAddress: peerTunnelAddress,
          listenPort: peerListenPort,
          endpoint: peerEndpoint,
          endpointIpId: peerEndpointIpId,
          presharedKey: peerPresharedKey,
        }),
      ),
    onSuccess: async () => {
      setError(null)
      setPeerServerId('')
      setPeerRole('member')
      setPeerPublicKey('')
      setPeerTunnelAddress('')
      setPeerListenPort('')
      setPeerEndpoint('')
      setPeerEndpointIpId(null)
      setPeerPresharedKey('')
      await invalidateVpn()
    },
    onError: (err) => onMutationError(err, 'Failed to add peer'),
  })

  const overrideAddressMutation = useMutation({
    mutationFn: async ({
      peerId,
      address,
      serverId,
    }: {
      peerId: string
      address: string
      serverId: string
    }) => {
      const created = await createIp({
        address,
        scope: 'vpn',
        vpnId,
        allocation: 'dedicated',
        serverId,
      })
      try {
        await updatePeer(vpnId, peerId, { tunnelIpId: created.id })
      } catch (updateErr) {
        let released = true
        try {
          await deleteIp(created.id)
        } catch {
          released = false
        }
        if (!released) {
          throw new OverrideAddressCleanupError(
            friendlyApiError(updateErr, 'Failed to override overlay address'),
            { cause: updateErr },
          )
        }
        throw updateErr
      }
    },
    onMutate: ({ peerId }) => {
      setOverridePeerId(peerId)
      setOverrideError(null)
    },
    onSuccess: async () => {
      setError(null)
      setOverrideError(null)
      setOverridePeerId(undefined)
      await invalidateVpn()
    },
    onError: async (err) => {
      if (isForbiddenError(err)) {
        await handleUnauthorized()
        return
      }
      const message = friendlyApiError(err, 'Failed to override overlay address')
      setOverrideError(message)
      setError(message)
      if (err instanceof OverrideAddressCleanupError) {
        await invalidateVpn()
      }
    },
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
      setApplyError(null)
      setApplyResults({
        interfaceName: data.interfaceName,
        results: data.results,
      })
    },
    onError: async (err) => {
      if (isForbiddenError(err)) {
        await handleUnauthorized()
        return
      }
      const message = friendlyApiError(err, 'Failed to apply WireGuard')
      setApplyError(message)
      setError(message)
    },
  })

  const vpn = vpnQuery.data?.vpn
  const peers = peersQuery.data?.peers ?? []
  const servers = serversQuery.data?.servers ?? []
  const overlayIps = overlayIpsQuery.data?.ips ?? []
  const publicIps = publicIpsQuery.data?.ips ?? []

  const serverById = useMemo(() => {
    const map = new Map<string, OrgServerRecord>()
    for (const server of servers) {
      map.set(server.id, server)
    }
    return map
  }, [servers])

  const overlayIpById = useMemo(() => {
    const map = new Map<string, IpRecord>()
    for (const ip of overlayIps) {
      map.set(ip.id, ip)
    }
    return map
  }, [overlayIps])

  const publicIpById = useMemo(() => {
    const map = new Map<string, IpRecord>()
    for (const ip of publicIps) {
      map.set(ip.id, ip)
    }
    return map
  }, [publicIps])

  const primaryByDatacenter = useMemo(
    () => resolvePrimaryGatewayByDatacenter(peers, serverById),
    [peers, serverById],
  )

  const primaryPeerIds = useMemo(
    () => new Set(primaryByDatacenter.values()),
    [primaryByDatacenter],
  )

  const peerServerIds = useMemo(
    () => new Set(peers.map((peer) => peer.serverId)),
    [peers],
  )

  const availableServers = servers
    .filter((server) => !peerServerIds.has(server.id))
    .sort((a, b) => serverTitle(a).localeCompare(serverTitle(b)))

  const meshCidr = cidrDraft ?? vpn?.cidr ?? ''

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
        daemon — overlay addresses are assigned from the mesh CIDR.
      </Text>

      {error ? <Text style={orgPanelStyles.error}>{error}</Text> : null}

      <MeshPanel
        cidr={meshCidr}
        canManage={canManage}
        dirty={cidrDraft !== undefined && cidrDraft.trim() !== vpn.cidr}
        pending={saveCidrMutation.isPending}
        onChange={setCidrDraft}
        onSave={() => saveCidrMutation.mutate(meshCidr.trim())}
      />

      <PeersPanel
        peers={peers}
        serverById={serverById}
        overlayIpById={overlayIpById}
        publicIpById={publicIpById}
        primaryPeerIds={primaryPeerIds}
        canManage={canManage}
        deletingPeerId={
          deletePeerMutation.isPending
            ? deletePeerMutation.variables
            : undefined
        }
        overridePeerId={overridePeerId}
        overridePending={overrideAddressMutation.isPending}
        overrideError={overrideError}
        onDelete={(peerId) => deletePeerMutation.mutate(peerId)}
        onOverrideAddress={(peerId, address) => {
          const peer = peers.find((row) => row.id === peerId)
          if (!peer) return
          overrideAddressMutation.mutate({
            peerId,
            address,
            serverId: peer.serverId,
          })
        }}
      />

      {canManage ? (
        <AddPeerPanel
          availableServers={availableServers}
          publicIps={publicIps}
          peerServerId={peerServerId}
          peerRole={peerRole}
          peerPublicKey={peerPublicKey}
          peerTunnelAddress={peerTunnelAddress}
          peerListenPort={peerListenPort}
          peerEndpoint={peerEndpoint}
          peerEndpointIpId={peerEndpointIpId}
          peerPresharedKey={peerPresharedKey}
          pending={createPeerMutation.isPending}
          onServerId={setPeerServerId}
          onRole={setPeerRole}
          onPublicKey={setPeerPublicKey}
          onTunnelAddress={setPeerTunnelAddress}
          onListenPort={setPeerListenPort}
          onEndpoint={setPeerEndpoint}
          onEndpointIpId={setPeerEndpointIpId}
          onPresharedKey={setPeerPresharedKey}
          onSubmit={() => createPeerMutation.mutate()}
        />
      ) : null}

      {canManage ? (
        <ApplyWireguardPanel
          peerCount={peers.length}
          pending={applyMutation.isPending}
          applyResults={applyResults}
          applyError={applyError}
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
  peerHeader: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.sm,
  },
  primaryBadge: {
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.accent,
    backgroundColor: colors.bgActive,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  primaryBadgeText: {
    color: colors.accent,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
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
