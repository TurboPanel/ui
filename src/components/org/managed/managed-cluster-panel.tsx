import { useMemo, useState } from 'react'
import { useRouter, type Href } from 'expo-router'
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { SectionPanel } from '@/components/org/section-panel'
import { orgPanelStyles, webPointer } from '@/components/org/org-panel-styles'
import type { ManagedMemberRecord, ManagedReplicaClass } from '@/lib/managed-services'
import {
  formatReplicationLag,
  managedErrorMessage,
  memberReplicaClassLabel,
  memberRoleLabel,
  memberStatusLabel,
  memberTransportLabel,
  replicationStateLabel,
} from '@/lib/managed-services'
import {
  replicaIneligibleReasonLabel,
  resolveReplicaEligibility,
  type ReplicaIneligibleReason,
  type ReplicaServerEligibility,
} from '@/lib/managed-replica-eligibility'
import { formatServerDatacenterNames } from '@/lib/datacenter-list'
import {
  datacenterHref,
  serversDatacentersHref,
} from '@/lib/org-navigation'
import {
  MANAGED_PRIMARY_FENCE_FAILED_ERROR,
  MANAGED_REPLICA_HEALTH_STALE_ERROR,
  MANAGED_REPLICA_LAGGING_ERROR,
  MANAGED_REPLICA_NOT_STREAMING_ERROR,
  type OrgServerRecord,
} from '@/lib/instance-api'
import {
  useAddManagedReplica,
  usePromoteManagedMember,
  useRemoveManagedMember,
  useUpdateManagedMemberReadEligible,
  useUpdateManagedMemberReplicaClass,
} from '@/lib/queries/managed'
import { useOrgServers } from '@/lib/queries/servers'
import { useDatacenters } from '@/lib/queries/topology'
import { useOrgFabric } from '@/lib/queries/fabric'
import { TURBOFABRIC_PRODUCT_NAME } from '@/lib/platform-copy'
import { chrome, colors, spacing } from '@/lib/theme'

const webInputStyle = {
  borderWidth: 1,
  borderColor: colors.border,
  backgroundColor: colors.bgInput,
  color: colors.text,
  paddingHorizontal: 12,
  paddingVertical: 10,
  fontSize: 16,
  borderRadius: 6,
  minHeight: 44,
} as const

const PROMOTE_GATE_CODES = new Set([
  MANAGED_REPLICA_NOT_STREAMING_ERROR,
  MANAGED_REPLICA_LAGGING_ERROR,
  MANAGED_REPLICA_HEALTH_STALE_ERROR,
])

function extractErrorCode(err: unknown): string | null {
  if (!(err instanceof Error)) return null
  const match = /HTTP \d+:\s*([a-z0-9_]+)/i.exec(err.message)
  return match?.[1] ?? null
}

function memberDotStyle(role: ManagedMemberRecord['role'], healthy: boolean) {
  if (role === 'primary') {
    return healthy ? styles.dotPrimary : styles.dotWarn
  }
  return healthy ? styles.dotReplica : styles.dotMuted
}

function isHealthyMemberStatus(status: string | null): boolean {
  if (!status) return true
  return status === 'ready' || status === 'running'
}

function resolveHealthLine(member: ManagedMemberRecord): string {
  if (member.role !== 'replica') {
    return memberStatusLabel(member.status)
  }
  const lag = formatReplicationLag(member.replication)
  return (
    [replicationStateLabel(member.replication?.state ?? null), lag]
      .filter(Boolean)
      .join(' · ') || '—'
  )
}

export function ManagedClusterPanel({
  orgId,
  environmentId,
  members,
  managedDisplayName,
  canManage,
  busy,
  onRegisterCommand,
}: Readonly<{
  orgId: string
  environmentId: string
  members: readonly ManagedMemberRecord[]
  managedDisplayName: string
  canManage: boolean
  busy: boolean
  onRegisterCommand: (
    commandId: string,
    label: string,
    serverId?: string,
  ) => void
}>) {
  const router = useRouter()
  const serversQuery = useOrgServers(orgId)
  const datacentersQuery = useDatacenters(orgId)
  const fabricQuery = useOrgFabric(orgId)
  const addReplica = useAddManagedReplica(orgId, environmentId)
  const updateRead = useUpdateManagedMemberReadEligible(orgId, environmentId)
  const updateReplicaClass = useUpdateManagedMemberReplicaClass(
    orgId,
    environmentId,
  )
  const removeMember = useRemoveManagedMember(orgId, environmentId)
  const promoteMember = usePromoteManagedMember(orgId, environmentId)

  const [error, setError] = useState<string | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [selectedServerId, setSelectedServerId] = useState<string | null>(null)
  const [replicaClass, setReplicaClass] = useState<ManagedReplicaClass>('failover')
  const [readEligible, setReadEligible] = useState(true)
  const [removeArmedId, setRemoveArmedId] = useState<string | null>(null)
  const [convertArmedId, setConvertArmedId] = useState<string | null>(null)
  const [promoteMemberId, setPromoteMemberId] = useState<string | null>(null)
  const [promoteConfirmName, setPromoteConfirmName] = useState('')
  const [forceEscalate, setForceEscalate] = useState(false)
  const [forceGateMessage, setForceGateMessage] = useState<string | null>(null)
  const [working, setWorking] = useState(false)

  const servers = serversQuery.data?.servers ?? []
  const datacenters = datacentersQuery.data?.datacenters ?? []
  const fabricRelays = useMemo(
    () =>
      (fabricQuery.data?.relays ?? []).map((relay) => ({
        serverId: relay.serverId,
      })),
    [fabricQuery.data?.relays],
  )

  const serverById = useMemo(() => {
    const map = new Map(servers.map((s) => [s.id, s]))
    return map
  }, [servers])

  const primary = members.find((m) => m.role === 'primary') ?? null

  const eligibility = useMemo(
    () =>
      resolveReplicaEligibility({
        servers: servers.map((s) => ({
          id: s.id,
          displayName: s.displayName,
          hostname: s.hostname,
          connected: s.connected,
          datacenters: s.datacenters ?? [],
        })),
        datacenters: datacenters.map((dc) => ({
          id: dc.id,
          privateCidrs: dc.privateCidrs ?? [],
        })),
        members,
        primaryServerId: primary?.serverId ?? null,
        fabricRelays,
        replicaClass,
      }),
    [servers, datacenters, members, primary?.serverId, fabricRelays, replicaClass],
  )

  const eligibilityById = useMemo(() => {
    const map = new Map(eligibility.servers.map((row) => [row.serverId, row]))
    return map
  }, [eligibility.servers])

  const confirmName = managedDisplayName.trim()
  const promoteTypedOk =
    promoteConfirmName.trim().length > 0 &&
    promoteConfirmName.trim() === confirmName

  const siteLabel = (serverId: string): string => {
    const server = serverById.get(serverId)
    return formatServerDatacenterNames(server?.datacenters ?? []) || '—'
  }

  const serverLabel = (member: ManagedMemberRecord): string => {
    return (
      member.serverDisplayName?.trim() ||
      serverById.get(member.serverId)?.displayName?.trim() ||
      serverById.get(member.serverId)?.hostname?.trim() ||
      member.serverId
    )
  }

  const handleAddReplica = async () => {
    if (!selectedServerId) {
      setError('Select a server for the replica.')
      return
    }
    setWorking(true)
    setError(null)
    try {
      const result = await addReplica.mutateAsync({
        serverId: selectedServerId,
        replicaClass,
        readEligible,
      })
      onRegisterCommand(result.commandId, 'Add replica', result.serverId)
      setShowAdd(false)
      setSelectedServerId(null)
      setReplicaClass('failover')
    } catch (err) {
      setError(managedErrorMessage(err, 'Failed to add replica'))
    } finally {
      setWorking(false)
    }
  }

  const handleToggleReads = async (
    member: ManagedMemberRecord,
    next: boolean,
  ) => {
    setWorking(true)
    setError(null)
    try {
      const result = await updateRead.mutateAsync({
        memberId: member.id,
        readEligible: next,
      })
      if (result.commandId) {
        onRegisterCommand(result.commandId, 'Update read eligibility', result.serverId)
      }
    } catch (err) {
      setError(managedErrorMessage(err, 'Failed to update read eligibility'))
    } finally {
      setWorking(false)
    }
  }

  const handleConvertToFailover = async (memberId: string) => {
    setWorking(true)
    setError(null)
    try {
      const result = await updateReplicaClass.mutateAsync({
        memberId,
        replicaClass: 'failover',
      })
      if (result.commandId) {
        onRegisterCommand(result.commandId, 'Convert to failover', result.serverId)
      }
      setConvertArmedId(null)
    } catch (err) {
      setError(managedErrorMessage(err, 'Failed to convert replica class'))
      setConvertArmedId(null)
    } finally {
      setWorking(false)
    }
  }

  const handleRemove = async (memberId: string) => {
    setWorking(true)
    setError(null)
    try {
      const result = await removeMember.mutateAsync(memberId)
      onRegisterCommand(result.commandId, 'Remove replica', result.serverId)
      setRemoveArmedId(null)
    } catch (err) {
      setError(managedErrorMessage(err, 'Failed to remove replica'))
      setRemoveArmedId(null)
    } finally {
      setWorking(false)
    }
  }

  const runPromote = async (memberId: string, force: boolean) => {
    setWorking(true)
    setError(null)
    try {
      const result = await promoteMember.mutateAsync({
        memberId,
        ...(force ? { force: true } : {}),
      })
      onRegisterCommand(result.commandId, force ? 'Promote (forced)' : 'Promote', result.serverId)
      setPromoteMemberId(null)
      setPromoteConfirmName('')
      setForceEscalate(false)
      setForceGateMessage(null)
    } catch (err) {
      const code = extractErrorCode(err)
      if (code && PROMOTE_GATE_CODES.has(code) && !force) {
        setForceEscalate(true)
        setForceGateMessage(managedErrorMessage(err, 'Replica is not ready to promote'))
        return
      }
      if (code === MANAGED_PRIMARY_FENCE_FAILED_ERROR) {
        setError(managedErrorMessage(err, 'Primary fence failed'))
        setForceEscalate(false)
        return
      }
      setError(managedErrorMessage(err, 'Failed to promote replica'))
    } finally {
      setWorking(false)
    }
  }

  const disabled = busy || working || !canManage

  const openNetworkReason = (
    reason: ReplicaIneligibleReason,
    serverId: string,
  ) => {
    const eligibilityRow = eligibilityById.get(serverId)
    if (reason === 'no-datacenter') {
      router.push(serversDatacentersHref(orgId) as Href)
      return
    }
    if (
      reason === 'no-private-cidr' &&
      eligibilityRow?.candidateDatacenterId
    ) {
      router.push(
        datacenterHref(orgId, eligibilityRow.candidateDatacenterId) as Href,
      )
      return
    }
    if (reason === 'no-private-path') {
      router.push(serversDatacentersHref(orgId) as Href)
    }
  }

  return (
    <SectionPanel
      title="Cluster"
      hint={`Failover stays on the datacenter LAN · read-only replicas may use ${TURBOFABRIC_PRODUCT_NAME} or public TLS`}
      accent
    >
      {error ? <Text style={orgPanelStyles.error}>{error}</Text> : null}

      <View style={styles.list}>
        {members.map((member) => (
          <ClusterMemberRow
            key={member.id}
            member={member}
            canManage={canManage}
            disabled={disabled}
            serverLabel={serverLabel(member)}
            siteLabel={siteLabel(member.serverId)}
            removeArmed={removeArmedId === member.id}
            convertArmed={convertArmedId === member.id}
            onToggleReads={() => {
              void handleToggleReads(member, !member.readEligible)
            }}
            onArmRemove={() => setRemoveArmedId(member.id)}
            onCancelRemove={() => setRemoveArmedId(null)}
            onConfirmRemove={() => {
              void handleRemove(member.id)
            }}
            onArmConvert={() => setConvertArmedId(member.id)}
            onCancelConvert={() => setConvertArmedId(null)}
            onConfirmConvert={() => {
              void handleConvertToFailover(member.id)
            }}
            onStartPromote={() => {
              setPromoteMemberId(member.id)
              setPromoteConfirmName('')
              setForceEscalate(false)
              setForceGateMessage(null)
            }}
          />
        ))}
        {members.length === 0 ? (
          <Text style={orgPanelStyles.muted}>No cluster members yet.</Text>
        ) : null}
      </View>

      {promoteMemberId ? (
        <PromoteDialog
          primaryLabel={primary ? serverLabel(primary) : null}
          confirmName={confirmName}
          promoteConfirmName={promoteConfirmName}
          onChangePromoteConfirmName={setPromoteConfirmName}
          disabled={disabled}
          forceEscalate={forceEscalate}
          forceGateMessage={forceGateMessage}
          promoteTypedOk={promoteTypedOk}
          onConfirmPromote={() => {
            void runPromote(promoteMemberId, forceEscalate)
          }}
          onCancel={() => {
            setPromoteMemberId(null)
            setForceEscalate(false)
            setPromoteConfirmName('')
          }}
        />
      ) : null}

      {canManage ? (
        <View style={styles.addBlock}>
          <AddReplicaBlock
            showAdd={showAdd}
            disabled={disabled}
            servers={servers}
            primaryServerId={primary?.serverId ?? null}
            eligibilityById={eligibilityById}
            selectedServerId={selectedServerId}
            onSelectServer={setSelectedServerId}
            replicaClass={replicaClass}
            onSelectReplicaClass={(next) => {
              setReplicaClass(next)
              setSelectedServerId(null)
            }}
            readEligible={readEligible}
            onToggleReadEligible={() => setReadEligible((v) => !v)}
            onOpenNetworkReason={openNetworkReason}
            onAddReplica={() => {
              void handleAddReplica()
            }}
            onShowAdd={() => {
              setReplicaClass('failover')
              setShowAdd(true)
            }}
            onCancelAdd={() => {
              setShowAdd(false)
              setSelectedServerId(null)
              setReplicaClass('failover')
            }}
          />
        </View>
      ) : null}
    </SectionPanel>
  )
}

function ClusterMemberRow({
  member,
  canManage,
  disabled,
  serverLabel,
  siteLabel,
  removeArmed,
  convertArmed,
  onToggleReads,
  onArmRemove,
  onCancelRemove,
  onConfirmRemove,
  onArmConvert,
  onCancelConvert,
  onConfirmConvert,
  onStartPromote,
}: Readonly<{
  member: ManagedMemberRecord
  canManage: boolean
  disabled: boolean
  serverLabel: string
  siteLabel: string
  removeArmed: boolean
  convertArmed: boolean
  onToggleReads: () => void
  onArmRemove: () => void
  onCancelRemove: () => void
  onConfirmRemove: () => void
  onArmConvert: () => void
  onCancelConvert: () => void
  onConfirmConvert: () => void
  onStartPromote: () => void
}>) {
  const healthy = isHealthyMemberStatus(member.status)
  const healthLine = resolveHealthLine(member)
  const classLabel = memberReplicaClassLabel(member.replicaClass)
  const isReadReplica = member.role === 'replica' && member.replicaClass === 'read'

  return (
    <View style={styles.row}>
      <View style={styles.rowMain}>
        <View
          style={[styles.dot, memberDotStyle(member.role, healthy)]}
          accessibilityLabel={healthy ? 'healthy member' : 'attention needed'}
        />
        <View style={styles.rowBody}>
          <Text style={styles.roleLine}>
            <Text style={styles.roleLabel}>
              {memberRoleLabel(member.role)}
              {classLabel ? ` · ${classLabel}` : ''}
            </Text>
            <Text style={styles.metaText}>
              {'  '}
              {serverLabel} · {siteLabel} ·{' '}
              {memberTransportLabel(member.replicationTransport)}
            </Text>
          </Text>
          <View style={styles.chipRow}>
            {member.role === 'replica' && member.readEligible ? (
              <View style={styles.readsChip}>
                <Text style={styles.readsChipText}>Reads</Text>
              </View>
            ) : null}
            <Text style={styles.healthText}>{healthLine}</Text>
          </View>
        </View>
      </View>

      {canManage && member.role === 'replica' ? (
        <View style={styles.actions}>
          <Pressable
            style={[orgPanelStyles.toolbarBtnSecondary, webPointer]}
            disabled={disabled}
            onPress={onToggleReads}
          >
            <Text style={orgPanelStyles.toolbarBtnTextSecondary}>
              {member.readEligible ? 'Disable reads' : 'Enable reads'}
            </Text>
          </Pressable>
          <RemoveReplicaControl
            armed={removeArmed}
            disabled={disabled}
            onArm={onArmRemove}
            onCancel={onCancelRemove}
            onConfirm={onConfirmRemove}
          />
          {isReadReplica ? (
            <ConvertToFailoverControl
              armed={convertArmed}
              disabled={disabled}
              onArm={onArmConvert}
              onCancel={onCancelConvert}
              onConfirm={onConfirmConvert}
            />
          ) : (
            <Pressable
              style={[orgPanelStyles.toolbarBtnSecondary, webPointer]}
              disabled={disabled}
              onPress={onStartPromote}
            >
              <Text style={orgPanelStyles.toolbarBtnTextSecondary}>
                Promote
              </Text>
            </Pressable>
          )}
        </View>
      ) : null}
    </View>
  )
}

function RemoveReplicaControl({
  armed,
  disabled,
  onArm,
  onCancel,
  onConfirm,
}: Readonly<{
  armed: boolean
  disabled: boolean
  onArm: () => void
  onCancel: () => void
  onConfirm: () => void
}>) {
  if (armed) {
    return (
      <View style={styles.armedRow}>
        <Text style={orgPanelStyles.calloutWarning}>
          Removes this replica and destroys its data volume.
        </Text>
        <Pressable
          style={[orgPanelStyles.toolbarBtnSecondary, webPointer]}
          disabled={disabled}
          onPress={onConfirm}
        >
          <Text
            style={[orgPanelStyles.toolbarBtnTextSecondary, styles.danger]}
          >
            Confirm remove
          </Text>
        </Pressable>
        <Pressable
          style={[orgPanelStyles.toolbarBtnSecondary, webPointer]}
          onPress={onCancel}
        >
          <Text style={orgPanelStyles.toolbarBtnTextSecondary}>Cancel</Text>
        </Pressable>
      </View>
    )
  }
  return (
    <Pressable
      style={[orgPanelStyles.toolbarBtnSecondary, webPointer]}
      disabled={disabled}
      onPress={onArm}
    >
      <Text style={orgPanelStyles.toolbarBtnTextSecondary}>
        Remove replica
      </Text>
    </Pressable>
  )
}

function ConvertToFailoverControl({
  armed,
  disabled,
  onArm,
  onCancel,
  onConfirm,
}: Readonly<{
  armed: boolean
  disabled: boolean
  onArm: () => void
  onCancel: () => void
  onConfirm: () => void
}>) {
  if (armed) {
    return (
      <View style={styles.armedRow}>
        <Text style={orgPanelStyles.calloutWarning}>
          Converts this replica to failover. It must share the primary's
          datacenter LAN.
        </Text>
        <Pressable
          style={[orgPanelStyles.toolbarBtnSecondary, webPointer]}
          disabled={disabled}
          onPress={onConfirm}
        >
          <Text style={orgPanelStyles.toolbarBtnTextSecondary}>
            Confirm convert
          </Text>
        </Pressable>
        <Pressable
          style={[orgPanelStyles.toolbarBtnSecondary, webPointer]}
          onPress={onCancel}
        >
          <Text style={orgPanelStyles.toolbarBtnTextSecondary}>Cancel</Text>
        </Pressable>
      </View>
    )
  }
  return (
    <Pressable
      style={[orgPanelStyles.toolbarBtnSecondary, webPointer]}
      disabled={disabled}
      onPress={onArm}
    >
      <Text style={orgPanelStyles.toolbarBtnTextSecondary}>
        Convert to failover
      </Text>
    </Pressable>
  )
}

function PromoteDialog({
  primaryLabel,
  confirmName,
  promoteConfirmName,
  onChangePromoteConfirmName,
  disabled,
  forceEscalate,
  forceGateMessage,
  promoteTypedOk,
  onConfirmPromote,
  onCancel,
}: Readonly<{
  primaryLabel: string | null
  confirmName: string
  promoteConfirmName: string
  onChangePromoteConfirmName: (value: string) => void
  disabled: boolean
  forceEscalate: boolean
  forceGateMessage: string | null
  promoteTypedOk: boolean
  onConfirmPromote: () => void
  onCancel: () => void
}>) {
  const promoteDisabled = !promoteTypedOk || disabled

  return (
    <View style={[orgPanelStyles.detailCard, styles.promoteCard]}>
      <Text style={orgPanelStyles.detailTitle}>Promote replica</Text>
      <Text style={orgPanelStyles.detailLine}>
        {primaryLabel
          ? `Writes pause while ${primaryLabel} is demoted and the selected replica becomes primary.`
          : 'Writes pause during the primary switch.'}
      </Text>
      <Text style={orgPanelStyles.muted}>Type {confirmName} to confirm.</Text>
      <TextInput
        style={Platform.OS === 'web' ? webInputStyle : styles.input}
        value={promoteConfirmName}
        onChangeText={onChangePromoteConfirmName}
        autoCapitalize="none"
        autoCorrect={false}
        editable={!disabled}
      />
      {forceEscalate ? (
        <View style={styles.armedRow}>
          <Text style={orgPanelStyles.calloutWarning}>
            {forceGateMessage ?? 'Replica health gate blocked promotion.'}
          </Text>
          <Text style={orgPanelStyles.detailLine}>
            Promote anyway accepts possible data loss if the primary still has
            unreplicated commits.
          </Text>
          <Pressable
            style={[
              orgPanelStyles.toolbarBtnPrimary,
              webPointer,
              promoteDisabled && styles.disabled,
            ]}
            disabled={promoteDisabled}
            onPress={onConfirmPromote}
          >
            <Text style={orgPanelStyles.toolbarBtnTextPrimary}>
              Promote anyway
            </Text>
          </Pressable>
        </View>
      ) : (
        <Pressable
          style={[
            orgPanelStyles.toolbarBtnPrimary,
            webPointer,
            promoteDisabled && styles.disabled,
          ]}
          disabled={promoteDisabled}
          onPress={onConfirmPromote}
        >
          <Text style={orgPanelStyles.toolbarBtnTextPrimary}>
            Confirm promote
          </Text>
        </Pressable>
      )}
      <Pressable
        style={[orgPanelStyles.toolbarBtnSecondary, webPointer]}
        onPress={onCancel}
      >
        <Text style={orgPanelStyles.toolbarBtnTextSecondary}>Cancel</Text>
      </Pressable>
    </View>
  )
}

function ServerOptionRow({
  server,
  eligibilityRow,
  selected,
  disabled,
  onSelect,
  onOpenNetworkReason,
}: Readonly<{
  server: OrgServerRecord
  eligibilityRow: ReplicaServerEligibility | undefined
  selected: boolean
  disabled: boolean
  onSelect: () => void
  onOpenNetworkReason: (reason: ReplicaIneligibleReason) => void
}>) {
  const eligible = eligibilityRow?.eligible === true
  const reason = eligibilityRow?.reason
  const predicted = eligibilityRow?.predictedTransport
  const label = server.displayName?.trim() || server.hostname?.trim() || server.id
  const showNetworkLink =
    reason === 'no-datacenter' ||
    reason === 'no-private-cidr' ||
    reason === 'no-private-path'

  return (
    <Pressable
      style={[
        styles.pickerRow,
        selected && styles.pickerRowSelected,
        webPointer,
      ]}
      disabled={disabled || !eligible}
      onPress={() => {
        if (eligible) onSelect()
      }}
    >
      <Text style={[styles.pickerLabel, !eligible && styles.pickerDisabled]}>
        {label}
      </Text>
      {eligible && predicted ? (
        <Text style={styles.reasonText}>
          {memberTransportLabel(predicted)}
        </Text>
      ) : null}
      {!eligible && reason ? (
        <View style={styles.reasonRow}>
          <Text style={styles.reasonText}>
            {replicaIneligibleReasonLabel(reason)}
          </Text>
          {showNetworkLink && (
            <Pressable
              onPress={() => onOpenNetworkReason(reason)}
              style={webPointer}
            >
              <Text style={styles.linkText}>
                Set up private network
              </Text>
            </Pressable>
          )}
        </View>
      ) : null}
    </Pressable>
  )
}

function AddReplicaForm({
  servers,
  primaryServerId,
  eligibilityById,
  selectedServerId,
  disabled,
  onSelectServer,
  onOpenNetworkReason,
  replicaClass,
  onSelectReplicaClass,
  readEligible,
  onToggleReadEligible,
  onAddReplica,
  onCancelAdd,
}: Readonly<{
  servers: readonly OrgServerRecord[]
  primaryServerId: string | null
  eligibilityById: ReadonlyMap<string, ReplicaServerEligibility>
  selectedServerId: string | null
  disabled: boolean
  onSelectServer: (serverId: string) => void
  onOpenNetworkReason: (reason: ReplicaIneligibleReason, serverId: string) => void
  replicaClass: ManagedReplicaClass
  onSelectReplicaClass: (replicaClass: ManagedReplicaClass) => void
  readEligible: boolean
  onToggleReadEligible: () => void
  onAddReplica: () => void
  onCancelAdd: () => void
}>) {
  return (
    <View style={styles.addForm}>
      <Text style={orgPanelStyles.detailLabel}>Replica class</Text>
      <View style={orgPanelStyles.segmentGroup}>
        {([
          { id: 'failover', label: 'Failover' },
          { id: 'read', label: 'Read-only' },
        ] as const).map((option) => {
          const active = replicaClass === option.id
          return (
            <Pressable
              key={option.id}
              style={[
                orgPanelStyles.segmentChip,
                { minHeight: 44, justifyContent: 'center' },
                active && orgPanelStyles.segmentChipActive,
                webPointer,
              ]}
              disabled={disabled}
              onPress={() => onSelectReplicaClass(option.id)}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              accessibilityLabel={option.label}
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
      <Text style={orgPanelStyles.detailLabel}>Server</Text>
      {servers
        .filter((s) => s.id !== primaryServerId)
        .map((server) => (
          <ServerOptionRow
            key={server.id}
            server={server}
            eligibilityRow={eligibilityById.get(server.id)}
            selected={selectedServerId === server.id}
            disabled={disabled}
            onSelect={() => onSelectServer(server.id)}
            onOpenNetworkReason={(reason) =>
              onOpenNetworkReason(reason, server.id)
            }
          />
        ))}
      <Pressable
        style={[styles.toggleRow, webPointer]}
        onPress={onToggleReadEligible}
        disabled={disabled}
      >
        <View
          style={[styles.checkbox, readEligible && styles.checkboxChecked]}
        >
          {readEligible ? (
            <Text style={styles.checkboxMark}>✓</Text>
          ) : null}
        </View>
        <Text style={styles.toggleLabel}>Eligible for read traffic</Text>
      </Pressable>
      <View style={styles.addActions}>
        <Pressable
          style={[
            orgPanelStyles.toolbarBtnPrimary,
            webPointer,
            (disabled || !selectedServerId) && styles.disabled,
          ]}
          disabled={disabled || !selectedServerId}
          onPress={onAddReplica}
        >
          <Text style={orgPanelStyles.toolbarBtnTextPrimary}>
            Add replica
          </Text>
        </Pressable>
        <Pressable
          style={[orgPanelStyles.toolbarBtnSecondary, webPointer]}
          onPress={onCancelAdd}
        >
          <Text style={orgPanelStyles.toolbarBtnTextSecondary}>Cancel</Text>
        </Pressable>
      </View>
    </View>
  )
}

function AddReplicaBlock({
  showAdd,
  disabled,
  servers,
  primaryServerId,
  eligibilityById,
  selectedServerId,
  onSelectServer,
  replicaClass,
  onSelectReplicaClass,
  readEligible,
  onToggleReadEligible,
  onOpenNetworkReason,
  onAddReplica,
  onShowAdd,
  onCancelAdd,
}: Readonly<{
  showAdd: boolean
  disabled: boolean
  servers: readonly OrgServerRecord[]
  primaryServerId: string | null
  eligibilityById: ReadonlyMap<string, ReplicaServerEligibility>
  selectedServerId: string | null
  onSelectServer: (serverId: string) => void
  replicaClass: ManagedReplicaClass
  onSelectReplicaClass: (replicaClass: ManagedReplicaClass) => void
  readEligible: boolean
  onToggleReadEligible: () => void
  onOpenNetworkReason: (reason: ReplicaIneligibleReason, serverId: string) => void
  onAddReplica: () => void
  onShowAdd: () => void
  onCancelAdd: () => void
}>) {
  if (showAdd) {
    return (
      <AddReplicaForm
        servers={servers}
        primaryServerId={primaryServerId}
        eligibilityById={eligibilityById}
        selectedServerId={selectedServerId}
        disabled={disabled}
        onSelectServer={onSelectServer}
        onOpenNetworkReason={onOpenNetworkReason}
        replicaClass={replicaClass}
        onSelectReplicaClass={onSelectReplicaClass}
        readEligible={readEligible}
        onToggleReadEligible={onToggleReadEligible}
        onAddReplica={onAddReplica}
        onCancelAdd={onCancelAdd}
      />
    )
  }

  return (
    <Pressable
      style={[orgPanelStyles.toolbarBtnSecondary, webPointer, disabled && styles.disabled]}
      disabled={disabled}
      onPress={onShowAdd}
    >
      <Text style={orgPanelStyles.toolbarBtnTextSecondary}>Add replica</Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  list: {
    gap: spacing.sm,
  },
  row: {
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: 8,
    padding: spacing.sm,
    gap: spacing.sm,
    backgroundColor: colors.bgSecondary,
  },
  rowMain: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  rowBody: {
    flex: 1,
    gap: 4,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 5,
  },
  dotPrimary: {
    backgroundColor: colors.green,
  },
  dotReplica: {
    backgroundColor: colors.borderMuted,
    borderWidth: 1,
    borderColor: colors.textMuted,
  },
  dotWarn: {
    backgroundColor: colors.pending,
  },
  dotMuted: {
    backgroundColor: colors.textDim,
  },
  roleLine: {
    flexWrap: 'wrap',
  },
  roleLabel: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '600',
  },
  metaText: {
    color: colors.textBody,
    fontSize: 13,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.xs,
  },
  readsChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: chrome.accent,
    backgroundColor: chrome.bgActive,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  readsChipText: {
    color: chrome.accent,
    fontSize: 11,
    fontWeight: '600',
  },
  healthText: {
    color: colors.textMuted,
    fontSize: 12,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  armedRow: {
    gap: spacing.xs,
    width: '100%',
  },
  danger: {
    color: colors.error,
  },
  promoteCard: {
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgInput,
    color: colors.text,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 6,
    minHeight: 44,
  },
  addBlock: {
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  addForm: {
    gap: spacing.sm,
  },
  pickerRow: {
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: 8,
    padding: spacing.sm,
    gap: 4,
  },
  pickerRowSelected: {
    borderColor: chrome.accent,
    backgroundColor: chrome.bgActive,
  },
  pickerLabel: {
    color: colors.text,
    fontSize: 13,
  },
  pickerDisabled: {
    color: colors.textMuted,
  },
  reasonRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    alignItems: 'center',
  },
  reasonText: {
    color: colors.textMuted,
    fontSize: 12,
  },
  linkText: {
    color: chrome.accent,
    fontSize: 12,
    fontWeight: '600',
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    borderColor: chrome.accent,
    backgroundColor: chrome.bgActive,
  },
  checkboxMark: {
    color: chrome.accent,
    fontSize: 12,
    fontWeight: '700',
  },
  toggleLabel: {
    color: colors.textBody,
    fontSize: 13,
  },
  addActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  disabled: {
    opacity: 0.55,
  },
})
