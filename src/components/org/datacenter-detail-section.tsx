import { useRouter, type Href } from 'expo-router'
import { useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { FormSelect } from '@/components/org/form-select'
import { SectionPanel } from '@/components/org/section-panel'
import { orgPanelStyles, webPointer } from '@/components/org/org-panel-styles'
import { ServerTimezonePicker } from '@/components/org/server-timezone-picker'
import type {
  DatacenterRecord,
  OrgServerRecord,
  RelayRecord,
  RelayRole,
} from '@/lib/instance-api'
import {
  DATACENTER_HAS_MEMBERS_ERROR,
  DATACENTER_HAS_NETWORKS_ERROR,
} from '@/lib/instance-api'
import {
  useAddDatacenterMembers,
  useDatacenter,
  useDatacenters,
  useDeleteDatacenter,
  useIps,
  useRemoveDatacenterMember,
  useUpdateDatacenter,
} from '@/lib/queries/topology'
import { useOrgFabric } from '@/lib/queries/fabric'
import { useOrgServers, useTimezones } from '@/lib/queries/servers'
import {
  networkFabricHref,
  serversDatacentersHref,
} from '@/lib/org-navigation'
import { useCan } from '@/lib/query-client'
import {
  serverConnectionStatusLabel,
  resolveServerConnectionStatus,
} from '@/lib/server-connection-status'
import { chrome, colors, spacing } from '@/lib/theme'
import {
  addressesInCidr,
  listServersWithAddressInCidrs,
  reportedPrivateAddresses,
  serverIsDatacenterMember,
} from '@/lib/datacenter-list'
import {
  formatSiteLinkLabel,
  relayRoleLabel,
  resolvePrimaryGatewayByDatacenter,
  resolveSiteLinks,
} from '@/lib/fabric-mesh'
import { TURBOFABRIC_PRODUCT_NAME } from '@/lib/platform-copy'

function serverTitle(server: OrgServerRecord): string {
  return server.displayName?.trim() || server.hostname?.trim() || server.id
}

function DatacenterIdentityPanel({
  displayName,
  description,
  canManage,
  pending,
  onDisplayNameChange,
  onDescriptionChange,
  onSave,
}: Readonly<{
  displayName: string
  description: string
  canManage: boolean
  pending: boolean
  onDisplayNameChange: (value: string) => void
  onDescriptionChange: (value: string) => void
  onSave: () => void
}>) {
  if (!canManage) return null

  return (
    <SectionPanel title="Datacenter">
      <View style={styles.identityField}>
        <Text style={styles.fieldLabel}>Display name</Text>
        <TextInput
          value={displayName}
          onChangeText={onDisplayNameChange}
          placeholder="e.g. AMS-1"
          placeholderTextColor={colors.textDim}
          style={styles.identityInput}
          editable={!pending}
          accessibilityLabel="Datacenter display name"
        />
      </View>
      <View style={styles.identityField}>
        <Text style={styles.fieldLabel}>Description</Text>
        <TextInput
          value={description}
          onChangeText={onDescriptionChange}
          placeholder="Optional notes"
          placeholderTextColor={colors.textDim}
          style={styles.identityInput}
          editable={!pending}
          accessibilityLabel="Datacenter description"
        />
      </View>
      <Pressable
        disabled={pending}
        onPress={onSave}
        style={[
          orgPanelStyles.toolbarBtnPrimary,
          pending && styles.buttonDisabled,
          webPointer,
        ]}
        accessibilityRole="button"
        accessibilityLabel="Save datacenter"
        accessibilityState={{ disabled: pending, busy: pending }}
      >
        <Text style={orgPanelStyles.toolbarBtnTextPrimary}>Save</Text>
      </Pressable>
    </SectionPanel>
  )
}

function PrivateNetworkPanel({
  cidrs,
  loading,
}: Readonly<{
  cidrs: readonly string[]
  loading: boolean
}>) {
  const cidr = cidrs[0]?.trim() || null

  return (
    <SectionPanel title="Private network">
      {loading && !cidr ? (
        <Text style={orgPanelStyles.muted}>Loading…</Text>
      ) : null}
      {!loading && !cidr ? (
        <View style={orgPanelStyles.calloutWarning}>
          <Text style={orgPanelStyles.calloutWarningText}>
            No CIDR detected. Recreate from a server IP.
          </Text>
        </View>
      ) : null}
      {cidr ? (
        <Text style={styles.mono} selectable>
          {cidr}
        </Text>
      ) : null}
    </SectionPanel>
  )
}

function uniqueAddressesInCidrs(
  server: OrgServerRecord | undefined,
  siteCidrs: readonly string[],
): string[] {
  if (!server) return []
  return [
    ...new Set(
      siteCidrs.flatMap((cidr) =>
        addressesInCidr(reportedPrivateAddresses(server), cidr),
      ),
    ),
  ]
}

function MemberServersPanel({
  memberServers,
  candidateServers,
  siteCidrs,
  privateAddressByServerId,
  canManage,
  pending,
  assignServerId,
  assignAddress,
  onSelectAssign,
  onSelectAddress,
  onAssign,
  onUnassign,
}: Readonly<{
  memberServers: OrgServerRecord[]
  candidateServers: OrgServerRecord[]
  siteCidrs: readonly string[]
  privateAddressByServerId: Map<string, string>
  canManage: boolean
  pending: boolean
  assignServerId: string
  assignAddress: string
  onSelectAssign: (id: string) => void
  onSelectAddress: (address: string) => void
  onAssign: () => void
  onUnassign: (serverId: string) => void
}>) {
  const selectedCandidate = candidateServers.find(
    (server) => server.id === assignServerId,
  )
  const uniqueCandidateAddresses = uniqueAddressesInCidrs(
    selectedCandidate,
    siteCidrs,
  )
  const serverOptions = candidateServers.map((server) => ({
    value: server.id,
    label: serverTitle(server),
  }))
  const addressOptions = uniqueCandidateAddresses.map((address) => ({
    value: address,
    label: address,
  }))

  const selectAssignServer = (serverId: string) => {
    onSelectAssign(serverId)
    const next = candidateServers.find((server) => server.id === serverId)
    const addresses = uniqueAddressesInCidrs(next, siteCidrs)
    if (addresses.length === 1 && addresses[0]) {
      onSelectAddress(addresses[0])
    }
  }

  return (
    <SectionPanel
      title="Member servers"
      hint={`${memberServers.length} pinned`}
    >
      {memberServers.length === 0 ? (
        <Text style={orgPanelStyles.muted}>None yet.</Text>
      ) : (
        <View style={styles.list}>
          {memberServers.map((server) => {
            const privateAddress = privateAddressByServerId.get(server.id)
            return (
              <View key={server.id} style={orgPanelStyles.detailCard}>
                <Text style={orgPanelStyles.detailTitle}>
                  {serverTitle(server)}
                </Text>
                <Text style={orgPanelStyles.detailLine}>
                  <Text style={orgPanelStyles.detailLabel}>Status: </Text>
                  {serverConnectionStatusLabel(
                    resolveServerConnectionStatus(server),
                  )}
                </Text>
                {privateAddress ? (
                  <Text style={orgPanelStyles.detailLine}>
                    <Text style={orgPanelStyles.detailLabel}>
                      Private address:{' '}
                    </Text>
                    <Text style={styles.mono} selectable>
                      {privateAddress}
                    </Text>
                  </Text>
                ) : (
                  <Text style={orgPanelStyles.muted}>No private address</Text>
                )}
                {canManage ? (
                  <Pressable
                    style={[
                      orgPanelStyles.toolbarBtnSecondary,
                      pending && styles.buttonDisabled,
                      webPointer,
                    ]}
                    disabled={pending}
                    onPress={() => onUnassign(server.id)}
                  >
                    <Text style={orgPanelStyles.toolbarBtnTextSecondary}>
                      Unassign
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            )
          })}
        </View>
      )}

      {canManage ? (
        <View style={styles.assignBlock}>
          {siteCidrs.length === 0 ? (
            <Text style={orgPanelStyles.muted}>
              Detect a CIDR before adding servers.
            </Text>
          ) : null}
          {siteCidrs.length > 0 && candidateServers.length === 0 ? (
            <Text style={orgPanelStyles.muted}>
              No other servers in {siteCidrs.join(', ')}.
            </Text>
          ) : null}
          {siteCidrs.length > 0 && candidateServers.length > 0 ? (
            <>
              <View style={styles.identityField}>
                <Text style={styles.fieldLabel}>Server</Text>
                <FormSelect
                  value={assignServerId}
                  options={serverOptions}
                  placeholder="Select a server…"
                  disabled={pending}
                  accessibilityLabel="Add server"
                  onChange={selectAssignServer}
                />
              </View>
              {assignServerId ? (
                <View style={styles.identityField}>
                  <Text style={styles.fieldLabel}>Private IP</Text>
                  <FormSelect
                    value={assignAddress}
                    options={addressOptions}
                    placeholder="Select an IP…"
                    disabled={pending}
                    accessibilityLabel="Private IP"
                    mono
                    onChange={onSelectAddress}
                  />
                </View>
              ) : null}
              <Pressable
                style={[
                  orgPanelStyles.toolbarBtnPrimary,
                  (!assignServerId || !assignAddress || pending) &&
                    styles.buttonDisabled,
                  webPointer,
                ]}
                disabled={!assignServerId || !assignAddress || pending}
                onPress={onAssign}
              >
                <Text style={orgPanelStyles.toolbarBtnTextPrimary}>Add</Text>
              </Pressable>
            </>
          ) : null}
        </View>
      ) : null}
    </SectionPanel>
  )
}

type MeshFromDatacenterRow = {
  serverId: string
  serverLabel: string
  role: RelayRole
  address: string
  isPrimary: boolean
  otherDatacenterLabel: string
}

function resolvePrivateCidrs(
  datacenter: DatacenterRecord | undefined,
): string[] {
  const cidrs = datacenter?.privateCidrs ?? []
  return cidrs
    .map((cidr) => cidr.trim())
    .filter((cidr) => cidr.length > 0)
    .sort((a, b) => a.localeCompare(b))
}

function resolveOtherDatacenterLabel(
  mesh: ReturnType<typeof resolveSiteLinks>,
  datacenterId: string,
  nameById: ReadonlyMap<string, string>,
): string {
  const otherIds = mesh.datacenterIds.filter((id) => id !== datacenterId)
  if (otherIds.length === 0 && mesh.hasUnassignedPeers) {
    return 'Unassigned hosts'
  }
  if (otherIds.length === 0) return '—'
  return formatSiteLinkLabel(
    {
      datacenterIds: otherIds,
      hasUnassignedPeers: mesh.hasUnassignedPeers,
    },
    nameById,
  )
}

function buildMeshRows({
  relays,
  servers,
  datacenterId,
  mesh,
  nameById,
  primaryGatewayByDatacenter,
}: Readonly<{
  relays: readonly RelayRecord[]
  servers: readonly OrgServerRecord[]
  datacenterId: string
  mesh: ReturnType<typeof resolveSiteLinks>
  nameById: ReadonlyMap<string, string>
  primaryGatewayByDatacenter: ReadonlyMap<string, string>
}>): MeshFromDatacenterRow[] {
  const rows: MeshFromDatacenterRow[] = []
  for (const relay of relays) {
    const server = servers.find(
      (row) =>
        row.id === relay.serverId &&
        serverIsDatacenterMember(row, datacenterId),
    )
    if (!server) continue
    rows.push({
      serverId: relay.serverId,
      serverLabel: serverTitle(server),
      role: relay.role,
      address: relay.address,
      isPrimary: primaryGatewayByDatacenter.get(datacenterId) === relay.serverId,
      otherDatacenterLabel: resolveOtherDatacenterLabel(
        mesh,
        datacenterId,
        nameById,
      ),
    })
  }
  rows.sort((a, b) => a.serverLabel.localeCompare(b.serverLabel))
  return rows
}

function datacenterLoadError(
  isError: boolean,
  error: unknown,
): string | null {
  if (!isError) return null
  if (error instanceof Error) return error.message
  return 'Failed to load datacenter'
}

function mutationErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error) return err.message
  return fallback
}

function deleteDatacenterErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    if (error.message.includes(DATACENTER_HAS_MEMBERS_ERROR)) {
      return 'Unassign every server from this datacenter before deleting it.'
    }
    if (error.message.includes(DATACENTER_HAS_NETWORKS_ERROR)) {
      return 'This datacenter still has extra networks. Remove those first.'
    }
    return error.message
  }
  return 'Failed to delete datacenter'
}

function MeshFromDatacenterPanel({
  orgId,
  rows,
  siteCidrs,
  loading,
  canManage,
}: Readonly<{
  orgId: string
  rows: MeshFromDatacenterRow[]
  siteCidrs: string[]
  loading: boolean
  canManage: boolean
}>) {
  const router = useRouter()
  const hasGateway = rows.some((row) => row.role === 'gateway')
  const missingCidr = hasGateway && siteCidrs.length === 0

  return (
    <SectionPanel
      title={TURBOFABRIC_PRODUCT_NAME}
      hint={`${rows.length} relays`}
    >
      {!canManage ? (
        <Text style={orgPanelStyles.muted}>
          Manage permission required.
        </Text>
      ) : null}
      {canManage && loading && rows.length === 0 ? (
        <Text style={orgPanelStyles.muted}>Loading mesh…</Text>
      ) : null}
      {canManage && !loading && rows.length === 0 ? (
        <Text style={orgPanelStyles.muted}>No relays here.</Text>
      ) : null}

      {canManage && missingCidr ? (
        <View style={orgPanelStyles.calloutWarning}>
          <Text style={orgPanelStyles.calloutWarningText}>
            Gateway has no CIDR — apply will fail until a prefix is detected.
          </Text>
        </View>
      ) : null}

      {canManage && rows.length > 0 ? (
        <View style={styles.list}>
          {rows.map((row) => (
            <Pressable
              key={row.serverId}
              style={[orgPanelStyles.detailCard, webPointer]}
              onPress={() => router.push(networkFabricHref(orgId) as Href)}
            >
              <View style={styles.gatewayTitleRow}>
                <Text style={orgPanelStyles.detailTitle}>{row.serverLabel}</Text>
                {row.isPrimary ? (
                  <Text style={styles.primaryBadge}>Primary</Text>
                ) : null}
              </View>
              <Text style={orgPanelStyles.detailLine}>
                <Text style={orgPanelStyles.detailLabel}>Role: </Text>
                {relayRoleLabel(row.role)}
              </Text>
              <Text style={orgPanelStyles.detailLine}>
                <Text style={orgPanelStyles.detailLabel}>
                  Other datacenters:{' '}
                </Text>
                {row.otherDatacenterLabel}
              </Text>
              <Text style={orgPanelStyles.detailLine}>
                <Text style={orgPanelStyles.detailLabel}>tp0: </Text>
                {row.address}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </SectionPanel>
  )
}

function DatacenterTimezonePanel({
  datacenter,
  timezoneOptions,
  effectiveTimezone,
  enforce,
  readOnly,
  pending,
  onTimezoneChange,
  onEnforceToggle,
  onSave,
}: Readonly<{
  datacenter: DatacenterRecord | undefined
  timezoneOptions: string[]
  effectiveTimezone: string | null
  enforce: boolean
  readOnly: boolean
  pending: boolean
  onTimezoneChange: (tz: string | null) => void
  onEnforceToggle: () => void
  onSave: () => void
}>) {
  return (
    <SectionPanel title="Timezone">
      <ServerTimezonePicker
        value={effectiveTimezone}
        options={timezoneOptions}
        disabled={readOnly || pending || !datacenter}
        placeholder="Select timezone…"
        noneLabel="Inherit org default"
        onChange={onTimezoneChange}
      />
      <View style={styles.switchRow}>
        <View style={styles.switchCopy}>
          <Text style={styles.switchLabel}>Enforce on members</Text>
        </View>
        <Pressable
          accessibilityRole="switch"
          accessibilityState={{
            checked: enforce,
            disabled: readOnly || pending || !datacenter,
          }}
          disabled={readOnly || pending || !datacenter}
          onPress={onEnforceToggle}
          style={[
            styles.toggle,
            enforce ? styles.toggleOn : styles.toggleOff,
            (readOnly || pending) && styles.buttonDisabled,
          ]}
        >
          <Text style={styles.toggleText}>{enforce ? 'On' : 'Off'}</Text>
        </Pressable>
      </View>
      {readOnly ? (
        <Text style={orgPanelStyles.muted}>Manage permission required.</Text>
      ) : (
        <Pressable
          disabled={pending || !datacenter}
          onPress={onSave}
          style={[
            orgPanelStyles.toolbarBtnPrimary,
            (pending || !datacenter) && styles.buttonDisabled,
            webPointer,
          ]}
        >
          <Text style={orgPanelStyles.toolbarBtnTextPrimary}>
            Save
          </Text>
        </Pressable>
      )}
    </SectionPanel>
  )
}

function DatacenterDeletePanel({
  memberCount,
  canManage,
  deleting,
  confirming,
  onRequestConfirm,
  onCancel,
  onConfirm,
}: Readonly<{
  memberCount: number
  canManage: boolean
  deleting: boolean
  confirming: boolean
  onRequestConfirm: () => void
  onCancel: () => void
  onConfirm: () => void
}>) {
  if (!canManage) return null

  const blocked = memberCount > 0

  return (
    <SectionPanel title="Delete">
      {blocked ? (
        <Text style={orgPanelStyles.muted}>
          Unassign every server first.
        </Text>
      ) : (
        <Text style={orgPanelStyles.muted}>
          Permanently remove this empty datacenter.
        </Text>
      )}
      {deleting ? (
        <View style={styles.inlineRow}>
          <ActivityIndicator size="small" color={colors.textMuted} />
          <Text style={orgPanelStyles.muted}>Deleting…</Text>
        </View>
      ) : null}
      {!deleting && confirming && !blocked ? (
        <View style={styles.actionsRow}>
          <Pressable
            style={[orgPanelStyles.toolbarBtnPrimary, webPointer]}
            onPress={onConfirm}
          >
            <Text style={orgPanelStyles.toolbarBtnTextPrimary}>
              Confirm delete
            </Text>
          </Pressable>
          <Pressable
            style={[orgPanelStyles.toolbarBtnSecondary, webPointer]}
            onPress={onCancel}
          >
            <Text style={orgPanelStyles.toolbarBtnTextSecondary}>Cancel</Text>
          </Pressable>
        </View>
      ) : null}
      {!deleting && !confirming ? (
        <Pressable
          style={[
            orgPanelStyles.toolbarBtnSecondary,
            blocked && styles.buttonDisabled,
            webPointer,
          ]}
          disabled={blocked}
          onPress={onRequestConfirm}
        >
          <Text style={orgPanelStyles.toolbarBtnTextSecondary}>
            Delete datacenter
          </Text>
        </Pressable>
      ) : null}
    </SectionPanel>
  )
}

export function DatacenterDetailSection({
  orgId,
  datacenterId,
}: Readonly<{
  orgId: string
  datacenterId: string
}>) {
  const router = useRouter()
  const canManage = useCan('organization', orgId, 'organization:manage')
  const [error, setError] = useState<string | null>(null)
  const [assignServerId, setAssignServerId] = useState('')
  const [assignAddress, setAssignAddress] = useState('')
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [draftName, setDraftName] = useState<string | null>(null)
  const [draftDescription, setDraftDescription] = useState<string | null>(null)
  const [draftTimezone, setDraftTimezone] = useState<string | null | undefined>(
    undefined,
  )
  const [draftEnforce, setDraftEnforce] = useState<boolean | null>(null)

  const datacenterQuery = useDatacenter(orgId, datacenterId, {
    enabled: Boolean(datacenterId),
  })
  const serversQuery = useOrgServers(orgId)
  const privateIpsQuery = useIps(
    orgId,
    { scope: 'datacenter' },
    { enabled: Boolean(datacenterId) },
  )
  const timezonesQuery = useTimezones()
  const fabricQuery = useOrgFabric(orgId, { enabled: canManage })
  const datacentersQuery = useDatacenters(orgId)

  const relays = fabricQuery.data?.relays ?? []
  const allDatacenters = datacentersQuery.data?.datacenters ?? []

  const addMembersMutation = useAddDatacenterMembers(orgId, datacenterId)
  const removeMemberMutation = useRemoveDatacenterMember(orgId, datacenterId)
  const updateMutation = useUpdateDatacenter(orgId, datacenterId)
  const deleteMutation = useDeleteDatacenter(orgId)

  const datacenter = datacenterQuery.data?.datacenter
  const servers = serversQuery.data?.servers ?? []
  const memberServers = servers.filter((server) =>
    serverIsDatacenterMember(server, datacenterId),
  )
  const siteCidrs = resolvePrivateCidrs(datacenter)

  const candidateServers = useMemo(() => {
    if (siteCidrs.length === 0) return []
    return listServersWithAddressInCidrs(
      servers.filter(
        (server) => !serverIsDatacenterMember(server, datacenterId),
      ),
      siteCidrs,
    ).sort((a, b) => serverTitle(a).localeCompare(serverTitle(b)))
  }, [servers, siteCidrs, datacenterId])

  const privateAddressByServerId = useMemo(() => {
    const map = new Map<string, string>()
    const memberIds = new Set(memberServers.map((server) => server.id))
    for (const ip of privateIpsQuery.data?.ips ?? []) {
      if (!ip.serverId || !memberIds.has(ip.serverId)) continue
      if (!map.has(ip.serverId)) {
        map.set(ip.serverId, ip.address)
      }
    }
    return map
  }, [privateIpsQuery.data?.ips, memberServers])

  const serverById = new Map(
    servers.map((server) => [
      server.id,
      {
        connected: server.connected,
        datacenters: server.datacenters ?? [],
      },
    ]),
  )
  const nameById = useMemo(() => {
    const map = new Map(
      allDatacenters.map((dc) => [dc.id, dc.displayName?.trim() || dc.id]),
    )
    if (datacenter) {
      map.set(datacenterId, datacenter.displayName?.trim() || datacenterId)
    }
    return map
  }, [allDatacenters, datacenter, datacenterId])

  const mesh = resolveSiteLinks(relays, serverById)
  const primaryGatewayByDatacenter = resolvePrimaryGatewayByDatacenter(
    relays,
    serverById,
  )
  const meshRows = buildMeshRows({
    relays,
    servers,
    datacenterId,
    mesh,
    nameById,
    primaryGatewayByDatacenter,
  })

  let effectiveTimezone = datacenter?.options?.defaultServerTimezone ?? null
  if (draftTimezone !== undefined) {
    effectiveTimezone = draftTimezone
  }
  const enforce =
    draftEnforce ?? (datacenter?.options?.enforceServerTimezone ?? false)
  const identityName = draftName ?? datacenter?.displayName ?? ''
  const identityDescription = draftDescription ?? datacenter?.description ?? ''
  const pending =
    updateMutation.isPending ||
    addMembersMutation.isPending ||
    removeMemberMutation.isPending
  const readOnly = !canManage

  const queryError = datacenterLoadError(
    datacenterQuery.isError,
    datacenterQuery.error,
  )
  const displayError =
    error ??
    addMembersMutation.actionError ??
    removeMemberMutation.actionError ??
    updateMutation.actionError ??
    deleteMutation.actionError ??
    queryError

  const title =
    datacenter?.displayName?.trim() ||
    (datacenterQuery.isLoading ? 'Datacenter' : 'Unnamed datacenter')

  return (
    <View style={styles.root}>
      <Text style={orgPanelStyles.pageTitle}>{title}</Text>
      {datacenter?.description?.trim() ? (
        <Text style={orgPanelStyles.pageCopy}>
          {datacenter.description.trim()}
        </Text>
      ) : null}

      {displayError ? (
        <Text style={orgPanelStyles.error}>{displayError}</Text>
      ) : null}

      <DatacenterIdentityPanel
        displayName={identityName}
        description={identityDescription}
        canManage={canManage}
        pending={pending}
        onDisplayNameChange={setDraftName}
        onDescriptionChange={setDraftDescription}
        onSave={() => {
          setError(null)
          updateMutation.mutate(
            {
              displayName: identityName.trim() || null,
              description: identityDescription.trim() || null,
            },
            {
              onSuccess: () => {
                setDraftName(null)
                setDraftDescription(null)
              },
              onError: (err) => {
                setError(
                  mutationErrorMessage(err, 'Failed to save datacenter'),
                )
              },
            },
          )
        }}
      />

      <PrivateNetworkPanel
        cidrs={siteCidrs}
        loading={datacenterQuery.isLoading}
      />

      <MemberServersPanel
        memberServers={memberServers}
        candidateServers={candidateServers}
        siteCidrs={siteCidrs}
        privateAddressByServerId={privateAddressByServerId}
        canManage={canManage}
        pending={pending}
        assignServerId={assignServerId}
        assignAddress={assignAddress}
        onSelectAssign={(id) => {
          setAssignServerId(id)
          setAssignAddress('')
        }}
        onSelectAddress={setAssignAddress}
        onAssign={() => {
          if (!assignServerId || !assignAddress) return
          setError(null)
          addMembersMutation.mutate(
            [{ serverId: assignServerId, address: assignAddress }],
            {
              onSuccess: () => {
                setAssignServerId('')
                setAssignAddress('')
              },
              onError: (err) => {
                setError(mutationErrorMessage(err, 'Failed to assign server'))
              },
            },
          )
        }}
        onUnassign={(serverId) => {
          setError(null)
          removeMemberMutation.mutate(serverId, {
            onError: (err) => {
              setError(mutationErrorMessage(err, 'Failed to unassign server'))
            },
          })
        }}
      />

      <MeshFromDatacenterPanel
        orgId={orgId}
        rows={meshRows}
        siteCidrs={siteCidrs}
        loading={fabricQuery.isLoading}
        canManage={canManage}
      />

      <DatacenterTimezonePanel
        datacenter={datacenter}
        timezoneOptions={timezonesQuery.data?.timezones ?? []}
        effectiveTimezone={effectiveTimezone}
        enforce={enforce}
        readOnly={readOnly}
        pending={pending}
        onTimezoneChange={setDraftTimezone}
        onEnforceToggle={() => setDraftEnforce(!enforce)}
        onSave={() => {
          setError(null)
          updateMutation.mutate(
            {
              options: {
                defaultServerTimezone: effectiveTimezone,
                enforceServerTimezone: enforce,
              },
            },
            {
              onSuccess: () => {
                setDraftTimezone(undefined)
                setDraftEnforce(null)
              },
              onError: (err) => {
                setError(
                  mutationErrorMessage(err, 'Failed to save datacenter timezone'),
                )
              },
            },
          )
        }}
      />

      <DatacenterDeletePanel
        memberCount={memberServers.length}
        canManage={canManage}
        deleting={deleteMutation.isPending}
        confirming={confirmingDelete}
        onRequestConfirm={() => setConfirmingDelete(true)}
        onCancel={() => setConfirmingDelete(false)}
        onConfirm={() => {
          setError(null)
          deleteMutation.mutate(datacenterId, {
            onSuccess: () => {
              router.replace(serversDatacentersHref(orgId) as Href)
            },
            onError: (err) => {
              setConfirmingDelete(false)
              setError(deleteDatacenterErrorMessage(err))
            },
          })
        }}
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
  gatewayTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  primaryBadge: {
    color: chrome.accent,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  assignBlock: {
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  fieldLabel: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
  identityField: {
    gap: spacing.xs,
  },
  identityInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 6,
    backgroundColor: colors.bgInput,
    color: colors.text,
    fontSize: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 44,
  },
  mono: {
    fontFamily: 'monospace',
    color: colors.textBody,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md,
    marginTop: spacing.md,
    marginBottom: spacing.md,
  },
  switchCopy: {
    flex: 1,
    gap: spacing.xs,
  },
  switchLabel: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  toggle: {
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    minHeight: 44,
    justifyContent: 'center',
  },
  toggleOn: {
    borderColor: chrome.accent,
    backgroundColor: chrome.bgActive,
  },
  toggleOff: {
    borderColor: colors.borderChip,
    backgroundColor: colors.bgSecondary,
  },
  toggleText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '600',
  },
  actionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  inlineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
})
