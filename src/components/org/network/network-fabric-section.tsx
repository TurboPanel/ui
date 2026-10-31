import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { panelStyles } from '@/components/ui/panel-styles'
import {
  Button,
  EmptyState,
  FormField,
  LoadingState,
  SectionPanel,
  SegmentedControl,
  SettingRow,
  TextField,
  Toggle,
} from '@/components/ui'
import {
  GATEWAY_DATACENTER_CIDR_REQUIRED_ERROR,
  GATEWAY_DATACENTER_REQUIRED_ERROR,
  PREFERRED_GATEWAY_INVALID_ERROR,
  fetchOrgHostDefaults,
  type CommandStatus,
  type FabricRelaySegment,
  type OrgFabricPairRecord,
  type OrgFabricServerRecord,
  type OrgServerRecord,
  type RelayRecord,
  type RelayRole,
} from '@/lib/instance-api'
import {
  buildFabricPairRows,
  buildFabricPathMatrix,
  fabricHandshakeReading,
  fabricPathIsDegraded,
  fabricPathKindLabel,
  formatResolvedAdvertisedCidrs,
  relayRoleLabel,
  type FabricPairRow,
  type FabricPathMatrixRow,
} from '@/lib/fabric-mesh'
import {
  FABRIC_ROLE_HELP,
  fabricReconcileLines,
  type FabricServerOutcome,
  fabricState,
  fabricStateLabel,
  type FabricState,
} from '@/lib/fabric-servers'
import { formatRelativeLocalDateTime } from '@/lib/format-datetime'
import { FabricPairPathList } from '@/components/org/network/fabric-pair-paths'
import { FabricLifecycleControls } from '@/components/org/network/fabric-lifecycle-controls'
import { FabricServerControls } from '@/components/org/network/fabric-server-controls'
import {
  isOrgFabricUnavailable,
  useApplyOrgFabric,
  useOrgFabric,
  usePatchOrgFabricRelay,
  useSaveOrgFabric,
} from '@/lib/queries/fabric'
import {
  hasPendingTrackedCommands,
  isTerminalCommandStatus,
  mergeTrackedCommandEntries,
  useCommandsBatch,
  type TrackedCommandEntry,
} from '@/lib/queries/commands'
import { useOrgServers } from '@/lib/queries/servers'
import { orEmptyArray } from '@/lib/or-empty-array'
import { TURBOFABRIC_PRODUCT_NAME } from '@/lib/platform-copy'
import { useCanState, queryKeys } from '@/lib/query-client'
import { colors, spacing, webPointer } from '@/lib/theme'
import { userErrorMessage } from '@/lib/user-error'

function fabricStatusLabel(state: FabricState, status?: string): string {
  if (state !== 'on') return fabricStateLabel(state)
  const trimmed = status?.trim()
  if (trimmed) return trimmed
  return fabricStateLabel(state)
}

function fabricLoadError(isError: boolean, unavailable: boolean, error: unknown): string | null {
  if (!isError || unavailable) return null
  if (error instanceof Error) return userErrorMessage(error, '')
  return `Failed to load ${TURBOFABRIC_PRODUCT_NAME}`
}

function fabricMutationError(err: unknown): string {
  if (!(err instanceof Error)) {
    return `Failed to update ${TURBOFABRIC_PRODUCT_NAME}`
  }
  const raw = err.message
  if (raw.includes(GATEWAY_DATACENTER_REQUIRED_ERROR)) {
    return 'Assign this server to a datacenter before promoting it to gateway.'
  }
  if (raw.includes(GATEWAY_DATACENTER_CIDR_REQUIRED_ERROR)) {
    return 'This datacenter has no private CIDR. Recreate it from a server IP before promoting a gateway.'
  }
  if (raw.includes(PREFERRED_GATEWAY_INVALID_ERROR)) {
    return 'Preferred gateways must be gateway-role relays in this mesh.'
  }
  return userErrorMessage(err, raw)
}

function serverTitle(server: OrgServerRecord): string {
  return server.name?.trim() || server.hostname?.trim() || server.id
}

function parseCidrList(raw: string): string[] {
  return raw
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
}

/**
 * The short line under a server after Apply. A failed apply says so only when
 * no error text explains it; otherwise the error line below does.
 */
function relayApplyHint(
  applyPending: boolean,
  applyStatus: CommandStatus | null,
  hasErrorText: boolean
): string | null {
  if (applyPending) return 'Applying…'
  if (!applyStatus || !isTerminalCommandStatus(applyStatus)) return null
  if (applyStatus === 'succeeded') return 'Applied'
  return hasErrorText ? null : 'Apply failed. The server did not say why.'
}

function failedApplyByServer(
  results: readonly { serverId: string; status: string; error?: string }[]
): Record<string, string> {
  const failed: Record<string, string> = {}
  for (const row of results) {
    if (row.status === 'failed' && row.error) {
      failed[row.serverId] = row.error
    }
  }
  return failed
}

function parseKeepaliveDraft(
  raw: string
): { ok: true; value: number | null } | { ok: false; message: string } {
  const trimmed = raw.trim()
  if (trimmed.length === 0) return { ok: true, value: null }
  const parsed = Number(trimmed)
  if (!Number.isInteger(parsed) || parsed < 1) {
    return {
      ok: false,
      message: 'Keepalive must be a positive integer, or empty for default.',
    }
  }
  return { ok: true, value: parsed }
}

function queuedApplyEntries(
  results: readonly { serverId: string; commandId?: string }[]
): TrackedCommandEntry[] {
  const entries: TrackedCommandEntry[] = []
  for (const row of results) {
    if (!row.commandId) continue
    entries.push({ serverId: row.serverId, commandId: row.commandId })
  }
  return entries
}

function isAutoEndpointUnresolved(relay: RelayRecord): boolean {
  return relay.endpointAddress == null && relay.resolvedEndpoint == null
}

function formatRelaySegment(segment: FabricRelaySegment): string {
  // Compose-bridge subnets (table `subnet`); the relay API field is still `segments[]`.
  const parts = [segment.name, segment.subnet]
  if (segment.gateway) parts.push(`gw ${segment.gateway}`)
  if (segment.mtu != null) parts.push(`mtu ${String(segment.mtu)}`)
  return parts.join(' · ')
}

const NAT_CLIENT_ENDPOINT_TEXT =
  'This server has no public address, so it connects out to a server that has one. That is normal for a server behind NAT.'

const NO_PUBLIC_SERVER_TEXT =
  'No server in this organization has a public address, so this server has nothing to connect out to. Give one server a public address or an endpoint override.'

function RelayResolvedEndpoint({
  relay,
  publicPeerExists,
}: Readonly<{ relay: RelayRecord; publicPeerExists: boolean }>) {
  if (isAutoEndpointUnresolved(relay)) {
    if (publicPeerExists) {
      return <Text style={panelStyles.muted}>{NAT_CLIENT_ENDPOINT_TEXT}</Text>
    }
    return (
      <View style={panelStyles.calloutWarning}>
        <Text style={panelStyles.calloutWarningText}>{NO_PUBLIC_SERVER_TEXT}</Text>
      </View>
    )
  }
  if (!relay.resolvedEndpoint) {
    return <Text style={panelStyles.muted}>Resolved endpoint: unavailable</Text>
  }
  return (
    <Text style={panelStyles.detailLine}>
      <Text style={panelStyles.detailLabel}>Resolved endpoint: </Text>
      <Text style={styles.mono} selectable>
        {relay.resolvedEndpoint}
      </Text>
    </Text>
  )
}

const ENDPOINT_OVERRIDE_HINT = 'An IP address only, without a port.'

function RelaySegments({ segments }: Readonly<{ segments: readonly FabricRelaySegment[] }>) {
  return (
    <>
      <Text style={styles.fieldLabel}>Segments</Text>
      {segments.length === 0 ? (
        <Text style={panelStyles.muted}>None on this host</Text>
      ) : (
        segments.map((segment) => (
          <Text key={`${segment.name}:${segment.subnet}`} style={panelStyles.detailLine}>
            <Text style={styles.mono} selectable>
              {formatRelaySegment(segment)}
            </Text>
          </Text>
        ))
      )}
    </>
  )
}

function FabricStatusBlock({
  state,
  cidr,
  status,
}: Readonly<{ state: FabricState; cidr?: string; status?: string }>) {
  return (
    <View style={styles.statusBlock}>
      <Text style={panelStyles.detailLine}>
        <Text style={panelStyles.detailLabel}>Status: </Text>
        {fabricStatusLabel(state, status)}
      </Text>
      {state !== 'off' && cidr ? (
        <Text style={panelStyles.detailLine}>
          <Text style={panelStyles.detailLabel}>CIDR: </Text>
          <Text style={styles.mono}>{cidr}</Text>
        </Text>
      ) : null}
    </View>
  )
}

function FabricUnavailableNotice() {
  return (
    <Text style={panelStyles.muted}>
      {TURBOFABRIC_PRODUCT_NAME} is not available on this control plane yet.
    </Text>
  )
}

function FabricManageHint() {
  return (
    <Text style={panelStyles.muted}>
      Organization manage permission is required to enable {TURBOFABRIC_PRODUCT_NAME}.
    </Text>
  )
}

function FabricAllowRelayToggle({
  enabled,
  disabled,
  pending,
  onToggle,
}: Readonly<{
  enabled: boolean
  disabled: boolean
  pending: boolean
  onToggle: () => void
}>) {
  return (
    <View style={styles.toggleBlock}>
      <SettingRow label="Allow relay path">
        <Toggle
          value={enabled}
          disabled={disabled}
          busy={pending}
          accessibilityLabel="Allow relay path"
          onValueChange={onToggle}
        />
      </SettingRow>
      <Text style={panelStyles.muted}>
        Relay is a degraded fallback path and must be explicitly enabled. A datacenter gateway is
        not the same as an unrelated relay.
      </Text>
    </View>
  )
}

type AllowRelayOverride = 'inherit' | 'on' | 'off'

function allowRelayOverride(value: boolean | null): AllowRelayOverride {
  if (value === true) return 'on'
  if (value === false) return 'off'
  return 'inherit'
}

function AllowRelayOverridePicker({
  value,
  disabled,
  effective,
  onChange,
}: Readonly<{
  value: boolean | null
  disabled: boolean
  effective: boolean
  onChange: (next: boolean | null) => void
}>) {
  const selected = allowRelayOverride(value)
  return (
    <>
      <FormField label="Allow relay">
        <SegmentedControl
          options={[
            { value: 'inherit', label: 'Inherit' },
            { value: 'on', label: 'On' },
            { value: 'off', label: 'Off' },
          ]}
          value={selected}
          disabled={disabled}
          accessibilityLabel="Allow relay"
          onChange={(next) => {
            if (next === selected) return
            if (next === 'inherit') onChange(null)
            else onChange(next === 'on')
          }}
        />
      </FormField>
      <Text style={panelStyles.muted}>Effective: {effective ? 'On' : 'Off'}</Text>
    </>
  )
}

function PreferredGatewayPicker({
  selectedIds,
  gateways,
  disabled,
  onToggle,
}: Readonly<{
  selectedIds: readonly string[]
  gateways: readonly { serverId: string; label: string }[]
  disabled: boolean
  onToggle: (serverId: string) => void
}>) {
  if (gateways.length === 0) {
    return (
      <>
        <Text style={styles.fieldLabel}>Preferred gateways</Text>
        <Text style={panelStyles.muted}>Promote a gateway-role relay before preferring one.</Text>
      </>
    )
  }
  return (
    <>
      <Text style={styles.fieldLabel}>Preferred gateways</Text>
      <View style={panelStyles.segmentGroup}>
        {gateways.map((gateway) => {
          const active = selectedIds.includes(gateway.serverId)
          return (
            <Pressable
              key={gateway.serverId}
              accessibilityRole="button"
              accessibilityLabel={`Prefer gateway ${gateway.label}`}
              accessibilityState={{ selected: active, disabled }}
              disabled={disabled}
              onPress={() => {
                if (!disabled) onToggle(gateway.serverId)
              }}
              style={[
                panelStyles.segmentChip,
                active && panelStyles.segmentChipActive,
                disabled && styles.toggleDisabled,
                webPointer,
              ]}
            >
              <Text
                style={[panelStyles.segmentChipText, active && panelStyles.segmentChipTextActive]}
              >
                {gateway.label}
              </Text>
            </Pressable>
          )
        })}
      </View>
    </>
  )
}

function pathRowWarning(row: FabricPathMatrixRow): string | null {
  if (row.kind === 'unreachable') return 'Unreachable'
  if (fabricPathIsDegraded(row)) return 'DEGRADED'
  return null
}

function pathRowLatency(row: FabricPathMatrixRow): string | null {
  if (row.kind === 'unreachable' || row.latencyMs === undefined) return null
  return `${String(row.latencyMs)} ms`
}

const PAIR_PATHS_HELP = `Servers that share a trusted datacenter network talk over the LAN with no tunnel, even with ${TURBOFABRIC_PRODUCT_NAME} off. ${TURBOFABRIC_PRODUCT_NAME} carries traffic between datacenters and runs encrypted over a network marked untrusted.`

/** Server pairs as the panel reports them (`pairs[]`), with tunnel readings folded in. */
function FabricPairPathsPanel({ rows }: Readonly<{ rows: readonly FabricPairRow[] }>) {
  return (
    <SectionPanel title="Paths" hint={`${rows.length} pair(s)`}>
      <Text style={panelStyles.muted}>{PAIR_PATHS_HELP}</Text>
      <FabricPairPathList rows={rows} />
    </SectionPanel>
  )
}

/** Older control plane without `pairs[]`: the relay-observed tunnel paths. */
function FabricPathMatrixPanel({ rows }: Readonly<{ rows: readonly FabricPathMatrixRow[] }>) {
  return (
    <SectionPanel title="Paths" hint={`${rows.length} pair(s)`}>
      {rows.length === 0 ? (
        <EmptyState title="No peer paths observed yet. Apply to probe." />
      ) : (
        <View style={styles.list}>
          {rows.map((row) => {
            const warning = pathRowWarning(row)
            const latency = pathRowLatency(row)
            return (
              <View key={`${row.fromServerId}:${row.toServerId}`} style={panelStyles.detailCard}>
                <Text style={panelStyles.detailTitle}>
                  {row.fromLabel} → {row.toLabel}
                </Text>
                <Text style={panelStyles.detailLine}>
                  <Text style={panelStyles.detailLabel}>Path: </Text>
                  {fabricPathKindLabel(row.kind)}
                  {latency ? `  ${latency}` : ''}
                </Text>
                {row.viaLabel ? (
                  <Text style={panelStyles.detailLine}>
                    <Text style={panelStyles.detailLabel}>Via: </Text>
                    {row.viaLabel}
                  </Text>
                ) : null}
                {warning ? (
                  <View style={panelStyles.calloutWarning}>
                    <Text style={panelStyles.calloutWarningText}>{warning}</Text>
                  </View>
                ) : null}
              </View>
            )
          })}
        </View>
      )}
    </SectionPanel>
  )
}

function RolePicker({
  role,
  disabled,
  onChange,
}: Readonly<{
  role: RelayRole
  disabled: boolean
  onChange: (role: RelayRole) => void
}>) {
  return (
    <SegmentedControl
      options={(['gateway', 'member'] as const).map((value) => ({
        value,
        label: relayRoleLabel(value),
      }))}
      value={role}
      disabled={disabled}
      accessibilityLabel="LAN Ranges"
      onChange={(value) => {
        if (value !== role) onChange(value)
      }}
    />
  )
}

function HandshakeLine({
  lastHandshakeAt,
  observedAt,
}: Readonly<{ lastHandshakeAt: string | null; observedAt?: string }>) {
  const reading = fabricHandshakeReading(lastHandshakeAt, observedAt, Date.now())
  const label = formatRelativeLocalDateTime(lastHandshakeAt, {
    neverLabel: 'Never',
  })
  if (reading === 'fresh') {
    return (
      <Text style={panelStyles.detailLine}>
        <Text style={panelStyles.detailLabel}>Last handshake: </Text>
        {label}
      </Text>
    )
  }
  let warning = `Last handshake stale — ${label}`
  if (!lastHandshakeAt) warning = 'Not converged yet — no handshake observed'
  else if (reading === 'unreported') {
    warning = `This server has not reported lately. Last handshake it saw: ${label}`
  }
  return (
    <View style={panelStyles.calloutWarning}>
      <Text style={panelStyles.calloutWarningText}>{warning}</Text>
    </View>
  )
}

function RelayResolvedAdvertisedCidrs({ cidrs }: Readonly<{ cidrs: readonly string[] }>) {
  const formatted = formatResolvedAdvertisedCidrs(cidrs)
  if (cidrs.length === 0) {
    return <Text style={panelStyles.muted}>Resolved advertised CIDRs: {formatted}</Text>
  }
  return (
    <Text style={panelStyles.detailLine}>
      <Text style={panelStyles.detailLabel}>Resolved advertised CIDRs: </Text>
      <Text style={styles.mono} selectable>
        {formatted}
      </Text>
    </Text>
  )
}

function AdvertisedCidrsField({
  role,
  draft,
  storedEmpty,
  resolvedCidrs,
  disabled,
  onChange,
  onSave,
}: Readonly<{
  role: RelayRole
  draft: string
  storedEmpty: boolean
  resolvedCidrs: readonly string[]
  disabled: boolean
  onChange: (value: string) => void
  onSave: () => void
}>) {
  if (role !== 'gateway') {
    return (
      <Text style={panelStyles.muted}>
        This server does not share its datacenter&apos;s LAN ranges.
      </Text>
    )
  }
  return (
    <>
      <TextField
        label="Advertised LAN CIDRs"
        hint={storedEmpty ? 'Empty override uses derived IPv4 datacenter subnets.' : undefined}
        value={draft}
        onChangeText={onChange}
        onBlur={onSave}
        editable={!disabled}
        placeholder="(derived IPv4 datacenter subnets)"
        autoCapitalize="none"
        autoCorrect={false}
        mono
        accessibilityLabel="Advertised LAN CIDRs override"
      />
      <RelayResolvedAdvertisedCidrs cidrs={resolvedCidrs} />
    </>
  )
}

function RelayPresharedKeyField({
  draft,
  disabled,
  onChange,
  onSave,
}: Readonly<{
  draft: string
  disabled: boolean
  onChange: (value: string) => void
  onSave: () => void
}>) {
  return (
    <>
      <TextField
        label="Set preshared key"
        value={draft}
        onChangeText={onChange}
        editable={!disabled}
        placeholder="Write-only — leave empty to keep current"
        autoCapitalize="none"
        autoCorrect={false}
        secureTextEntry
      />
      <Button label="Set key" disabled={!draft.trim() || disabled} onPress={onSave} />
    </>
  )
}

function RelayConfiguredFields({
  relay,
  canManage,
  disabled,
  advertisedDraft,
  endpointDraft,
  keepaliveDraft,
  pskDraft,
  eligibleGateways,
  onAdvertisedChange,
  onEndpointChange,
  onKeepaliveChange,
  onPskChange,
  onRoleChange,
  onAllowRelayChange,
  onPreferredGatewayToggle,
  onSaveAdvertised,
  onSaveEndpoint,
  onSaveKeepalive,
  onSavePresharedKey,
  publicPeerExists,
}: Readonly<{
  relay: RelayRecord
  canManage: boolean
  disabled: boolean
  advertisedDraft: string
  endpointDraft: string
  keepaliveDraft: string
  pskDraft: string
  eligibleGateways: readonly { serverId: string; label: string }[]
  publicPeerExists: boolean
  onAdvertisedChange: (value: string) => void
  onEndpointChange: (value: string) => void
  onKeepaliveChange: (value: string) => void
  onPskChange: (value: string) => void
  onRoleChange: (role: RelayRole) => void
  onAllowRelayChange: (next: boolean | null) => void
  onPreferredGatewayToggle: (serverId: string) => void
  onSaveAdvertised: () => void
  onSaveEndpoint: () => void
  onSaveKeepalive: () => void
  onSavePresharedKey: () => void
}>) {
  const preferredGateways = eligibleGateways.filter(
    (gateway) => gateway.serverId !== relay.serverId
  )
  return (
    <>
      <Text style={panelStyles.detailLine}>
        <Text style={panelStyles.detailLabel}>TurboFabric address: </Text>
        <Text style={styles.mono} selectable>
          {relay.address}
        </Text>
      </Text>
      <FormField label="LAN Ranges">
        <RolePicker role={relay.role} disabled={disabled} onChange={onRoleChange} />
      </FormField>
      <Text style={panelStyles.muted}>
        Shared: this server passes its datacenter&apos;s private ranges to the other servers on{' '}
        {TURBOFABRIC_PRODUCT_NAME}.
      </Text>
      <AdvertisedCidrsField
        role={relay.role}
        draft={advertisedDraft}
        storedEmpty={relay.advertisedCidrs.length === 0}
        resolvedCidrs={relay.resolvedAdvertisedCidrs}
        disabled={disabled}
        onChange={onAdvertisedChange}
        onSave={onSaveAdvertised}
      />
      <TextField
        label="Endpoint override"
        hint={
          relay.endpointAddress
            ? ENDPOINT_OVERRIDE_HINT
            : `${ENDPOINT_OVERRIDE_HINT} Empty override uses auto-derivation.`
        }
        value={endpointDraft}
        onChangeText={onEndpointChange}
        onBlur={onSaveEndpoint}
        editable={!disabled}
        placeholder="(auto)"
        autoCapitalize="none"
        autoCorrect={false}
        mono
      />
      <RelayResolvedEndpoint relay={relay} publicPeerExists={publicPeerExists} />
      <RelaySegments segments={relay.segments} />
      <TextField
        label="Keepalive (seconds)"
        value={keepaliveDraft}
        onChangeText={onKeepaliveChange}
        onBlur={onSaveKeepalive}
        editable={!disabled}
        keyboardType="number-pad"
        placeholder="default"
      />
      <AllowRelayOverridePicker
        value={relay.allowRelay}
        disabled={disabled}
        effective={relay.effectiveAllowRelay}
        onChange={onAllowRelayChange}
      />
      <PreferredGatewayPicker
        selectedIds={relay.preferredGatewayIds}
        gateways={preferredGateways}
        disabled={disabled}
        onToggle={onPreferredGatewayToggle}
      />
      <Text style={panelStyles.detailLine}>
        <Text style={panelStyles.detailLabel}>Public key: </Text>
        {relay.publicKey != null ? 'Present' : 'Pending'}
      </Text>
      <Text style={panelStyles.detailLine}>
        <Text style={panelStyles.detailLabel}>Preshared key: </Text>
        {relay.hasPresharedKey ? 'Present' : 'Not set'}
      </Text>
      <HandshakeLine lastHandshakeAt={relay.lastHandshakeAt} observedAt={relay.observedAt} />
      {canManage ? (
        <RelayPresharedKeyField
          draft={pskDraft}
          disabled={disabled}
          onChange={onPskChange}
          onSave={onSavePresharedKey}
        />
      ) : null}
    </>
  )
}

function RelayRow({
  orgId,
  server,
  relay,
  canManage,
  applyPending,
  applyStatus,
  applyError,
  eligibleGateways,
  publicPeerExists,
}: Readonly<{
  orgId: string
  server: OrgServerRecord
  relay: RelayRecord | undefined
  canManage: boolean
  applyPending: boolean
  applyStatus: CommandStatus | null
  applyError: string | null
  eligibleGateways: readonly { serverId: string; label: string }[]
  publicPeerExists: boolean
}>) {
  const patch = usePatchOrgFabricRelay(orgId, server.id)
  const [rowError, setRowError] = useState<string | null>(null)
  const [advertisedDraft, setAdvertisedDraft] = useState(relay?.advertisedCidrs.join(', ') ?? '')
  const [endpointDraft, setEndpointDraft] = useState(relay?.endpointAddress ?? '')
  const [keepaliveDraft, setKeepaliveDraft] = useState(
    relay?.keepalive != null ? String(relay.keepalive) : ''
  )
  const [pskDraft, setPskDraft] = useState('')

  const disabled = !canManage || !relay || patch.isPending || applyPending

  function handlePatchError(err: unknown) {
    setRowError(fabricMutationError(err))
  }

  function saveAdvertised() {
    if (!relay || disabled || relay.role !== 'gateway') return
    const next = parseCidrList(advertisedDraft)
    const current = relay.advertisedCidrs
    if (next.length === current.length && next.every((cidr, index) => cidr === current[index])) {
      return
    }
    setRowError(null)
    patch.mutate({ advertisedCidrs: next }, { onError: handlePatchError })
  }

  function saveEndpoint() {
    if (!relay || disabled) return
    const trimmed = endpointDraft.trim()
    const next = trimmed.length > 0 ? trimmed : null
    if (next === relay.endpointAddress) return
    setRowError(null)
    patch.mutate({ endpointAddress: next }, { onError: handlePatchError })
  }

  function saveKeepalive() {
    if (!relay || disabled) return
    const parsed = parseKeepaliveDraft(keepaliveDraft)
    if (!parsed.ok) {
      setRowError(parsed.message)
      return
    }
    if (parsed.value === relay.keepalive) return
    setRowError(null)
    patch.mutate({ keepalive: parsed.value }, { onError: handlePatchError })
  }

  function savePresharedKey() {
    if (!relay || disabled) return
    const trimmed = pskDraft.trim()
    if (!trimmed) return
    setRowError(null)
    patch.mutate(
      { presharedKey: trimmed },
      {
        onSuccess: () => setPskDraft(''),
        onError: handlePatchError,
      }
    )
  }

  function saveAllowRelay(next: boolean | null) {
    if (!relay || disabled) return
    if (next === relay.allowRelay) return
    setRowError(null)
    patch.mutate({ allowRelay: next }, { onError: handlePatchError })
  }

  function togglePreferredGateway(serverId: string) {
    if (!relay || disabled) return
    const current = relay.preferredGatewayIds
    const next = current.includes(serverId)
      ? current.filter((id) => id !== serverId)
      : [...current, serverId]
    setRowError(null)
    patch.mutate({ preferredGatewayIds: next }, { onError: handlePatchError })
  }

  const reconcile = fabricReconcileLines(relay?.reconcile ?? null)
  const displayError = rowError ?? patch.actionError ?? applyError ?? reconcile.error
  const applyHint = relayApplyHint(applyPending, applyStatus, displayError !== null)

  return (
    <View style={panelStyles.detailCard}>
      <Text style={panelStyles.detailTitle}>{serverTitle(server)}</Text>
      {!relay ? (
        <View style={panelStyles.calloutWarning}>
          <Text style={panelStyles.calloutWarningText}>
            Not on the mesh yet — enable {TURBOFABRIC_PRODUCT_NAME} and Apply.
          </Text>
        </View>
      ) : (
        <RelayConfiguredFields
          relay={relay}
          canManage={canManage}
          disabled={disabled}
          advertisedDraft={advertisedDraft}
          endpointDraft={endpointDraft}
          keepaliveDraft={keepaliveDraft}
          pskDraft={pskDraft}
          eligibleGateways={eligibleGateways}
          publicPeerExists={publicPeerExists}
          onAdvertisedChange={setAdvertisedDraft}
          onEndpointChange={setEndpointDraft}
          onKeepaliveChange={setKeepaliveDraft}
          onPskChange={setPskDraft}
          onRoleChange={(role) => {
            setRowError(null)
            patch.mutate({ role }, { onError: handlePatchError })
          }}
          onAllowRelayChange={saveAllowRelay}
          onPreferredGatewayToggle={togglePreferredGateway}
          onSaveAdvertised={saveAdvertised}
          onSaveEndpoint={saveEndpoint}
          onSaveKeepalive={saveKeepalive}
          onSavePresharedKey={savePresharedKey}
        />
      )}
      {applyHint ? <Text style={panelStyles.muted}>{applyHint}</Text> : null}
      {reconcile.warnings.map((line) => (
        <Text key={line} style={panelStyles.muted}>
          {line}
        </Text>
      ))}
      {displayError ? <Text style={panelStyles.error}>{displayError}</Text> : null}
    </View>
  )
}

function FabricApplyButton({
  disabled,
  busy,
  onPress,
}: Readonly<{
  disabled: boolean
  busy: boolean
  onPress: () => void
}>) {
  return (
    <Button
      label="Apply"
      variant="primary"
      busy={busy}
      disabled={disabled}
      onPress={onPress}
      accessibilityLabel={`Apply ${TURBOFABRIC_PRODUCT_NAME}`}
    />
  )
}

function FabricRelaysPanel({
  orgId,
  servers,
  serversLoading,
  relayCount,
  relayByServerId,
  commandByServerId,
  inFlightByServerId,
  applyErrors,
  canManage,
  applyDisabled,
  applyBusy,
  eligibleGateways,
  publicRelayIds,
  onApply,
}: Readonly<{
  orgId: string
  servers: readonly OrgServerRecord[]
  serversLoading: boolean
  relayCount: number
  relayByServerId: ReadonlyMap<string, RelayRecord>
  commandByServerId: ReadonlyMap<string, CommandStatus>
  inFlightByServerId: ReadonlySet<string>
  applyErrors: Readonly<Record<string, string>>
  canManage: boolean
  applyDisabled: boolean
  applyBusy: boolean
  eligibleGateways: readonly { serverId: string; label: string }[]
  /** Servers with a public address (or override) others can connect out to. */
  publicRelayIds: ReadonlySet<string>
  onApply: () => void
}>) {
  return (
    <SectionPanel title="Relays" hint={`${relayCount} host(s)`}>
      {canManage ? (
        <FabricApplyButton disabled={applyDisabled} busy={applyBusy} onPress={onApply} />
      ) : null}
      {serversLoading && servers.length === 0 ? <LoadingState label="Loading servers…" /> : null}
      {!serversLoading && servers.length === 0 ? (
        <EmptyState title="No servers enrolled yet." />
      ) : null}
      <View style={styles.list}>
        {servers.map((server) => (
          <RelayRow
            key={server.id}
            orgId={orgId}
            server={server}
            relay={relayByServerId.get(server.id)}
            canManage={canManage}
            applyPending={inFlightByServerId.has(server.id)}
            applyStatus={commandByServerId.get(server.id) ?? null}
            applyError={applyErrors[server.id] ?? null}
            eligibleGateways={eligibleGateways}
            publicPeerExists={[...publicRelayIds].some((id) => id !== server.id)}
          />
        ))}
      </View>
    </SectionPanel>
  )
}

function FabricServersPanel({
  orgId,
  servers,
  canManage,
}: Readonly<{
  orgId: string
  servers: readonly OrgFabricServerRecord[]
  canManage: boolean
}>) {
  return (
    <SectionPanel title="Servers" hint={`${servers.length} server(s)`}>
      <Text style={panelStyles.muted}>
        Switch a server off to keep it out of {TURBOFABRIC_PRODUCT_NAME}. {FABRIC_ROLE_HELP}
      </Text>
      <View style={styles.list}>
        {servers.map((server) => (
          <View key={server.serverId} style={panelStyles.detailCard}>
            <FabricServerControls
              orgId={orgId}
              server={server}
              canManage={canManage}
              showName
              showRoleHelp={false}
            />
          </View>
        ))}
      </View>
    </SectionPanel>
  )
}

function eligibleGatewayRows(
  relays: readonly RelayRecord[],
  serverNameById: ReadonlyMap<string, string>
): { serverId: string; label: string }[] {
  const rows: { serverId: string; label: string }[] = []
  for (const relay of relays) {
    if (!relay.gatewayEligible) continue
    rows.push({
      serverId: relay.serverId,
      label: serverNameById.get(relay.serverId) ?? relay.serverId,
    })
  }
  return rows.sort((a, b) => a.label.localeCompare(b.label))
}

/** Which optional parts of the fabric section show, decided outside the component. */
function fabricSectionView(
  input: Readonly<{
    canManage: boolean
    unavailable: boolean
    enabled: boolean
    state: ReturnType<typeof fabricState>
    loading: boolean
    defaultFabricEnabled: boolean
    serverCount: number
    pairCount: number
    /** Fabric settings and the manage permission have answered. */
    loaded: boolean
    permissionLoading: boolean
  }>
): {
  showStatus: boolean
  showManageHint: boolean
  showLoading: boolean
  showDefaultHint: boolean
  showServers: boolean
  showMesh: boolean
  showPairs: boolean
  showToggle: boolean
  showAllowRelay: boolean
} {
  // Paused keeps the relays (and their endpoint overrides) editable.
  const showMesh = (input.enabled || input.state === 'paused') && !input.unavailable
  const showToggle = input.canManage && !input.unavailable
  return {
    // Nothing is claimed (status, missing permission) before the data arrives.
    showStatus: input.loaded,
    showManageHint: input.loaded && !input.permissionLoading && !input.canManage,
    showToggle,
    showAllowRelay: showToggle && input.enabled,
    showLoading: input.loading,
    showDefaultHint: input.canManage && input.state === 'off' && input.defaultFabricEnabled,
    showServers: input.canManage && !input.unavailable && input.serverCount > 0,
    showMesh,
    // LAN pairs exist with TurboFabric off or paused, so the pair list does not wait for the mesh.
    showPairs: !input.unavailable && input.pairCount > 0,
  }
}

function isFabricToggleDisabled(
  flags: Readonly<{ pending: boolean; unavailable: boolean; canManage: boolean; loaded: boolean }>
): boolean {
  return flags.pending || flags.unavailable || !flags.canManage || !flags.loaded
}

function isFabricApplyDisabled(
  flags: Readonly<{ canManage: boolean; enabled: boolean; unavailable: boolean; busy: boolean }>
): boolean {
  return !flags.canManage || !flags.enabled || flags.unavailable || flags.busy
}

/** Server pairs from the panel's `pairs[]` (empty on an older panel), with tunnel readings folded in. */
function useFabricPairRows(
  pairs: OrgFabricPairRecord[] | undefined,
  pathMatrix: Parameters<typeof buildFabricPairRows>[1],
  serverNameById: Parameters<typeof buildFabricPairRows>[2]
): FabricPairRow[] {
  return useMemo(
    () => buildFabricPairRows(orEmptyArray(pairs), pathMatrix, serverNameById),
    [pairs, pathMatrix, serverNameById]
  )
}

/**
 * Org opt-in for TurboFabric. Default off. Enabling lets environments run
 * across servers; standalone Docker does not require it.
 */
export function NetworkFabricSection({ orgId }: Readonly<{ orgId: string }>) {
  const permission = useCanState('organization', orgId, 'organization:manage')
  const canManage = permission.allowed
  const [error, setError] = useState<string | null>(null)
  const [tracked, setTracked] = useState<TrackedCommandEntry[]>([])
  const [applyErrors, setApplyErrors] = useState<Record<string, string>>({})
  const query = useOrgFabric(orgId)
  const hostDefaultsQuery = useQuery({
    queryKey: queryKeys.org(orgId).settings.hostDefaults,
    queryFn: () => fetchOrgHostDefaults(orgId),
    enabled: canManage && orgId.length > 0,
  })
  const serversQuery = useOrgServers(orgId)
  const mutation = useSaveOrgFabric(orgId)
  const applyMutation = useApplyOrgFabric(orgId)
  const commandsQuery = useCommandsBatch(orgId, tracked)

  const unavailable = isOrgFabricUnavailable(query.error)
  const enabled = query.data?.enabled === true
  const state = fabricState(query.data)
  const fabricServers = orEmptyArray(query.data?.servers)
  const fabric = query.data?.fabric
  const relays = orEmptyArray(query.data?.relays)
  const servers = orEmptyArray(serversQuery.data?.servers)
  const pending = mutation.isPending || query.isLoading
  const queryError = fabricLoadError(query.isError, unavailable, query.error)
  const displayError = error ?? mutation.actionError ?? applyMutation.actionError ?? queryError
  const toggleDisabled = isFabricToggleDisabled({
    pending,
    unavailable,
    canManage,
    loaded: query.data !== undefined,
  })

  const relayByServerId = useMemo(() => {
    const map = new Map<string, RelayRecord>()
    for (const relay of relays) map.set(relay.serverId, relay)
    return map
  }, [relays])

  const serverNameById = useMemo(() => {
    const map = new Map<string, string>()
    for (const server of servers) {
      map.set(server.id, serverTitle(server))
    }
    return map
  }, [servers])

  const pathMatrix = useMemo(
    () => buildFabricPathMatrix(relays, serverNameById),
    [relays, serverNameById]
  )

  const pairRows = useFabricPairRows(query.data?.pairs, pathMatrix, serverNameById)
  const serverOutcomes = useMemo<FabricServerOutcome[]>(
    () =>
      relays.map((relay) => ({
        name: serverNameById.get(relay.serverId) ?? relay.serverId,
        reconcile: relay.reconcile ?? null,
      })),
    [relays, serverNameById]
  )
  const publicRelayIds = useMemo(
    () => new Set(relays.filter((relay) => relay.resolvedEndpoint).map((relay) => relay.serverId)),
    [relays]
  )
  const view = fabricSectionView({
    canManage,
    unavailable,
    enabled,
    state,
    loading: query.isLoading && !query.data,
    defaultFabricEnabled: hostDefaultsQuery.data?.defaultFabricEnabled === true,
    serverCount: fabricServers.length,
    pairCount: pairRows.length,
    loaded: query.data !== undefined,
    permissionLoading: permission.loading,
  })

  const eligibleGateways = useMemo(
    () => eligibleGatewayRows(relays, serverNameById),
    [relays, serverNameById]
  )

  const commandByServerId = useMemo(() => {
    const map = new Map<string, CommandStatus>()
    for (const command of commandsQuery.data ?? []) {
      map.set(command.serverId, command.status)
    }
    return map
  }, [commandsQuery.data])

  const inFlightByServerId = useMemo(() => {
    const set = new Set<string>()
    for (const command of commandsQuery.data ?? []) {
      if (!isTerminalCommandStatus(command.status)) {
        set.add(command.serverId)
      }
    }
    return set
  }, [commandsQuery.data])

  const applyBusy = hasPendingTrackedCommands(tracked, commandsQuery.data)
  const applyDisabled = isFabricApplyDisabled({
    canManage,
    enabled,
    unavailable,
    busy: applyMutation.isPending || applyBusy,
  })

  function handleAllowRelayToggle() {
    if (toggleDisabled || !enabled) return
    setError(null)
    mutation.mutate(
      { enabled: true, allowRelay: fabric?.allowRelay !== true },
      {
        onError: (err) => {
          setError(fabricMutationError(err))
        },
      }
    )
  }

  function handleApply() {
    if (applyDisabled) return
    setError(null)
    setApplyErrors({})
    applyMutation.mutate(undefined, {
      onSuccess: (data) => {
        setApplyErrors(failedApplyByServer(data.results))
        setTracked((prev) => mergeTrackedCommandEntries(prev, queuedApplyEntries(data.results)))
      },
      onError: (err) => {
        setError(fabricMutationError(err))
      },
    })
  }

  return (
    <View style={styles.root}>
      <Text style={panelStyles.pageTitle}>{TURBOFABRIC_PRODUCT_NAME}</Text>
      <Text style={panelStyles.pageCopy}>
        Enabling {TURBOFABRIC_PRODUCT_NAME} lets environments run across servers. It is not required
        for single-engine Docker.
      </Text>

      {unavailable ? <FabricUnavailableNotice /> : null}

      {displayError ? <Text style={panelStyles.error}>{displayError}</Text> : null}

      <SectionPanel title={TURBOFABRIC_PRODUCT_NAME} hint="Opt-in · default off">
        {view.showLoading ? <LoadingState /> : null}

        {view.showStatus ? (
          <FabricStatusBlock state={state} cidr={fabric?.cidr} status={fabric?.status} />
        ) : null}

        {view.showToggle ? (
          <FabricLifecycleControls
            orgId={orgId}
            state={state}
            hasFabric={fabric !== undefined || state === 'paused'}
            disabled={toggleDisabled}
            serverOutcomes={serverOutcomes}
          />
        ) : null}

        {view.showAllowRelay ? (
          <FabricAllowRelayToggle
            enabled={fabric?.allowRelay === true}
            disabled={toggleDisabled}
            pending={mutation.isPending}
            onToggle={handleAllowRelayToggle}
          />
        ) : null}

        {view.showDefaultHint ? (
          <Text style={panelStyles.muted}>
            Host defaults prefer {TURBOFABRIC_PRODUCT_NAME} on. Enabling here still creates the
            mesh.
          </Text>
        ) : null}

        {view.showManageHint ? <FabricManageHint /> : null}
      </SectionPanel>

      {view.showServers ? (
        <FabricServersPanel orgId={orgId} servers={fabricServers} canManage={canManage} />
      ) : null}

      {view.showMesh ? (
        <>
          <FabricRelaysPanel
            orgId={orgId}
            servers={servers}
            serversLoading={serversQuery.isLoading}
            relayCount={relays.length}
            relayByServerId={relayByServerId}
            commandByServerId={commandByServerId}
            inFlightByServerId={inFlightByServerId}
            applyErrors={applyErrors}
            canManage={canManage}
            applyDisabled={applyDisabled}
            applyBusy={applyMutation.isPending || applyBusy}
            eligibleGateways={eligibleGateways}
            publicRelayIds={publicRelayIds}
            onApply={handleApply}
          />
          {view.showPairs ? null : <FabricPathMatrixPanel rows={pathMatrix} />}
        </>
      ) : null}

      {view.showPairs ? <FabricPairPathsPanel rows={pairRows} /> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    width: '100%',
    gap: spacing.lg,
  },
  list: {
    gap: spacing.sm,
  },
  statusBlock: {
    gap: spacing.xs,
  },
  mono: {
    fontFamily: 'monospace',
  },
  fieldLabel: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
  toggleBlock: {
    gap: spacing.xs,
  },
  toggleDisabled: {
    opacity: 0.5,
  },
})
