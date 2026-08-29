import { useRouter, type Href } from 'expo-router'
import { useMemo, useState, type ReactNode } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { HeaderChevron } from '@/components/header-chevron'
import { AddressFamilyBadge } from '@/components/org/address-family-badge'
import { FormSelect } from '@/components/org/form-select'
import { panelStyles } from '@/components/ui/panel-styles'
import { ServerTimezonePicker } from '@/components/org/server-timezone-picker'
import {
  Button,
  ButtonRow,
  ConfirmButton,
  EmptyState,
  FormField,
  LoadingState,
  SectionPanel,
  SegmentedControl,
  SettingRow,
  TextField,
  Toggle,
} from '@/components/ui'
import type {
  DatacenterAddressPreference,
  DatacenterDetailRecord,
  DatacenterMemberPin,
  DatacenterRecord,
  DatacenterSubnetRecord,
  NtpDefaults,
  OrgServerRecord,
  RelayRecord,
  RelayRole,
} from '@/lib/instance-api'
import {
  ADDRESS_IN_USE_ERROR,
  ADDRESS_NOT_IN_ANY_SUBNET_ERROR,
  DATACENTER_HAS_MEMBERS_ERROR,
  DATACENTER_HAS_NETWORKS_ERROR,
  INVALID_CIDR_ERROR,
  SUBNET_HAS_MEMBERS_ERROR,
  SUBNET_OVERLAPS_ERROR,
} from '@/lib/instance-api'
import {
  useAddDatacenterMembers,
  useCreateDatacenterSubnet,
  useDatacenter,
  useDatacenters,
  useDeleteDatacenter,
  useDeleteDatacenterSubnet,
  useRemoveDatacenterMember,
  useUpdateDatacenter,
  useUpdateDatacenterSubnet,
} from '@/lib/queries/topology'
import { useOrgFabric } from '@/lib/queries/fabric'
import { useOrgServers, useTimezones } from '@/lib/queries/servers'
import {
  networkFabricHref,
  serversDatacentersHref,
} from '@/lib/org-navigation'
import { orEmptyArray } from '@/lib/or-empty-array'
import { useCan } from '@/lib/query-client'
import {
  serverConnectionStatusLabel,
  resolveServerConnectionStatus,
} from '@/lib/server-connection-status'
import { chrome, colors, spacing, webPointer } from '@/lib/theme'
import {
  addressFamilyLabel,
  cidrsOverlap,
  isValidCidr,
  normalizeCidr,
} from '@/lib/cidr'
import {
  candidateMemberNetworks,
  formatDatacenterServerCount,
  listServersWithCandidateAddresses,
  memberAssignEmptyCopy,
  mergeDatacenterOptions,
  serverIsDatacenterMember,
  sortDatacenterSubnets,
  subnetForAddress,
} from '@/lib/datacenter-list'
import {
  fabricRoutedViaLabels,
  formatSiteLinkLabel,
  relayRoleLabel,
  resolvePrimaryGatewayByDatacenter,
  resolveSiteLinks,
} from '@/lib/fabric-mesh'
import {
  DEFAULT_SSH_PORT,
  formatNtpHostList,
  isEmptyNtpDraft,
  ntpDefaultsFromDrafts,
  parseSshPortDraft,
} from '@/lib/host-defaults'
import { TURBOFABRIC_PRODUCT_NAME } from '@/lib/platform-copy'

function serverTitle(server: OrgServerRecord): string {
  return server.name?.trim() || server.hostname?.trim() || server.id
}

function mutationErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error) return err.message
  return fallback
}

function errorIncludes(err: unknown, code: string): boolean {
  return err instanceof Error && err.message.includes(code)
}

/** Compact summary row that expands its detail in place. */
function ExpandToggle({
  expanded,
  accessibilityLabel,
  onPress,
  children,
}: Readonly<{
  expanded: boolean
  accessibilityLabel: string
  onPress: () => void
  children: ReactNode
}>) {
  return (
    <Pressable
      style={[styles.summaryRow, webPointer]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ expanded }}
      accessibilityLabel={accessibilityLabel}
    >
      <View style={styles.summaryCopy}>{children}</View>
      <HeaderChevron size={12} color={colors.textMuted} open={expanded} />
    </Pressable>
  )
}

function DatacenterIdentityPanel({
  name,
  description,
  canManage,
  pending,
  onDisplayNameChange,
  onDescriptionChange,
  onSave,
}: Readonly<{
  name: string
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
      <TextField
        label="Display name"
        value={name}
        onChangeText={onDisplayNameChange}
        placeholder="e.g. AMS-1"
        editable={!pending}
        accessibilityLabel="Datacenter display name"
      />
      <TextField
        label="Description"
        value={description}
        onChangeText={onDescriptionChange}
        placeholder="Optional notes"
        editable={!pending}
        accessibilityLabel="Datacenter description"
      />
      <Button
        label="Save"
        variant="primary"
        busy={pending}
        onPress={onSave}
        accessibilityLabel="Save datacenter"
      />
    </SectionPanel>
  )
}

function subnetCreateErrorMessage(error: unknown): string {
  if (errorIncludes(error, INVALID_CIDR_ERROR)) {
    return 'Enter a valid IPv4 or IPv6 CIDR.'
  }
  if (errorIncludes(error, SUBNET_OVERLAPS_ERROR)) {
    return 'That range overlaps an existing subnet in this organization.'
  }
  return mutationErrorMessage(error, 'Failed to add subnet')
}

function subnetDeleteErrorMessage(error: unknown): string {
  if (errorIncludes(error, SUBNET_HAS_MEMBERS_ERROR)) {
    return 'Unassign the pinned servers first.'
  }
  return mutationErrorMessage(error, 'Failed to delete subnet')
}

function SubnetLabelField({
  cidr,
  label,
  pending,
  onDraftLabelChange,
  onSaveLabel,
}: Readonly<{
  cidr: string
  label: string
  pending: boolean
  onDraftLabelChange: (value: string) => void
  onSaveLabel: () => void
}>) {
  return (
    <View style={styles.labelField}>
      <TextField
        label="Label"
        value={label}
        onChangeText={onDraftLabelChange}
        placeholder="Optional"
        editable={!pending}
        accessibilityLabel={`Subnet label for ${cidr}`}
      />
      <Button
        label="Save label"
        disabled={pending}
        onPress={onSaveLabel}
        accessibilityLabel={`Save subnet label for ${cidr}`}
      />
    </View>
  )
}

function SubnetLabelReadout({ name }: Readonly<{ name: string | null }>) {
  const shown = name?.trim()
  if (!shown) return null
  return (
    <Text style={panelStyles.detailLine}>
      <Text style={panelStyles.detailLabel}>Label: </Text>
      {shown}
    </Text>
  )
}

function SubnetCard({
  subnet,
  canManage,
  pending,
  onDraftLabelChange,
  onSaveLabel,
  onDelete,
}: Readonly<{
  subnet: DatacenterSubnetRecord
  canManage: boolean
  pending: boolean
  onDraftLabelChange: (value: string) => void
  onSaveLabel: () => void
  onDelete: () => void
}>) {
  const [expanded, setExpanded] = useState(false)
  const family = subnet.version === 6 ? 'IPv6' : 'IPv4'
  const blocked = subnet.memberCount > 0
  const label = subnet.name ?? ''

  return (
    <View style={panelStyles.detailCard}>
      <ExpandToggle
        expanded={expanded}
        accessibilityLabel={
          expanded
            ? `Collapse subnet ${subnet.cidr}`
            : `Expand subnet ${subnet.cidr}`
        }
        onPress={() => setExpanded((prev) => !prev)}
      >
        <View style={styles.subnetTitleRow}>
          <Text style={styles.mono} selectable>
            {subnet.cidr}
          </Text>
          <AddressFamilyBadge family={family} />
        </View>
        <Text style={panelStyles.detailLine}>
          <Text style={panelStyles.detailLabel}>Servers: </Text>
          {formatDatacenterServerCount(subnet.memberCount)}
        </Text>
        {!expanded ? <SubnetLabelReadout name={subnet.name} /> : null}
      </ExpandToggle>
      {expanded ? (
        <>
          {canManage ? (
            <SubnetLabelField
              cidr={subnet.cidr}
              label={label}
              pending={pending}
              onDraftLabelChange={onDraftLabelChange}
              onSaveLabel={onSaveLabel}
            />
          ) : (
            <SubnetLabelReadout name={subnet.name} />
          )}
          {canManage && blocked ? (
            <Text style={panelStyles.muted}>
              Unassign the pinned servers first.
            </Text>
          ) : null}
          {canManage ? (
            <ConfirmButton
              label="Delete subnet"
              confirmLabel="Confirm delete"
              prompt={`Delete subnet ${subnet.cidr}?`}
              disabled={blocked || pending}
              onConfirm={onDelete}
            />
          ) : null}
        </>
      ) : null}
    </View>
  )
}

function subnetPanelHint(count: number): string {
  if (count === 1) return '1 subnet'
  return `${count} subnets`
}

function SubnetsPanel({
  subnets,
  loading,
  canManage,
  pending,
  addCidr,
  addLabel,
  onAddCidrChange,
  onAddLabelChange,
  onAdd,
  onDraftLabelChange,
  onSaveLabel,
  onDeleteSubnet,
}: Readonly<{
  subnets: readonly DatacenterSubnetRecord[]
  loading: boolean
  canManage: boolean
  pending: boolean
  addCidr: string
  addLabel: string
  onAddCidrChange: (value: string) => void
  onAddLabelChange: (value: string) => void
  onAdd: () => void
  onDraftLabelChange: (networkId: string, value: string) => void
  onSaveLabel: (networkId: string) => void
  onDeleteSubnet: (networkId: string) => void
}>) {
  const sorted = sortDatacenterSubnets(subnets)
  const normalizedAdd = normalizeCidr(addCidr)
  const addDisabled = pending || !normalizedAdd

  return (
    <SectionPanel title="Subnets" hint={subnetPanelHint(sorted.length)}>
      {loading && sorted.length === 0 ? <LoadingState label="Loading…" /> : null}
      {!loading && sorted.length === 0 ? (
        <EmptyState title="No subnets yet — add one." panel />
      ) : null}
      {sorted.length > 0 ? (
        <View style={styles.list}>
          {sorted.map((subnet) => (
            <SubnetCard
              key={subnet.id}
              subnet={subnet}
              canManage={canManage}
              pending={pending}
              onDraftLabelChange={(value) =>
                onDraftLabelChange(subnet.id, value)
              }
              onSaveLabel={() => onSaveLabel(subnet.id)}
              onDelete={() => onDeleteSubnet(subnet.id)}
            />
          ))}
        </View>
      ) : null}

      {canManage ? (
        <View style={styles.assignBlock}>
          <TextField
            label="CIDR"
            value={addCidr}
            onChangeText={onAddCidrChange}
            placeholder="203.0.113.0/24"
            hint={
              normalizedAdd && normalizedAdd !== addCidr.trim()
                ? normalizedAdd
                : undefined
            }
            editable={!pending}
            accessibilityLabel="New subnet CIDR"
            autoCapitalize="none"
            autoCorrect={false}
            mono
          />
          <TextField
            label="Label"
            value={addLabel}
            onChangeText={onAddLabelChange}
            placeholder="Optional"
            editable={!pending}
            accessibilityLabel="New subnet label"
          />
          <Button
            label="Add subnet"
            variant="primary"
            disabled={addDisabled}
            busy={pending}
            onPress={onAdd}
            accessibilityLabel="Add subnet"
          />
        </View>
      ) : null}
    </SectionPanel>
  )
}

function AddressPreferencePanel({
  preference,
  canManage,
  pending,
  loaded,
  onChange,
  onSave,
}: Readonly<{
  preference: DatacenterAddressPreference
  canManage: boolean
  pending: boolean
  loaded: boolean
  onChange: (value: DatacenterAddressPreference) => void
  onSave: () => void
}>) {
  const controlsDisabled = !canManage || pending || !loaded
  const saveDisabled = pending || !loaded

  return (
    <SectionPanel title="Routing" collapsible defaultCollapsed>
      <Text style={styles.fieldLabel}>Address preference</Text>
      <SegmentedControl
        options={[
          { value: 'ipv6', label: 'Prefer IPv6' },
          { value: 'ipv4', label: 'Prefer IPv4' },
        ]}
        value={preference}
        onChange={onChange}
        disabled={controlsDisabled}
      />
      <Text style={panelStyles.muted}>
        Only applies when both servers have an address in the same datacenter in
        both families.
      </Text>
      {canManage ? (
        <Button
          label="Save"
          variant="primary"
          disabled={saveDisabled}
          busy={pending}
          onPress={onSave}
          accessibilityLabel="Save address preference"
        />
      ) : (
        <Text style={panelStyles.muted}>Manage permission required.</Text>
      )}
    </SectionPanel>
  )
}

function assignMemberErrorMessage(err: unknown): string {
  if (errorIncludes(err, 'address_cidr_unreported')) {
    return 'That server has not reported a private IP.'
  }
  if (errorIncludes(err, 'address_not_reported')) {
    return 'Pick a private IP reported on that server.'
  }
  if (errorIncludes(err, ADDRESS_IN_USE_ERROR)) {
    return 'That address is already pinned.'
  }
  if (errorIncludes(err, SUBNET_OVERLAPS_ERROR)) {
    return 'That range overlaps an existing subnet in this organization.'
  }
  if (errorIncludes(err, ADDRESS_NOT_IN_ANY_SUBNET_ERROR)) {
    return 'That address is not in any subnet of this datacenter.'
  }
  return mutationErrorMessage(err, 'Failed to assign server')
}

function memberPanelHint(pinCount: number, serverCount: number): string {
  return `${pinCount} pins · ${serverCount} servers`
}

function pinUnassignAccessibilityLabel(
  pinCount: number,
  serverLabel: string,
): string {
  if (pinCount > 1) {
    return `Unassign all pins for ${serverLabel} in this datacenter`
  }
  return 'Unassign'
}

function pinUnassignText(pinCount: number): string {
  if (pinCount > 1) return 'Unassign all pins'
  return 'Unassign'
}

function pinSubnetCidr(
  pin: DatacenterMemberPin,
  subnets: readonly DatacenterSubnetRecord[],
): string | null {
  if (pin.networkId) {
    const byId = subnets.find((subnet) => subnet.id === pin.networkId)
    if (byId) return byId.cidr
  }
  return subnetForAddress(subnets, pin.address)?.cidr ?? null
}

function MemberPinCard({
  pin,
  server,
  pinCount,
  subnets,
  canManage,
  pending,
  onUnassign,
}: Readonly<{
  pin: DatacenterMemberPin
  server: OrgServerRecord | undefined
  pinCount: number
  subnets: readonly DatacenterSubnetRecord[]
  canManage: boolean
  pending: boolean
  onUnassign: () => void
}>) {
  const [expanded, setExpanded] = useState(false)
  const serverLabel = server ? serverTitle(server) : pin.serverId
  const unassignLabel = pinUnassignAccessibilityLabel(pinCount, serverLabel)
  const unassignText = pinUnassignText(pinCount)

  return (
    <View style={panelStyles.detailCard}>
      <ExpandToggle
        expanded={expanded}
        accessibilityLabel={
          expanded
            ? `Collapse ${serverLabel} ${pin.address}`
            : `Expand ${serverLabel} ${pin.address}`
        }
        onPress={() => setExpanded((prev) => !prev)}
      >
        <Text style={panelStyles.detailTitle}>{serverLabel}</Text>
        <View style={styles.pinAddressRow}>
          <Text style={styles.mono} selectable>
            {pin.address}
          </Text>
          <AddressFamilyBadge family={addressFamilyLabel(pin.address)} />
        </View>
      </ExpandToggle>
      {expanded ? (
        <>
          {server ? (
            <Text style={panelStyles.detailLine}>
              <Text style={panelStyles.detailLabel}>Status: </Text>
              {serverConnectionStatusLabel(
                resolveServerConnectionStatus(server),
              )}
            </Text>
          ) : null}
          <Text style={panelStyles.detailLine}>
            <Text style={panelStyles.detailLabel}>Subnet: </Text>
            {pinSubnetCidr(pin, subnets) ?? '—'}
          </Text>
          {canManage ? (
            <Button
              label={unassignText}
              disabled={pending}
              onPress={onUnassign}
              accessibilityLabel={unassignLabel}
            />
          ) : null}
        </>
      ) : null}
    </View>
  )
}

function MemberServersPanel({
  pins,
  serversById,
  subnets,
  candidateServers,
  canManage,
  pending,
  assignServerId,
  assignAddress,
  onSelectAssign,
  onSelectAddress,
  onAssign,
  onUnassign,
}: Readonly<{
  pins: readonly DatacenterMemberPin[]
  serversById: ReadonlyMap<string, OrgServerRecord>
  subnets: readonly DatacenterSubnetRecord[]
  candidateServers: OrgServerRecord[]
  canManage: boolean
  pending: boolean
  assignServerId: string
  assignAddress: string
  onSelectAssign: (id: string) => void
  onSelectAddress: (address: string) => void
  onAssign: () => void
  onUnassign: (serverId: string) => void
}>) {
  const pinnedAddresses = pins.map((pin) => pin.address)
  const selectedCandidate = candidateServers.find(
    (server) => server.id === assignServerId,
  )
  const candidateNetworks = selectedCandidate
    ? candidateMemberNetworks(selectedCandidate, pinnedAddresses, subnets)
    : []
  const serverOptions = candidateServers.map((server) => ({
    value: server.id,
    label: serverTitle(server),
  }))
  const addressOptions = candidateNetworks.map((network) => ({
    value: network.address,
    label: network.address,
  }))
  const addressIsCandidate = candidateNetworks.some(
    (network) => network.address === assignAddress,
  )
  const uniqueServerCount = new Set(pins.map((pin) => pin.serverId)).size
  const pinCountByServer = new Map<string, number>()
  for (const pin of pins) {
    pinCountByServer.set(
      pin.serverId,
      (pinCountByServer.get(pin.serverId) ?? 0) + 1,
    )
  }

  const selectAssignServer = (serverId: string) => {
    onSelectAssign(serverId)
    const next = candidateServers.find((server) => server.id === serverId)
    const networks = next
      ? candidateMemberNetworks(next, pinnedAddresses, subnets)
      : []
    if (networks.length === 1 && networks[0]) {
      onSelectAddress(networks[0].address)
    }
  }

  return (
    <SectionPanel
      title="Member servers"
      hint={memberPanelHint(pins.length, uniqueServerCount)}
    >
      {pins.length === 0 ? (
        <EmptyState title="None yet." />
      ) : (
        <View style={styles.list}>
          {pins.map((pin) => (
            <MemberPinCard
              key={pin.ipId}
              pin={pin}
              server={serversById.get(pin.serverId)}
              pinCount={pinCountByServer.get(pin.serverId) ?? 1}
              subnets={subnets}
              canManage={canManage}
              pending={pending}
              onUnassign={() => onUnassign(pin.serverId)}
            />
          ))}
        </View>
      )}

      {canManage ? (
        <View style={styles.assignBlock}>
          {candidateServers.length === 0 ? (
            <Text style={panelStyles.muted}>
              {memberAssignEmptyCopy(subnets.length)}
            </Text>
          ) : (
            <>
              <FormField label="Server">
                <FormSelect
                  value={assignServerId}
                  options={serverOptions}
                  placeholder="Select a server…"
                  disabled={pending}
                  accessibilityLabel="Add server"
                  onChange={selectAssignServer}
                />
              </FormField>
              {assignServerId ? (
                <FormField label="Private IP">
                  <FormSelect
                    value={assignAddress}
                    options={addressOptions}
                    placeholder="Select an IP…"
                    disabled={pending}
                    accessibilityLabel="Private IP"
                    mono
                    onChange={onSelectAddress}
                  />
                </FormField>
              ) : null}
              <Button
                label="Add"
                variant="primary"
                disabled={
                  !assignServerId ||
                  !assignAddress ||
                  !addressIsCandidate ||
                  pending
                }
                onPress={onAssign}
              />
            </>
          )}
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
  viaLabel: string | null
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
  serverNameById,
  primaryGatewayByDatacenter,
}: Readonly<{
  relays: readonly RelayRecord[]
  servers: readonly OrgServerRecord[]
  datacenterId: string
  mesh: ReturnType<typeof resolveSiteLinks>
  nameById: ReadonlyMap<string, string>
  serverNameById: ReadonlyMap<string, string>
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
    const viaLabels = fabricRoutedViaLabels(relay, serverNameById)
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
      viaLabel: viaLabels.length > 0 ? viaLabels.join(', ') : null,
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

function deleteDatacenterErrorMessage(error: unknown): string {
  if (errorIncludes(error, DATACENTER_HAS_MEMBERS_ERROR)) {
    return 'Unassign every server from this datacenter before deleting it.'
  }
  if (errorIncludes(error, DATACENTER_HAS_NETWORKS_ERROR)) {
    return 'This datacenter still has extra networks. Remove those first.'
  }
  return mutationErrorMessage(error, 'Failed to delete datacenter')
}

function MeshFromDatacenterPanel({
  orgId,
  rows,
  subnetCount,
  loading,
  canManage,
}: Readonly<{
  orgId: string
  rows: MeshFromDatacenterRow[]
  subnetCount: number
  loading: boolean
  canManage: boolean
}>) {
  const router = useRouter()
  const hasGateway = rows.some((row) => row.role === 'gateway')
  const missingCidr = hasGateway && subnetCount === 0

  return (
    <SectionPanel
      title={TURBOFABRIC_PRODUCT_NAME}
      hint={`${rows.length} relays`}
    >
      {!canManage ? (
        <Text style={panelStyles.muted}>
          Manage permission required.
        </Text>
      ) : null}
      {canManage && loading && rows.length === 0 ? (
        <LoadingState label="Loading mesh…" />
      ) : null}
      {canManage && !loading && rows.length === 0 ? (
        <EmptyState title="No relays here." />
      ) : null}

      {canManage && missingCidr ? (
        <View style={panelStyles.calloutWarning}>
          <Text style={panelStyles.calloutWarningText}>
            This datacenter has no subnets — apply will fail until a prefix is
            added.
          </Text>
        </View>
      ) : null}

      {canManage && rows.length > 0 ? (
        <View style={styles.list}>
          {rows.map((row) => (
            <Pressable
              key={row.serverId}
              style={[panelStyles.detailCard, webPointer]}
              onPress={() => router.push(networkFabricHref(orgId) as Href)}
            >
              <View style={styles.gatewayTitleRow}>
                <Text style={panelStyles.detailTitle}>{row.serverLabel}</Text>
                {row.isPrimary ? (
                  <Text style={styles.primaryBadge}>Primary</Text>
                ) : null}
              </View>
              <Text style={panelStyles.detailLine}>
                <Text style={panelStyles.detailLabel}>Role: </Text>
                {relayRoleLabel(row.role)}
              </Text>
              <Text style={panelStyles.detailLine}>
                <Text style={panelStyles.detailLabel}>
                  Other datacenters:{' '}
                </Text>
                {row.otherDatacenterLabel}
              </Text>
              {row.viaLabel ? (
                <Text style={panelStyles.detailLine}>
                  <Text style={panelStyles.detailLabel}>Via: </Text>
                  {row.viaLabel}
                </Text>
              ) : null}
              <Text style={panelStyles.detailLine}>
                <Text style={panelStyles.detailLabel}>
                  TurboFabric address:{' '}
                </Text>
                {row.address}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </SectionPanel>
  )
}

function DatacenterSshPortPanel({
  datacenter,
  readOnly,
  pending,
  onSave,
}: Readonly<{
  datacenter: DatacenterRecord | undefined
  readOnly: boolean
  pending: boolean
  onSave: (sshPort: number | null, onSuccess: () => void) => void
}>) {
  const [draft, setDraft] = useState<string | null>(null)
  const [localError, setLocalError] = useState<string | null>(null)
  const sshText =
    draft ??
    (datacenter?.options?.sshPort != null
      ? String(datacenter.options.sshPort)
      : '')

  const save = () => {
    if (sshText.trim().length === 0) {
      setLocalError(null)
      onSave(null, () => setDraft(null))
      return
    }
    const parsed = parseSshPortDraft(sshText)
    if (parsed == null) {
      setLocalError(
        'SSH port must be a whole number from 1 to 65535, or empty to inherit.',
      )
      return
    }
    setLocalError(null)
    onSave(parsed, () => setDraft(null))
  }

  return (
    <SectionPanel
      title="SSH port"
      hint="Inherited by member servers"
      collapsible
      defaultCollapsed
    >
      <TextField
        label="SSH port"
        value={sshText}
        onChangeText={setDraft}
        editable={!readOnly && !pending && Boolean(datacenter)}
        keyboardType="number-pad"
        placeholder={String(DEFAULT_SSH_PORT)}
        error={localError}
        accessibilityLabel="Datacenter SSH port"
      />
      <Text style={panelStyles.muted}>
        Empty inherits the organization default (then {String(DEFAULT_SSH_PORT)}
        ). Saving does not change sshd.
      </Text>
      {readOnly ? (
        <Text style={panelStyles.muted}>Manage permission required.</Text>
      ) : (
        <Button
          label="Save"
          variant="primary"
          disabled={pending || !datacenter}
          busy={pending}
          onPress={save}
        />
      )}
    </SectionPanel>
  )
}

function DatacenterNtpPanel({
  datacenter,
  readOnly,
  pending,
  onSave,
}: Readonly<{
  datacenter: DatacenterRecord | undefined
  readOnly: boolean
  pending: boolean
  onSave: (ntp: NtpDefaults | null, onSuccess: () => void) => void
}>) {
  const [draftEnabled, setDraftEnabled] = useState<boolean | null>(null)
  const [draftServers, setDraftServers] = useState<string | null>(null)
  const [draftFallback, setDraftFallback] = useState<string | null>(null)
  const ntp = datacenter?.options?.ntp
  const enabled = draftEnabled ?? ntp?.enabled === true
  const serversText = draftServers ?? formatNtpHostList(ntp?.servers)
  const fallbackText = draftFallback ?? formatNtpHostList(ntp?.fallbackServers)

  const resetDrafts = () => {
    setDraftEnabled(null)
    setDraftServers(null)
    setDraftFallback(null)
  }

  return (
    <SectionPanel
      title="NTP defaults"
      hint="Desired settings · apply per host"
      collapsible
      defaultCollapsed
    >
      <SettingRow label="NTP client enabled">
        <Toggle
          value={enabled}
          disabled={readOnly || pending || !datacenter}
          accessibilityLabel="NTP client enabled"
          onValueChange={setDraftEnabled}
        />
      </SettingRow>
      <TextField
        label="NTP servers"
        value={serversText}
        onChangeText={setDraftServers}
        editable={!readOnly && !pending && Boolean(datacenter)}
        placeholder="time.cloudflare.com, pool.ntp.org"
        accessibilityLabel="Datacenter NTP servers"
      />
      <TextField
        label="Fallback NTP servers"
        value={fallbackText}
        onChangeText={setDraftFallback}
        editable={!readOnly && !pending && Boolean(datacenter)}
        placeholder="Optional fallback hosts"
        accessibilityLabel="Datacenter fallback NTP servers"
      />
      <Text style={panelStyles.muted}>
        Empty + off inherits the organization NTP default. Apply still happens
        on each server Time tab.
      </Text>
      {readOnly ? (
        <Text style={panelStyles.muted}>Manage permission required.</Text>
      ) : (
        <ButtonRow>
          <Button
            label="Save"
            variant="primary"
            disabled={pending || !datacenter}
            busy={pending}
            onPress={() => {
              const next = isEmptyNtpDraft(enabled, serversText, fallbackText)
                ? null
                : ntpDefaultsFromDrafts(enabled, serversText, fallbackText)
              onSave(next, resetDrafts)
            }}
          />
          {ntp != null ? (
            <Button
              label="Clear (inherit)"
              disabled={pending || !datacenter}
              onPress={() => onSave(null, resetDrafts)}
            />
          ) : null}
        </ButtonRow>
      )}
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
    <SectionPanel title="Timezone" collapsible defaultCollapsed>
      <ServerTimezonePicker
        value={effectiveTimezone}
        options={timezoneOptions}
        disabled={readOnly || pending || !datacenter}
        placeholder="Select timezone…"
        noneLabel="Inherit org default"
        onChange={onTimezoneChange}
      />
      <SettingRow label="Enforce on members">
        <Toggle
          value={enforce}
          disabled={readOnly || pending || !datacenter}
          accessibilityLabel="Enforce on members"
          onValueChange={onEnforceToggle}
        />
      </SettingRow>
      {readOnly ? (
        <Text style={panelStyles.muted}>Manage permission required.</Text>
      ) : (
        <Button
          label="Save"
          variant="primary"
          disabled={pending || !datacenter}
          busy={pending}
          onPress={onSave}
        />
      )}
    </SectionPanel>
  )
}

function DatacenterDeletePanel({
  memberCount,
  canManage,
  deleting,
  onConfirm,
}: Readonly<{
  memberCount: number
  canManage: boolean
  deleting: boolean
  onConfirm: () => void
}>) {
  if (!canManage) return null

  const blocked = memberCount > 0

  return (
    <SectionPanel title="Delete" collapsible defaultCollapsed>
      {blocked ? (
        <Text style={panelStyles.muted}>
          Unassign every server first.
        </Text>
      ) : (
        <Text style={panelStyles.muted}>
          Permanently remove this empty datacenter.
        </Text>
      )}
      <ConfirmButton
        label="Delete datacenter"
        confirmLabel="Confirm delete"
        prompt="Permanently delete this datacenter?"
        busy={deleting}
        disabled={blocked}
        onConfirm={onConfirm}
      />
    </SectionPanel>
  )
}

function applySubnetLabelDrafts(
  subnets: readonly DatacenterSubnetRecord[],
  drafts: ReadonlyMap<string, string>,
): DatacenterSubnetRecord[] {
  return subnets.map((subnet) => {
    const draft = drafts.get(subnet.id)
    if (draft === undefined) return subnet
    return { ...subnet, name: draft }
  })
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
  const [draftName, setDraftName] = useState<string | null>(null)
  const [draftDescription, setDraftDescription] = useState<string | null>(null)
  const [draftTimezone, setDraftTimezone] = useState<string | null | undefined>(
    undefined,
  )
  const [draftEnforce, setDraftEnforce] = useState<boolean | null>(null)
  const [draftPreference, setDraftPreference] =
    useState<DatacenterAddressPreference | null>(null)
  const [addCidr, setAddCidr] = useState('')
  const [addLabel, setAddLabel] = useState('')
  const [subnetLabelDrafts, setSubnetLabelDrafts] = useState(
    () => new Map<string, string>(),
  )

  const datacenterQuery = useDatacenter(orgId, datacenterId, {
    enabled: Boolean(datacenterId),
  })
  const serversQuery = useOrgServers(orgId)
  const timezonesQuery = useTimezones()
  const fabricQuery = useOrgFabric(orgId, { enabled: canManage })
  const datacentersQuery = useDatacenters(orgId)

  const relays = fabricQuery.data?.relays ?? []
  const allDatacenters = orEmptyArray(datacentersQuery.data?.datacenters)

  const addMembersMutation = useAddDatacenterMembers(orgId, datacenterId)
  const removeMemberMutation = useRemoveDatacenterMember(orgId, datacenterId)
  const updateMutation = useUpdateDatacenter(orgId, datacenterId)
  const deleteMutation = useDeleteDatacenter(orgId)
  const createSubnetMutation = useCreateDatacenterSubnet(orgId, datacenterId)
  const updateSubnetMutation = useUpdateDatacenterSubnet(orgId, datacenterId)
  const deleteSubnetMutation = useDeleteDatacenterSubnet(orgId, datacenterId)

  const datacenter: DatacenterDetailRecord | undefined =
    datacenterQuery.data?.datacenter
  const members = datacenterQuery.data?.members ?? []
  const servers = orEmptyArray(serversQuery.data?.servers)
  const subnets = applySubnetLabelDrafts(
    datacenter?.subnets ?? [],
    subnetLabelDrafts,
  )
  const pinnedAddresses = members.map((pin) => pin.address)
  const serversById = useMemo(
    () => new Map(servers.map((server) => [server.id, server])),
    [servers],
  )

  const candidateServers = useMemo(() => {
    return listServersWithCandidateAddresses(
      servers,
      pinnedAddresses,
      subnets,
    ).sort((a, b) => serverTitle(a).localeCompare(serverTitle(b)))
  }, [servers, pinnedAddresses, subnets])

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
      allDatacenters.map((dc) => [dc.id, dc.name?.trim() || dc.id]),
    )
    if (datacenter) {
      map.set(datacenterId, datacenter.name?.trim() || datacenterId)
    }
    return map
  }, [allDatacenters, datacenter, datacenterId])

  const mesh = resolveSiteLinks(relays, serverById)
  const primaryGatewayByDatacenter = resolvePrimaryGatewayByDatacenter(
    relays,
    serverById,
  )
  const serverNameById = useMemo(() => {
    const map = new Map<string, string>()
    for (const server of servers) {
      map.set(server.id, serverTitle(server))
    }
    return map
  }, [servers])
  const meshRows = buildMeshRows({
    relays,
    servers,
    datacenterId,
    mesh,
    nameById,
    serverNameById,
    primaryGatewayByDatacenter,
  })

  let effectiveTimezone = datacenter?.options?.defaultServerTimezone ?? null
  if (draftTimezone !== undefined) {
    effectiveTimezone = draftTimezone
  }
  const enforce =
    draftEnforce ?? (datacenter?.options?.enforceServerTimezone ?? false)
  const addressPreference: DatacenterAddressPreference =
    draftPreference ?? datacenter?.options?.addressPreference ?? 'ipv6'
  const identityName = draftName ?? datacenter?.name ?? ''
  const identityDescription = draftDescription ?? datacenter?.description ?? ''
  const pending =
    updateMutation.isPending ||
    addMembersMutation.isPending ||
    removeMemberMutation.isPending ||
    createSubnetMutation.isPending ||
    updateSubnetMutation.isPending ||
    deleteSubnetMutation.isPending
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
    createSubnetMutation.actionError ??
    updateSubnetMutation.actionError ??
    deleteSubnetMutation.actionError ??
    deleteMutation.actionError ??
    queryError

  const title =
    datacenter?.name?.trim() ||
    (datacenterQuery.isLoading ? 'Datacenter' : 'Unnamed datacenter')

  const saveMergedOptions = (
    patch: Parameters<typeof mergeDatacenterOptions>[1],
    onSuccess: () => void,
    fallback: string,
  ) => {
    if (!datacenter) {
      setError(fallback)
      return
    }
    setError(null)
    updateMutation.mutate(
      {
        options: mergeDatacenterOptions(datacenter.options, patch),
      },
      {
        onSuccess,
        onError: (err) => {
          setError(mutationErrorMessage(err, fallback))
        },
      },
    )
  }

  return (
    <View style={styles.root}>
      <Text style={panelStyles.pageTitle}>{title}</Text>
      {datacenter?.description?.trim() ? (
        <Text style={panelStyles.pageCopy}>
          {datacenter.description.trim()}
        </Text>
      ) : null}

      {displayError ? (
        <Text style={panelStyles.error}>{displayError}</Text>
      ) : null}

      <DatacenterIdentityPanel
        name={identityName}
        description={identityDescription}
        canManage={canManage}
        pending={pending}
        onDisplayNameChange={setDraftName}
        onDescriptionChange={setDraftDescription}
        onSave={() => {
          setError(null)
          updateMutation.mutate(
            {
              name: identityName.trim(),
              description: identityDescription.trim(),
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

      <SubnetsPanel
        subnets={subnets}
        loading={datacenterQuery.isLoading}
        canManage={canManage}
        pending={pending}
        addCidr={addCidr}
        addLabel={addLabel}
        onAddCidrChange={setAddCidr}
        onAddLabelChange={setAddLabel}
        onAdd={() => {
          const normalized = normalizeCidr(addCidr)
          if (!isValidCidr(addCidr) || !normalized) {
            setError('Enter a valid IPv4 or IPv6 CIDR.')
            return
          }
          if (subnets.some((subnet) => cidrsOverlap(subnet.cidr, normalized))) {
            setError(
              'That range overlaps an existing subnet in this organization.',
            )
            return
          }
          setError(null)
          const body: { cidr: string; name?: string } = {
            cidr: normalized,
          }
          const label = addLabel.trim()
          if (label) body.name = label
          createSubnetMutation.mutate(body, {
            onSuccess: () => {
              setAddCidr('')
              setAddLabel('')
            },
            onError: (err) => {
              setError(subnetCreateErrorMessage(err))
            },
          })
        }}
        onDraftLabelChange={(networkId, value) => {
          setSubnetLabelDrafts((current) => {
            const next = new Map(current)
            next.set(networkId, value)
            return next
          })
        }}
        onSaveLabel={(networkId) => {
          const subnet = subnets.find((row) => row.id === networkId)
          if (!subnet) return
          const displayName = subnet.name?.trim() || undefined
          setError(null)
          updateSubnetMutation.mutate(
            { networkId, body: { name: displayName ?? '' } },
            {
              onSuccess: () => {
                setSubnetLabelDrafts((current) => {
                  const next = new Map(current)
                  next.delete(networkId)
                  return next
                })
              },
              onError: (err) => {
                setError(
                  mutationErrorMessage(err, 'Failed to save subnet label'),
                )
              },
            },
          )
        }}
        onDeleteSubnet={(networkId) => {
          setError(null)
          deleteSubnetMutation.mutate(networkId, {
            onError: (err) => {
              setError(subnetDeleteErrorMessage(err))
            },
          })
        }}
      />

      <MemberServersPanel
        pins={members}
        serversById={serversById}
        subnets={subnets}
        candidateServers={candidateServers}
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
                setError(assignMemberErrorMessage(err))
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
        subnetCount={subnets.length}
        loading={fabricQuery.isLoading}
        canManage={canManage}
      />

      <AddressPreferencePanel
        preference={addressPreference}
        canManage={canManage}
        pending={pending}
        loaded={Boolean(datacenter)}
        onChange={setDraftPreference}
        onSave={() =>
          saveMergedOptions(
            { addressPreference },
            () => setDraftPreference(null),
            'Failed to save address preference',
          )
        }
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
        onSave={() =>
          saveMergedOptions(
            {
              defaultServerTimezone: effectiveTimezone,
              enforceServerTimezone: enforce,
            },
            () => {
              setDraftTimezone(undefined)
              setDraftEnforce(null)
            },
            'Failed to save datacenter timezone',
          )
        }
      />

      <DatacenterSshPortPanel
        datacenter={datacenter}
        readOnly={readOnly}
        pending={pending}
        onSave={(sshPort, onSuccess) =>
          saveMergedOptions(
            { sshPort },
            onSuccess,
            'Failed to save SSH port',
          )
        }
      />

      <DatacenterNtpPanel
        datacenter={datacenter}
        readOnly={readOnly}
        pending={pending}
        onSave={(ntp, onSuccess) =>
          saveMergedOptions({ ntp }, onSuccess, 'Failed to save NTP defaults')
        }
      />

      <DatacenterDeletePanel
        memberCount={members.length}
        canManage={canManage}
        deleting={deleteMutation.isPending}
        onConfirm={() => {
          setError(null)
          deleteMutation.mutate(datacenterId, {
            onSuccess: () => {
              router.replace(serversDatacentersHref(orgId) as Href)
            },
            onError: (err) => {
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
  subnetTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  summaryCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  pinAddressRow: {
    flexDirection: 'row',
    alignItems: 'center',
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
  labelField: {
    gap: spacing.xs,
  },
  mono: {
    fontFamily: 'monospace',
    color: colors.textBody,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
})
