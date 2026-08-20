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
import { chrome, colors, spacing } from '@/lib/theme'
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

function AddressFamilyBadge({
  family,
}: Readonly<{ family: 'IPv4' | 'IPv6' | null }>) {
  if (!family) return null
  return (
    <View
      style={orgPanelStyles.segmentChip}
      accessibilityRole="text"
      accessibilityLabel={family}
    >
      <Text style={orgPanelStyles.segmentChipText}>{family}</Text>
    </View>
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
      <View style={styles.identityField}>
        <Text style={styles.fieldLabel}>Display name</Text>
        <TextInput
          value={name}
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
    <View style={styles.identityField}>
      <Text style={styles.fieldLabel}>Label</Text>
      <TextInput
        value={label}
        onChangeText={onDraftLabelChange}
        placeholder="Optional"
        placeholderTextColor={colors.textDim}
        style={styles.identityInput}
        editable={!pending}
        accessibilityLabel={`Subnet label for ${cidr}`}
      />
      <Pressable
        disabled={pending}
        onPress={onSaveLabel}
        style={[
          orgPanelStyles.toolbarBtnSecondary,
          pending && styles.buttonDisabled,
          webPointer,
        ]}
        accessibilityRole="button"
        accessibilityLabel={`Save subnet label for ${cidr}`}
      >
        <Text style={orgPanelStyles.toolbarBtnTextSecondary}>
          Save label
        </Text>
      </Pressable>
    </View>
  )
}

function SubnetLabelReadout({ name }: Readonly<{ name: string | null }>) {
  const shown = name?.trim()
  if (!shown) return null
  return (
    <Text style={orgPanelStyles.detailLine}>
      <Text style={orgPanelStyles.detailLabel}>Label: </Text>
      {shown}
    </Text>
  )
}

function SubnetCard({
  subnet,
  canManage,
  pending,
  confirming,
  onDraftLabelChange,
  onSaveLabel,
  onRequestDelete,
  onCancelDelete,
  onConfirmDelete,
}: Readonly<{
  subnet: DatacenterSubnetRecord
  canManage: boolean
  pending: boolean
  confirming: boolean
  onDraftLabelChange: (value: string) => void
  onSaveLabel: () => void
  onRequestDelete: () => void
  onCancelDelete: () => void
  onConfirmDelete: () => void
}>) {
  const family = subnet.version === 6 ? 'IPv6' : 'IPv4'
  const blocked = subnet.memberCount > 0
  const label = subnet.name ?? ''

  return (
    <View style={orgPanelStyles.detailCard}>
      <View style={styles.subnetTitleRow}>
        <Text style={styles.mono} selectable>
          {subnet.cidr}
        </Text>
        <AddressFamilyBadge family={family} />
      </View>
      <Text style={orgPanelStyles.detailLine}>
        <Text style={orgPanelStyles.detailLabel}>Servers: </Text>
        {formatDatacenterServerCount(subnet.memberCount)}
      </Text>
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
        <Text style={orgPanelStyles.muted}>
          Unassign the pinned servers first.
        </Text>
      ) : null}
      {canManage && confirming && !blocked ? (
        <View style={styles.actionsRow}>
          <Pressable
            style={[orgPanelStyles.toolbarBtnPrimary, webPointer]}
            onPress={onConfirmDelete}
            accessibilityRole="button"
            accessibilityLabel={`Confirm delete subnet ${subnet.cidr}`}
          >
            <Text style={orgPanelStyles.toolbarBtnTextPrimary}>
              Confirm delete
            </Text>
          </Pressable>
          <Pressable
            style={[orgPanelStyles.toolbarBtnSecondary, webPointer]}
            onPress={onCancelDelete}
            accessibilityRole="button"
            accessibilityLabel="Cancel subnet delete"
          >
            <Text style={orgPanelStyles.toolbarBtnTextSecondary}>Cancel</Text>
          </Pressable>
        </View>
      ) : null}
      {canManage && !confirming ? (
        <Pressable
          style={[
            orgPanelStyles.toolbarBtnSecondary,
            (blocked || pending) && styles.buttonDisabled,
            webPointer,
          ]}
          disabled={blocked || pending}
          onPress={onRequestDelete}
          accessibilityRole="button"
          accessibilityLabel={`Delete subnet ${subnet.cidr}`}
          accessibilityState={{ disabled: blocked || pending }}
        >
          <Text style={orgPanelStyles.toolbarBtnTextSecondary}>
            Delete subnet
          </Text>
        </Pressable>
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
  confirmingNetworkId,
  onAddCidrChange,
  onAddLabelChange,
  onAdd,
  onDraftLabelChange,
  onSaveLabel,
  onRequestDelete,
  onCancelDelete,
  onConfirmDelete,
}: Readonly<{
  subnets: readonly DatacenterSubnetRecord[]
  loading: boolean
  canManage: boolean
  pending: boolean
  addCidr: string
  addLabel: string
  confirmingNetworkId: string | null
  onAddCidrChange: (value: string) => void
  onAddLabelChange: (value: string) => void
  onAdd: () => void
  onDraftLabelChange: (networkId: string, value: string) => void
  onSaveLabel: (networkId: string) => void
  onRequestDelete: (networkId: string) => void
  onCancelDelete: () => void
  onConfirmDelete: (networkId: string) => void
}>) {
  const sorted = sortDatacenterSubnets(subnets)
  const normalizedAdd = normalizeCidr(addCidr)
  const addDisabled = pending || !normalizedAdd

  return (
    <SectionPanel title="Subnets" hint={subnetPanelHint(sorted.length)}>
      {loading && sorted.length === 0 ? (
        <Text style={orgPanelStyles.muted}>Loading…</Text>
      ) : null}
      {!loading && sorted.length === 0 ? (
        <View style={orgPanelStyles.statePanel}>
          <Text style={orgPanelStyles.muted}>
            No subnets yet — add one or pin a server whose reported prefix
            creates it.
          </Text>
        </View>
      ) : null}
      {sorted.length > 0 ? (
        <View style={styles.list}>
          {sorted.map((subnet) => (
            <SubnetCard
              key={subnet.id}
              subnet={subnet}
              canManage={canManage}
              pending={pending}
              confirming={confirmingNetworkId === subnet.id}
              onDraftLabelChange={(value) =>
                onDraftLabelChange(subnet.id, value)
              }
              onSaveLabel={() => onSaveLabel(subnet.id)}
              onRequestDelete={() => onRequestDelete(subnet.id)}
              onCancelDelete={onCancelDelete}
              onConfirmDelete={() => onConfirmDelete(subnet.id)}
            />
          ))}
        </View>
      ) : null}

      {canManage ? (
        <View style={styles.assignBlock}>
          <View style={styles.identityField}>
            <Text style={styles.fieldLabel}>CIDR</Text>
            <TextInput
              value={addCidr}
              onChangeText={onAddCidrChange}
              placeholder="203.0.113.0/24"
              placeholderTextColor={colors.textDim}
              style={[styles.identityInput, styles.monoInput]}
              editable={!pending}
              accessibilityLabel="New subnet CIDR"
              autoCapitalize="none"
              autoCorrect={false}
            />
            {normalizedAdd && normalizedAdd !== addCidr.trim() ? (
              <Text style={orgPanelStyles.muted}>{normalizedAdd}</Text>
            ) : null}
          </View>
          <View style={styles.identityField}>
            <Text style={styles.fieldLabel}>Label</Text>
            <TextInput
              value={addLabel}
              onChangeText={onAddLabelChange}
              placeholder="Optional"
              placeholderTextColor={colors.textDim}
              style={styles.identityInput}
              editable={!pending}
              accessibilityLabel="New subnet label"
            />
          </View>
          <Pressable
            style={[
              orgPanelStyles.toolbarBtnPrimary,
              addDisabled && styles.buttonDisabled,
              webPointer,
            ]}
            disabled={addDisabled}
            onPress={onAdd}
            accessibilityRole="button"
            accessibilityLabel="Add subnet"
            accessibilityState={{ disabled: addDisabled, busy: pending }}
          >
            <Text style={orgPanelStyles.toolbarBtnTextPrimary}>Add subnet</Text>
          </Pressable>
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
    <SectionPanel title="Routing">
      <Text style={styles.fieldLabel}>Address preference</Text>
      <View style={orgPanelStyles.segmentGroup}>
        {(['ipv6', 'ipv4'] as const).map((value) => {
          const active = preference === value
          const label = value === 'ipv6' ? 'Prefer IPv6' : 'Prefer IPv4'
          return (
            <Pressable
              key={value}
              style={[
                orgPanelStyles.segmentChip,
                active && orgPanelStyles.segmentChipActive,
                controlsDisabled && styles.buttonDisabled,
                webPointer,
              ]}
              disabled={controlsDisabled}
              onPress={() => onChange(value)}
              accessibilityRole="button"
              accessibilityState={{
                selected: active,
                disabled: controlsDisabled,
              }}
              accessibilityLabel={label}
            >
              <Text
                style={[
                  orgPanelStyles.segmentChipText,
                  active && orgPanelStyles.segmentChipTextActive,
                ]}
              >
                {label}
              </Text>
            </Pressable>
          )
        })}
      </View>
      <Text style={orgPanelStyles.muted}>
        Only applies when both servers have an address in the same datacenter in
        both families.
      </Text>
      {canManage ? (
        <Pressable
          disabled={saveDisabled}
          onPress={onSave}
          style={[
            orgPanelStyles.toolbarBtnPrimary,
            saveDisabled && styles.buttonDisabled,
            webPointer,
          ]}
          accessibilityRole="button"
          accessibilityLabel="Save address preference"
          accessibilityState={{ disabled: saveDisabled, busy: pending }}
        >
          <Text style={orgPanelStyles.toolbarBtnTextPrimary}>Save</Text>
        </Pressable>
      ) : (
        <Text style={orgPanelStyles.muted}>Manage permission required.</Text>
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
    ? candidateMemberNetworks(selectedCandidate, pinnedAddresses)
    : []
  const serverOptions = candidateServers.map((server) => ({
    value: server.id,
    label: serverTitle(server),
  }))
  const addressOptions = candidateNetworks.map((network) => ({
    value: network.address,
    label: network.address,
  }))
  const selectedNetwork = candidateNetworks.find(
    (network) => network.address === assignAddress,
  )
  const newSubnetCidr =
    selectedNetwork && !subnetForAddress(subnets, selectedNetwork.address)
      ? selectedNetwork.cidr
      : null
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
      ? candidateMemberNetworks(next, pinnedAddresses)
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
        <Text style={orgPanelStyles.muted}>None yet.</Text>
      ) : (
        <View style={styles.list}>
          {pins.map((pin) => {
            const server = serversById.get(pin.serverId)
            const pinCount = pinCountByServer.get(pin.serverId) ?? 1
            const serverLabel = server ? serverTitle(server) : pin.serverId
            const unassignLabel = pinUnassignAccessibilityLabel(
              pinCount,
              serverLabel,
            )
            const unassignText = pinUnassignText(pinCount)
            return (
              <View
                key={pin.ipId}
                style={orgPanelStyles.detailCard}
              >
                <Text style={orgPanelStyles.detailTitle}>
                  {server ? serverTitle(server) : pin.serverId}
                </Text>
                {server ? (
                  <Text style={orgPanelStyles.detailLine}>
                    <Text style={orgPanelStyles.detailLabel}>Status: </Text>
                    {serverConnectionStatusLabel(
                      resolveServerConnectionStatus(server),
                    )}
                  </Text>
                ) : null}
                <View style={styles.pinAddressRow}>
                  <Text style={styles.mono} selectable>
                    {pin.address}
                  </Text>
                  <AddressFamilyBadge family={addressFamilyLabel(pin.address)} />
                </View>
                <Text style={orgPanelStyles.detailLine}>
                  <Text style={orgPanelStyles.detailLabel}>Subnet: </Text>
                  {pinSubnetCidr(pin, subnets) ?? '—'}
                </Text>
                {canManage ? (
                  <Pressable
                    style={[
                      orgPanelStyles.toolbarBtnSecondary,
                      pending && styles.buttonDisabled,
                      webPointer,
                    ]}
                    disabled={pending}
                    onPress={() => onUnassign(pin.serverId)}
                    accessibilityRole="button"
                    accessibilityLabel={unassignLabel}
                  >
                    <Text style={orgPanelStyles.toolbarBtnTextSecondary}>
                      {unassignText}
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
          {candidateServers.length === 0 ? (
            <Text style={orgPanelStyles.muted}>
              No unpinned private addresses on other servers.
            </Text>
          ) : (
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
              {newSubnetCidr ? (
                <Text style={orgPanelStyles.muted}>
                  Adds a new subnet {newSubnetCidr} to this datacenter.
                </Text>
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
              {row.viaLabel ? (
                <Text style={orgPanelStyles.detailLine}>
                  <Text style={orgPanelStyles.detailLabel}>Via: </Text>
                  {row.viaLabel}
                </Text>
              ) : null}
              <Text style={orgPanelStyles.detailLine}>
                <Text style={orgPanelStyles.detailLabel}>
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
    <SectionPanel title="SSH port" hint="Inherited by member servers">
      <TextInput
        value={sshText}
        onChangeText={setDraft}
        editable={!readOnly && !pending && Boolean(datacenter)}
        keyboardType="number-pad"
        placeholder={String(DEFAULT_SSH_PORT)}
        placeholderTextColor={colors.textMuted}
        accessibilityLabel="Datacenter SSH port"
        style={[
          styles.identityInput,
          (readOnly || pending) && styles.buttonDisabled,
        ]}
      />
      <Text style={orgPanelStyles.muted}>
        Empty inherits the organization default (then {String(DEFAULT_SSH_PORT)}
        ). Saving does not change sshd.
      </Text>
      {localError ? <Text style={orgPanelStyles.error}>{localError}</Text> : null}
      {readOnly ? (
        <Text style={orgPanelStyles.muted}>Manage permission required.</Text>
      ) : (
        <Pressable
          disabled={pending || !datacenter}
          onPress={save}
          style={[
            orgPanelStyles.toolbarBtnPrimary,
            (pending || !datacenter) && styles.buttonDisabled,
            webPointer,
          ]}
        >
          <Text style={orgPanelStyles.toolbarBtnTextPrimary}>Save</Text>
        </Pressable>
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
    <SectionPanel title="NTP defaults" hint="Desired settings · apply per host">
      <View style={styles.switchRow}>
        <View style={styles.switchCopy}>
          <Text style={styles.switchLabel}>NTP client enabled</Text>
        </View>
        <Pressable
          accessibilityRole="switch"
          accessibilityState={{
            checked: enabled,
            disabled: readOnly || pending || !datacenter,
          }}
          disabled={readOnly || pending || !datacenter}
          onPress={() => setDraftEnabled(!enabled)}
          style={[
            styles.toggle,
            enabled ? styles.toggleOn : styles.toggleOff,
            (readOnly || pending) && styles.buttonDisabled,
          ]}
        >
          <Text style={styles.toggleText}>{enabled ? 'On' : 'Off'}</Text>
        </Pressable>
      </View>
      <View style={styles.identityField}>
        <Text style={styles.fieldLabel}>NTP servers</Text>
        <TextInput
          value={serversText}
          onChangeText={setDraftServers}
          editable={!readOnly && !pending && Boolean(datacenter)}
          placeholder="time.cloudflare.com, pool.ntp.org"
          placeholderTextColor={colors.textMuted}
          accessibilityLabel="Datacenter NTP servers"
          style={[
            styles.identityInput,
            (readOnly || pending) && styles.buttonDisabled,
          ]}
        />
      </View>
      <View style={styles.identityField}>
        <Text style={styles.fieldLabel}>Fallback NTP servers</Text>
        <TextInput
          value={fallbackText}
          onChangeText={setDraftFallback}
          editable={!readOnly && !pending && Boolean(datacenter)}
          placeholder="Optional fallback hosts"
          placeholderTextColor={colors.textMuted}
          accessibilityLabel="Datacenter fallback NTP servers"
          style={[
            styles.identityInput,
            (readOnly || pending) && styles.buttonDisabled,
          ]}
        />
      </View>
      <Text style={orgPanelStyles.muted}>
        Empty + off inherits the organization NTP default. Apply still happens
        on each server Time tab.
      </Text>
      {readOnly ? (
        <Text style={orgPanelStyles.muted}>Manage permission required.</Text>
      ) : (
        <View style={styles.actionsRow}>
          <Pressable
            disabled={pending || !datacenter}
            onPress={() => {
              const next = isEmptyNtpDraft(enabled, serversText, fallbackText)
                ? null
                : ntpDefaultsFromDrafts(enabled, serversText, fallbackText)
              onSave(next, resetDrafts)
            }}
            style={[
              orgPanelStyles.toolbarBtnPrimary,
              (pending || !datacenter) && styles.buttonDisabled,
              webPointer,
            ]}
          >
            <Text style={orgPanelStyles.toolbarBtnTextPrimary}>Save</Text>
          </Pressable>
          {ntp != null ? (
            <Pressable
              disabled={pending || !datacenter}
              onPress={() => onSave(null, resetDrafts)}
              style={[
                orgPanelStyles.toolbarBtnSecondary,
                (pending || !datacenter) && styles.buttonDisabled,
                webPointer,
              ]}
            >
              <Text style={orgPanelStyles.toolbarBtnTextSecondary}>
                Clear (inherit)
              </Text>
            </Pressable>
          ) : null}
        </View>
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
  const [confirmingDelete, setConfirmingDelete] = useState(false)
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
  const [confirmingSubnetId, setConfirmingSubnetId] = useState<string | null>(
    null,
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
    return listServersWithCandidateAddresses(servers, pinnedAddresses).sort(
      (a, b) => serverTitle(a).localeCompare(serverTitle(b)),
    )
  }, [servers, pinnedAddresses])

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
        confirmingNetworkId={confirmingSubnetId}
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
        onRequestDelete={setConfirmingSubnetId}
        onCancelDelete={() => setConfirmingSubnetId(null)}
        onConfirmDelete={(networkId) => {
          setError(null)
          deleteSubnetMutation.mutate(networkId, {
            onSuccess: () => setConfirmingSubnetId(null),
            onError: (err) => {
              setConfirmingSubnetId(null)
              setError(subnetDeleteErrorMessage(err))
            },
          })
        }}
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
  subnetTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    flexWrap: 'wrap',
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
  monoInput: {
    fontFamily: 'monospace',
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
