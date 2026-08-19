import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
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
import {
  GATEWAY_DATACENTER_CIDR_REQUIRED_ERROR,
  GATEWAY_DATACENTER_REQUIRED_ERROR,
  PREFERRED_GATEWAY_INVALID_ERROR,
  fetchOrgHostDefaults,
  type CommandStatus,
  type FabricRelaySegment,
  type OrgServerRecord,
  type RelayRecord,
  type RelayRole,
} from '@/lib/instance-api'
import {
  buildFabricPathMatrix,
  fabricPathIsDegraded,
  fabricPathKindLabel,
  formatResolvedAdvertisedCidrs,
  relayRoleLabel,
  type FabricPathMatrixRow,
} from '@/lib/fabric-mesh'
import { formatRelativeLocalDateTime } from '@/lib/format-datetime'
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
import { useCan, queryKeys } from '@/lib/query-client'
import { chrome, colors, spacing } from '@/lib/theme'

const HANDSHAKE_STALE_MS = 3 * 60 * 1000

function fabricStatusLabel(enabled: boolean, status?: string): string {
  if (!enabled) return 'Off'
  const trimmed = status?.trim()
  if (trimmed) return trimmed
  return 'On'
}

function fabricLoadError(
  isError: boolean,
  unavailable: boolean,
  error: unknown,
): string | null {
  if (!isError || unavailable) return null
  if (error instanceof Error) return error.message
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
  return raw
}

function serverTitle(server: OrgServerRecord): string {
  return server.displayName?.trim() || server.hostname?.trim() || server.id
}

function parseCidrList(raw: string): string[] {
  return raw
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
}

function relayApplyHint(
  applyPending: boolean,
  applyStatus: CommandStatus | null,
): string | null {
  if (applyPending) return 'Applying…'
  if (!applyStatus || !isTerminalCommandStatus(applyStatus)) return null
  if (applyStatus === 'succeeded') return 'Applied'
  return applyStatus
}

function failedApplyByServer(
  results: readonly { serverId: string; status: string; error?: string }[],
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
  raw: string,
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

function handshakeIsStale(lastHandshakeAt: string | null): boolean {
  if (!lastHandshakeAt) return true
  const then = Date.parse(lastHandshakeAt)
  if (Number.isNaN(then)) return true
  return Date.now() - then > HANDSHAKE_STALE_MS
}

function queuedApplyEntries(
  results: readonly { serverId: string; commandId?: string }[],
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
  const parts = [segment.name, segment.subnet]
  if (segment.gateway) parts.push(`gw ${segment.gateway}`)
  if (segment.mtu != null) parts.push(`mtu ${String(segment.mtu)}`)
  return parts.join(' · ')
}

function RelayResolvedEndpoint({
  relay,
}: Readonly<{ relay: RelayRecord }>) {
  if (isAutoEndpointUnresolved(relay)) {
    return (
      <View style={orgPanelStyles.calloutWarning}>
        <Text style={orgPanelStyles.calloutWarningText}>
          Endpoint unresolved — auto-derivation failed. Pin an override or
          wait until this host has a public address.
        </Text>
      </View>
    )
  }
  if (!relay.resolvedEndpoint) {
    return (
      <Text style={orgPanelStyles.muted}>Resolved endpoint: unavailable</Text>
    )
  }
  return (
    <Text style={orgPanelStyles.detailLine}>
      <Text style={orgPanelStyles.detailLabel}>Resolved endpoint: </Text>
      <Text style={styles.mono} selectable>
        {relay.resolvedEndpoint}
      </Text>
    </Text>
  )
}

function RelaySegments({
  segments,
}: Readonly<{ segments: readonly FabricRelaySegment[] }>) {
  return (
    <>
      <Text style={styles.fieldLabel}>Segments</Text>
      {segments.length === 0 ? (
        <Text style={orgPanelStyles.muted}>None on this host</Text>
      ) : (
        segments.map((segment) => (
          <Text
            key={`${segment.name}:${segment.subnet}`}
            style={orgPanelStyles.detailLine}
          >
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
  enabled,
  cidr,
  status,
}: Readonly<{ enabled: boolean; cidr?: string; status?: string }>) {
  return (
    <View style={styles.statusBlock}>
      <Text style={orgPanelStyles.detailLine}>
        <Text style={orgPanelStyles.detailLabel}>Status: </Text>
        {fabricStatusLabel(enabled, status)}
      </Text>
      {enabled && cidr ? (
        <Text style={orgPanelStyles.detailLine}>
          <Text style={orgPanelStyles.detailLabel}>CIDR: </Text>
          <Text style={styles.mono}>{cidr}</Text>
        </Text>
      ) : null}
    </View>
  )
}

function FabricUnavailableNotice() {
  return (
    <Text style={orgPanelStyles.muted}>
      {TURBOFABRIC_PRODUCT_NAME} is not available on this control plane
      yet.
    </Text>
  )
}

function FabricManageHint() {
  return (
    <Text style={orgPanelStyles.muted}>
      Organization manage permission is required to enable{' '}
      {TURBOFABRIC_PRODUCT_NAME}.
    </Text>
  )
}

function FabricEnableToggle({
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
    <View style={styles.toggleRow}>
      <Text style={styles.toggleLabel}>
        Enable {TURBOFABRIC_PRODUCT_NAME}
      </Text>
      <Pressable
        accessibilityRole="switch"
        accessibilityLabel={`Enable ${TURBOFABRIC_PRODUCT_NAME}`}
        accessibilityState={{ checked: enabled, disabled }}
        disabled={disabled}
        onPress={onToggle}
        style={[
          styles.toggle,
          enabled ? styles.toggleOn : styles.toggleOff,
          disabled && styles.toggleDisabled,
          webPointer,
        ]}
      >
        {pending ? (
          <ActivityIndicator size="small" color={colors.textMuted} />
        ) : (
          <Text
            style={[
              styles.toggleText,
              enabled ? styles.toggleTextOn : styles.toggleTextOff,
            ]}
          >
            {enabled ? 'On' : 'Off'}
          </Text>
        )}
      </Pressable>
    </View>
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
      <View style={styles.toggleRow}>
        <Text style={styles.toggleLabel}>Allow relay path</Text>
        <Pressable
          accessibilityRole="switch"
          accessibilityLabel="Allow relay path"
          accessibilityState={{ checked: enabled, disabled }}
          disabled={disabled}
          onPress={onToggle}
          style={[
            styles.toggle,
            enabled ? styles.toggleOn : styles.toggleOff,
            disabled && styles.toggleDisabled,
            webPointer,
          ]}
        >
          {pending ? (
            <ActivityIndicator size="small" color={colors.textMuted} />
          ) : (
            <Text
              style={[
                styles.toggleText,
                enabled ? styles.toggleTextOn : styles.toggleTextOff,
              ]}
            >
              {enabled ? 'On' : 'Off'}
            </Text>
          )}
        </Pressable>
      </View>
      <Text style={orgPanelStyles.muted}>
        Relay is a degraded fallback path and must be explicitly enabled. A
        datacenter gateway is not the same as an unrelated relay.
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
      <Text style={styles.fieldLabel}>Allow relay</Text>
      <View style={orgPanelStyles.segmentGroup}>
        {(
          [
            { id: 'inherit', label: 'Inherit', next: null },
            { id: 'on', label: 'On', next: true },
            { id: 'off', label: 'Off', next: false },
          ] as const
        ).map((option) => {
          const active = selected === option.id
          return (
            <Pressable
              key={option.id}
              accessibilityRole="button"
              accessibilityLabel={`Allow relay ${option.label}`}
              accessibilityState={{ selected: active, disabled }}
              disabled={disabled}
              onPress={() => {
                if (!disabled && option.id !== selected) onChange(option.next)
              }}
              style={[
                orgPanelStyles.segmentChip,
                active && orgPanelStyles.segmentChipActive,
                disabled && styles.toggleDisabled,
                webPointer,
              ]}
            >
              <Text
                style={[
                  orgPanelStyles.segmentChipText,
                  active && orgPanelStyles.segmentChipTextActive,
                ]}
              >
                {option.label}
              </Text>
            </Pressable>
          )
        })}
      </View>
      <Text style={orgPanelStyles.muted}>
        Effective: {effective ? 'On' : 'Off'}
      </Text>
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
        <Text style={orgPanelStyles.muted}>
          Promote a gateway-role relay before preferring one.
        </Text>
      </>
    )
  }
  return (
    <>
      <Text style={styles.fieldLabel}>Preferred gateways</Text>
      <View style={orgPanelStyles.segmentGroup}>
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
                orgPanelStyles.segmentChip,
                active && orgPanelStyles.segmentChipActive,
                disabled && styles.toggleDisabled,
                webPointer,
              ]}
            >
              <Text
                style={[
                  orgPanelStyles.segmentChipText,
                  active && orgPanelStyles.segmentChipTextActive,
                ]}
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

function FabricPathMatrixPanel({
  rows,
}: Readonly<{ rows: readonly FabricPathMatrixRow[] }>) {
  return (
    <SectionPanel title="Paths" hint={`${rows.length} pair(s)`}>
      {rows.length === 0 ? (
        <Text style={orgPanelStyles.muted}>
          No peer paths observed yet. Apply to probe.
        </Text>
      ) : (
        <View style={styles.list}>
          {rows.map((row) => {
            const warning = pathRowWarning(row)
            const latency = pathRowLatency(row)
            return (
              <View
                key={`${row.fromServerId}:${row.toServerId}`}
                style={orgPanelStyles.detailCard}
              >
                <Text style={orgPanelStyles.detailTitle}>
                  {row.fromLabel} → {row.toLabel}
                </Text>
                <Text style={orgPanelStyles.detailLine}>
                  <Text style={orgPanelStyles.detailLabel}>Path: </Text>
                  {fabricPathKindLabel(row.kind)}
                  {latency ? `  ${latency}` : ''}
                </Text>
                {row.viaLabel ? (
                  <Text style={orgPanelStyles.detailLine}>
                    <Text style={orgPanelStyles.detailLabel}>Via: </Text>
                    {row.viaLabel}
                  </Text>
                ) : null}
                {warning ? (
                  <View style={orgPanelStyles.calloutWarning}>
                    <Text style={orgPanelStyles.calloutWarningText}>
                      {warning}
                    </Text>
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
    <View style={orgPanelStyles.segmentGroup}>
      {(['gateway', 'member'] as const).map((value) => {
        const active = role === value
        return (
          <Pressable
            key={value}
            accessibilityRole="button"
            accessibilityLabel={relayRoleLabel(value)}
            accessibilityState={{ selected: active, disabled }}
            disabled={disabled}
            onPress={() => {
              if (!disabled && value !== role) onChange(value)
            }}
            style={[
              orgPanelStyles.segmentChip,
              active && orgPanelStyles.segmentChipActive,
              disabled && styles.toggleDisabled,
              webPointer,
            ]}
          >
            <Text
              style={[
                orgPanelStyles.segmentChipText,
                active && orgPanelStyles.segmentChipTextActive,
              ]}
            >
              {relayRoleLabel(value)}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}

function HandshakeLine({
  lastHandshakeAt,
}: Readonly<{ lastHandshakeAt: string | null }>) {
  const stale = handshakeIsStale(lastHandshakeAt)
  const label = formatRelativeLocalDateTime(lastHandshakeAt, {
    neverLabel: 'Never',
  })
  if (!stale) {
    return (
      <Text style={orgPanelStyles.detailLine}>
        <Text style={orgPanelStyles.detailLabel}>Last handshake: </Text>
        {label}
      </Text>
    )
  }
  return (
    <View style={orgPanelStyles.calloutWarning}>
      <Text style={orgPanelStyles.calloutWarningText}>
        {lastHandshakeAt
          ? `Last handshake stale — ${label}`
          : 'Not converged yet — no handshake observed'}
      </Text>
    </View>
  )
}

function RelayResolvedAdvertisedCidrs({
  cidrs,
}: Readonly<{ cidrs: readonly string[] }>) {
  const formatted = formatResolvedAdvertisedCidrs(cidrs)
  if (cidrs.length === 0) {
    return (
      <Text style={orgPanelStyles.muted}>
        Resolved advertised CIDRs: {formatted}
      </Text>
    )
  }
  return (
    <Text style={orgPanelStyles.detailLine}>
      <Text style={orgPanelStyles.detailLabel}>Resolved advertised CIDRs: </Text>
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
      <Text style={orgPanelStyles.muted}>
        Members do not advertise LAN CIDRs.
      </Text>
    )
  }
  return (
    <>
      <Text style={styles.fieldLabel}>Advertised LAN CIDRs</Text>
      <TextInput
        value={draft}
        onChangeText={onChange}
        onBlur={onSave}
        editable={!disabled}
        placeholder="(derived IPv4 datacenter subnets)"
        placeholderTextColor={colors.textFaint}
        style={styles.input}
        autoCapitalize="none"
        autoCorrect={false}
        accessibilityLabel="Advertised LAN CIDRs override"
      />
      {storedEmpty ? (
        <Text style={orgPanelStyles.muted}>
          Empty override uses derived IPv4 datacenter subnets.
        </Text>
      ) : null}
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
      <Text style={styles.fieldLabel}>Set preshared key</Text>
      <TextInput
        value={draft}
        onChangeText={onChange}
        editable={!disabled}
        placeholder="Write-only — leave empty to keep current"
        placeholderTextColor={colors.textFaint}
        style={styles.input}
        autoCapitalize="none"
        autoCorrect={false}
        secureTextEntry
      />
      <Pressable
        style={[
          orgPanelStyles.toolbarBtnSecondary,
          (!draft.trim() || disabled) && styles.toggleDisabled,
          webPointer,
        ]}
        disabled={!draft.trim() || disabled}
        onPress={onSave}
      >
        <Text style={orgPanelStyles.toolbarBtnTextSecondary}>Set key</Text>
      </Pressable>
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
}: Readonly<{
  relay: RelayRecord
  canManage: boolean
  disabled: boolean
  advertisedDraft: string
  endpointDraft: string
  keepaliveDraft: string
  pskDraft: string
  eligibleGateways: readonly { serverId: string; label: string }[]
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
    (gateway) => gateway.serverId !== relay.serverId,
  )
  return (
    <>
      <Text style={orgPanelStyles.detailLine}>
        <Text style={orgPanelStyles.detailLabel}>TurboFabric address: </Text>
        <Text style={styles.mono} selectable>
          {relay.address}
        </Text>
      </Text>
      <Text style={styles.fieldLabel}>Role</Text>
      <RolePicker
        role={relay.role}
        disabled={disabled}
        onChange={onRoleChange}
      />
      <AdvertisedCidrsField
        role={relay.role}
        draft={advertisedDraft}
        storedEmpty={relay.advertisedCidrs.length === 0}
        resolvedCidrs={relay.resolvedAdvertisedCidrs}
        disabled={disabled}
        onChange={onAdvertisedChange}
        onSave={onSaveAdvertised}
      />
      <Text style={styles.fieldLabel}>Endpoint override</Text>
      <TextInput
        value={endpointDraft}
        onChangeText={onEndpointChange}
        onBlur={onSaveEndpoint}
        editable={!disabled}
        placeholder="(auto)"
        placeholderTextColor={colors.textFaint}
        style={styles.input}
        autoCapitalize="none"
        autoCorrect={false}
      />
      {!relay.endpointAddress ? (
        <Text style={orgPanelStyles.muted}>
          Empty override uses auto-derivation.
        </Text>
      ) : null}
      <RelayResolvedEndpoint relay={relay} />
      <RelaySegments segments={relay.segments} />
      <Text style={styles.fieldLabel}>Keepalive (seconds)</Text>
      <TextInput
        value={keepaliveDraft}
        onChangeText={onKeepaliveChange}
        onBlur={onSaveKeepalive}
        editable={!disabled}
        keyboardType="number-pad"
        placeholder="default"
        placeholderTextColor={colors.textFaint}
        style={styles.input}
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
      <Text style={orgPanelStyles.detailLine}>
        <Text style={orgPanelStyles.detailLabel}>Public key: </Text>
        {relay.publicKey != null ? 'Present' : 'Pending'}
      </Text>
      <Text style={orgPanelStyles.detailLine}>
        <Text style={orgPanelStyles.detailLabel}>Preshared key: </Text>
        {relay.hasPresharedKey ? 'Present' : 'Not set'}
      </Text>
      <HandshakeLine lastHandshakeAt={relay.lastHandshakeAt} />
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
}: Readonly<{
  orgId: string
  server: OrgServerRecord
  relay: RelayRecord | undefined
  canManage: boolean
  applyPending: boolean
  applyStatus: CommandStatus | null
  applyError: string | null
  eligibleGateways: readonly { serverId: string; label: string }[]
}>) {
  const patch = usePatchOrgFabricRelay(orgId, server.id)
  const [rowError, setRowError] = useState<string | null>(null)
  const [advertisedDraft, setAdvertisedDraft] = useState(
    relay?.advertisedCidrs.join(', ') ?? '',
  )
  const [endpointDraft, setEndpointDraft] = useState(
    relay?.endpointAddress ?? '',
  )
  const [keepaliveDraft, setKeepaliveDraft] = useState(
    relay?.keepalive != null ? String(relay.keepalive) : '',
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
    if (
      next.length === current.length &&
      next.every((cidr, index) => cidr === current[index])
    ) {
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
      },
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

  const displayError = rowError ?? patch.actionError ?? applyError
  const applyHint = relayApplyHint(applyPending, applyStatus)

  return (
    <View style={orgPanelStyles.detailCard}>
      <Text style={orgPanelStyles.detailTitle}>{serverTitle(server)}</Text>
      {!relay ? (
        <View style={orgPanelStyles.calloutWarning}>
          <Text style={orgPanelStyles.calloutWarningText}>
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
      {applyHint ? (
        <Text style={orgPanelStyles.muted}>{applyHint}</Text>
      ) : null}
      {displayError ? (
        <Text style={orgPanelStyles.error}>{displayError}</Text>
      ) : null}
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
    <Pressable
      style={[
        orgPanelStyles.toolbarBtnPrimary,
        disabled && styles.toggleDisabled,
        webPointer,
      ]}
      disabled={disabled}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Apply ${TURBOFABRIC_PRODUCT_NAME}`}
      accessibilityState={{ disabled, busy }}
    >
      {busy ? (
        <ActivityIndicator size="small" color={chrome.accent} />
      ) : (
        <Text style={orgPanelStyles.toolbarBtnTextPrimary}>Apply</Text>
      )}
    </Pressable>
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
  onApply: () => void
}>) {
  return (
    <SectionPanel title="Relays" hint={`${relayCount} host(s)`}>
      {canManage ? (
        <FabricApplyButton
          disabled={applyDisabled}
          busy={applyBusy}
          onPress={onApply}
        />
      ) : null}
      {serversLoading && servers.length === 0 ? (
        <Text style={orgPanelStyles.muted}>Loading servers…</Text>
      ) : null}
      {!serversLoading && servers.length === 0 ? (
        <Text style={orgPanelStyles.muted}>No servers enrolled yet.</Text>
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
          />
        ))}
      </View>
    </SectionPanel>
  )
}

/**
 * Org opt-in for TurboFabric. Default off. Enabling lets environments run
 * across servers; standalone Docker does not require it.
 */
export function NetworkFabricSection({
  orgId,
}: Readonly<{ orgId: string }>) {
  const canManage = useCan('organization', orgId, 'organization:manage')
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
  const fabric = query.data?.fabric
  const relays = orEmptyArray(query.data?.relays)
  const servers = orEmptyArray(serversQuery.data?.servers)
  const pending = mutation.isPending || query.isLoading
  const queryError = fabricLoadError(query.isError, unavailable, query.error)
  const displayError = error ?? mutation.actionError ?? applyMutation.actionError ?? queryError
  const toggleDisabled =
    pending || unavailable || !canManage || query.data === undefined
  const showToggle = canManage && !unavailable

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
    [relays, serverNameById],
  )

  const eligibleGateways = useMemo(() => {
    const rows: { serverId: string; label: string }[] = []
    for (const relay of relays) {
      if (!relay.gatewayEligible) continue
      rows.push({
        serverId: relay.serverId,
        label: serverNameById.get(relay.serverId) ?? relay.serverId,
      })
    }
    return rows.sort((a, b) => a.label.localeCompare(b.label))
  }, [relays, serverNameById])

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
  const applyDisabled =
    !canManage ||
    !enabled ||
    unavailable ||
    applyMutation.isPending ||
    applyBusy

  function handleToggle() {
    if (toggleDisabled) return
    setError(null)
    mutation.mutate(
      { enabled: !enabled },
      {
        onError: (err) => {
          setError(fabricMutationError(err))
        },
      },
    )
  }

  function handleAllowRelayToggle() {
    if (toggleDisabled || !enabled) return
    setError(null)
    mutation.mutate(
      { enabled: true, allowRelay: fabric?.allowRelay !== true },
      {
        onError: (err) => {
          setError(fabricMutationError(err))
        },
      },
    )
  }

  function handleApply() {
    if (!canManage || !enabled || applyMutation.isPending || applyBusy) return
    setError(null)
    setApplyErrors({})
    applyMutation.mutate(undefined, {
      onSuccess: (data) => {
        setApplyErrors(failedApplyByServer(data.results))
        setTracked((prev) =>
          mergeTrackedCommandEntries(prev, queuedApplyEntries(data.results)),
        )
      },
      onError: (err) => {
        setError(fabricMutationError(err))
      },
    })
  }

  return (
    <View style={styles.root}>
      <Text style={orgPanelStyles.pageTitle}>{TURBOFABRIC_PRODUCT_NAME}</Text>
      <Text style={orgPanelStyles.pageCopy}>
        Enabling {TURBOFABRIC_PRODUCT_NAME} lets environments run across
        servers. It is not required for single-engine Docker.
      </Text>

      {unavailable ? <FabricUnavailableNotice /> : null}

      {displayError ? (
        <Text style={orgPanelStyles.error}>{displayError}</Text>
      ) : null}

      <SectionPanel
        title={TURBOFABRIC_PRODUCT_NAME}
        hint="Opt-in · default off"
      >
        {query.isLoading && !query.data ? (
          <Text style={orgPanelStyles.muted}>Loading…</Text>
        ) : null}

        <FabricStatusBlock
          enabled={enabled}
          cidr={fabric?.cidr}
          status={fabric?.status}
        />

        {showToggle ? (
          <FabricEnableToggle
            enabled={enabled}
            disabled={toggleDisabled}
            pending={mutation.isPending}
            onToggle={handleToggle}
          />
        ) : null}

        {showToggle && enabled ? (
          <FabricAllowRelayToggle
            enabled={fabric?.allowRelay === true}
            disabled={toggleDisabled}
            pending={mutation.isPending}
            onToggle={handleAllowRelayToggle}
          />
        ) : null}

        {canManage &&
        !enabled &&
        hostDefaultsQuery.data?.defaultFabricEnabled === true ? (
          <Text style={orgPanelStyles.muted}>
            Host defaults prefer {TURBOFABRIC_PRODUCT_NAME} on. Enabling here
            still creates the mesh.
          </Text>
        ) : null}

        {canManage ? null : <FabricManageHint />}
      </SectionPanel>

      {enabled && !unavailable ? (
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
            onApply={handleApply}
          />
          <FabricPathMatrixPanel rows={pathMatrix} />
        </>
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
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 6,
    backgroundColor: colors.bgInput,
    color: colors.text,
    fontSize: 14,
    paddingHorizontal: 10,
    paddingVertical: 8,
    minHeight: 44,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    minHeight: 44,
  },
  toggleBlock: {
    gap: spacing.xs,
  },
  toggleLabel: {
    color: colors.textBody,
    fontSize: 14,
    fontWeight: '600',
    flexShrink: 1,
  },
  toggle: {
    minWidth: 64,
    minHeight: 44,
    paddingHorizontal: spacing.md,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggleOn: {
    backgroundColor: chrome.bgActive,
    borderColor: chrome.accent,
  },
  toggleOff: {
    backgroundColor: colors.bgSecondary,
    borderColor: colors.borderChip,
  },
  toggleDisabled: {
    opacity: 0.5,
  },
  toggleText: {
    fontSize: 13,
    fontWeight: '700',
  },
  toggleTextOn: {
    color: chrome.accent,
  },
  toggleTextOff: {
    color: colors.textChip,
  },
})
