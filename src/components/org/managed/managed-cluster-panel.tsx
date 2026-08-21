import { useMemo, useState } from 'react'
import { useRouter, type Href } from 'expo-router'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { SectionPanel } from '@/components/org/section-panel'
import { orgPanelStyles, webPointer } from '@/components/org/org-panel-styles'
import {
  Button,
  ButtonRow,
  Checkbox,
  ConfirmButton,
  EmptyState,
  SegmentedControl,
  TextField,
} from '@/components/ui'
import type {
  ManagedMemberRecord,
  ManagedRecoveryRecord,
  ManagedReplicaClass,
} from '@/lib/managed-services'
import {
  formatReplicationLag,
  managedErrorMessage,
  managedRecoveryBanner,
  managedReplicaPromoteAction,
  MEMBER_MANUAL_DR_CANDIDATE_LABEL,
  memberReadTrafficLabel,
  memberReplicaClassLabel,
  memberReplicaClassPickerLabel,
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
import { orEmptyArray } from '@/lib/or-empty-array'
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
  usePromoteManagedDisasterRecovery,
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
  recovery,
  managedDisplayName,
  canManage,
  busy,
  lastError,
  onRegisterCommand,
}: Readonly<{
  orgId: string
  environmentId: string
  members: readonly ManagedMemberRecord[]
  recovery?: ManagedRecoveryRecord | null
  managedDisplayName: string
  canManage: boolean
  busy: boolean
  lastError?: string | null
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
  const promoteDisaster = usePromoteManagedDisasterRecovery(orgId, environmentId)

  const [error, setError] = useState<string | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [selectedServerId, setSelectedServerId] = useState<string | null>(null)
  const [replicaClass, setReplicaClass] = useState<ManagedReplicaClass>('failover')
  const [readEligible, setReadEligible] = useState(true)
  const [promoteMemberId, setPromoteMemberId] = useState<string | null>(null)
  const [disasterMemberId, setDisasterMemberId] = useState<string | null>(null)
  const [promoteConfirmName, setPromoteConfirmName] = useState('')
  const [forceEscalate, setForceEscalate] = useState(false)
  const [forceGateMessage, setForceGateMessage] = useState<string | null>(null)
  const [working, setWorking] = useState(false)

  const servers = orEmptyArray(serversQuery.data?.servers)
  const datacenters = orEmptyArray(datacentersQuery.data?.datacenters)
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
          name: s.name,
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

  const recoveryBanner = managedRecoveryBanner(recovery)
  const disasterMember = disasterMemberId
    ? members.find((member) => member.id === disasterMemberId) ?? null
    : null
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
      member.serverName?.trim() ||
      serverById.get(member.serverId)?.name?.trim() ||
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
    } catch (err) {
      setError(managedErrorMessage(err, 'Failed to convert replica class'))
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
    } catch (err) {
      setError(managedErrorMessage(err, 'Failed to remove replica'))
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

  const runDisasterRecovery = async (memberId: string) => {
    setWorking(true)
    setError(null)
    try {
      const result = await promoteDisaster.mutateAsync(memberId)
      onRegisterCommand(result.commandId, 'Disaster recovery', result.serverId)
      setDisasterMemberId(null)
      setPromoteConfirmName('')
    } catch (err) {
      setError(managedErrorMessage(err, 'Failed to start disaster recovery'))
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
      hint={`Failover stays on the datacenter LAN · remote/read replicas may use ${TURBOFABRIC_PRODUCT_NAME} or public TLS`}
      accent
    >
      {error ? <Text style={orgPanelStyles.error}>{error}</Text> : null}
      {lastError ? (
        <Text style={orgPanelStyles.error} accessibilityRole="alert">
          {lastError}
        </Text>
      ) : null}
      {recoveryBanner ? (
        <View
          style={orgPanelStyles.calloutWarning}
          accessibilityRole="alert"
          accessibilityLabel={recoveryBanner.text}
        >
          <Text style={orgPanelStyles.calloutWarningText}>
            {recoveryBanner.text}
          </Text>
        </View>
      ) : null}

      <View style={styles.list}>
        {members.map((member) => (
          <ClusterMemberRow
            key={member.id}
            member={member}
            canManage={canManage}
            disabled={disabled}
            serverLabel={serverLabel(member)}
            siteLabel={siteLabel(member.serverId)}
            onToggleReads={() => {
              void handleToggleReads(member, !member.readEligible)
            }}
            onConfirmRemove={() => {
              void handleRemove(member.id)
            }}
            onConfirmConvert={() => {
              void handleConvertToFailover(member.id)
            }}
            onStartPromote={() => {
              setPromoteMemberId(member.id)
              setDisasterMemberId(null)
              setPromoteConfirmName('')
              setForceEscalate(false)
              setForceGateMessage(null)
            }}
            onStartDisasterRecovery={() => {
              setDisasterMemberId(member.id)
              setPromoteMemberId(null)
              setPromoteConfirmName('')
            }}
          />
        ))}
        {members.length === 0 ? (
          <EmptyState title="No cluster members yet." />
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

      {disasterMemberId && disasterMember ? (
        <DisasterRecoveryDialog
          primaryLabel={primary ? serverLabel(primary) : null}
          targetLabel={serverLabel(disasterMember)}
          targetSite={siteLabel(disasterMember.serverId)}
          lagLabel={formatReplicationLag(disasterMember.replication) || 'unknown lag'}
          confirmName={confirmName}
          promoteConfirmName={promoteConfirmName}
          onChangePromoteConfirmName={setPromoteConfirmName}
          disabled={disabled}
          promoteTypedOk={promoteTypedOk}
          onConfirm={() => {
            void runDisasterRecovery(disasterMemberId)
          }}
          onCancel={() => {
            setDisasterMemberId(null)
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
  onToggleReads,
  onConfirmRemove,
  onConfirmConvert,
  onStartPromote,
  onStartDisasterRecovery,
}: Readonly<{
  member: ManagedMemberRecord
  canManage: boolean
  disabled: boolean
  serverLabel: string
  siteLabel: string
  onToggleReads: () => void
  onConfirmRemove: () => void
  onConfirmConvert: () => void
  onStartPromote: () => void
  onStartDisasterRecovery: () => void
}>) {
  const healthy = isHealthyMemberStatus(member.status)
  const healthLine = resolveHealthLine(member)
  const classLabel = memberReplicaClassLabel(member.replicaClass)
  const promoteAction = managedReplicaPromoteAction(member.replicaClass)
  const isReadReplica = promoteAction === 'disaster-recovery'
  const liveReads = member.role === 'primary' || member.readEligible

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
            <View style={liveReads ? styles.readsChip : styles.standbyChip}>
              <Text
                style={liveReads ? styles.readsChipText : styles.standbyChipText}
              >
                {memberReadTrafficLabel(member.role, member.readEligible)}
              </Text>
            </View>
            {isReadReplica ? (
              <View style={styles.standbyChip}>
                <Text style={styles.standbyChipText}>
                  {MEMBER_MANUAL_DR_CANDIDATE_LABEL}
                </Text>
              </View>
            ) : null}
            <Text style={styles.healthText}>{healthLine}</Text>
          </View>
        </View>
      </View>

      {canManage && member.role === 'replica' ? (
        <ButtonRow>
          <Button
            label={
              member.readEligible ? 'Stop serving reads' : 'Serve read traffic'
            }
            size="sm"
            disabled={disabled}
            onPress={onToggleReads}
          />
          <ConfirmButton
            label="Remove replica"
            confirmLabel="Confirm remove"
            prompt="Removes this replica and destroys its data volume."
            disabled={disabled}
            onConfirm={onConfirmRemove}
          />
          {isReadReplica ? (
            <>
              <ConfirmButton
                label="Convert to failover"
                confirmLabel="Confirm convert"
                prompt="Converts this replica to failover. It must share the primary's datacenter LAN."
                disabled={disabled}
                onConfirm={onConfirmConvert}
              />
              <Button
                label="Promote for disaster recovery"
                size="sm"
                disabled={disabled}
                onPress={onStartDisasterRecovery}
              />
            </>
          ) : (
            <Button
              label="Promote"
              size="sm"
              disabled={disabled}
              onPress={onStartPromote}
            />
          )}
        </ButtonRow>
      ) : null}
    </View>
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
      <TextField
        label="Confirmation"
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
          <Button
            label="Promote anyway"
            variant="primary"
            disabled={promoteDisabled}
            onPress={onConfirmPromote}
          />
        </View>
      ) : (
        <Button
          label="Confirm promote"
          variant="primary"
          disabled={promoteDisabled}
          onPress={onConfirmPromote}
        />
      )}
      <Button label="Cancel" onPress={onCancel} />
    </View>
  )
}

function DisasterRecoveryDialog({
  primaryLabel,
  targetLabel,
  targetSite,
  lagLabel,
  confirmName,
  promoteConfirmName,
  onChangePromoteConfirmName,
  disabled,
  promoteTypedOk,
  onConfirm,
  onCancel,
}: Readonly<{
  primaryLabel: string | null
  targetLabel: string
  targetSite: string
  lagLabel: string
  confirmName: string
  promoteConfirmName: string
  onChangePromoteConfirmName: (value: string) => void
  disabled: boolean
  promoteTypedOk: boolean
  onConfirm: () => void
  onCancel: () => void
}>) {
  const confirmDisabled = !promoteTypedOk || disabled

  return (
    <View style={[orgPanelStyles.detailCard, styles.promoteCard]}>
      <Text style={orgPanelStyles.detailTitle}>
        Promote for disaster recovery
      </Text>
      <Text style={orgPanelStyles.detailLine}>
        Current primary: {primaryLabel ?? '—'}
      </Text>
      <Text style={orgPanelStyles.detailLine}>
        Target: {targetLabel} · {targetSite} · {lagLabel}
      </Text>
      <View style={orgPanelStyles.calloutWarning}>
        <Text style={orgPanelStyles.calloutWarningText}>
          This accepts possible data loss. Unreplicated commits on the old
          primary will not be recovered. Remaining failover replicas outside
          the new primary datacenter become remote read replicas.
        </Text>
      </View>
      <Text style={orgPanelStyles.muted}>Type {confirmName} to confirm.</Text>
      <TextField
        label="Confirmation"
        value={promoteConfirmName}
        onChangeText={onChangePromoteConfirmName}
        autoCapitalize="none"
        autoCorrect={false}
        editable={!disabled}
        accessibilityLabel="Type the cluster name to confirm disaster recovery"
      />
      <Button
        label="Confirm disaster recovery"
        variant="primary"
        disabled={confirmDisabled}
        onPress={onConfirm}
        accessibilityLabel="Confirm disaster recovery"
      />
      <Button label="Cancel" onPress={onCancel} />
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
  const label = server.name?.trim() || server.hostname?.trim() || server.id
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
      accessibilityRole="radio"
      accessibilityState={{ selected, disabled: disabled || !eligible }}
      accessibilityLabel={label}
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
      <SegmentedControl
        options={[
          { value: 'failover', label: memberReplicaClassPickerLabel('failover') },
          { value: 'read', label: memberReplicaClassPickerLabel('read') },
        ]}
        value={replicaClass}
        disabled={disabled}
        accessibilityLabel="Replica class"
        onChange={(next) => onSelectReplicaClass(next as ManagedReplicaClass)}
      />
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
      <Checkbox
        label="Serve read traffic"
        checked={readEligible}
        disabled={disabled}
        onPress={onToggleReadEligible}
      />
      <ButtonRow>
        <Button
          label="Add replica"
          variant="primary"
          disabled={disabled || !selectedServerId}
          onPress={onAddReplica}
        />
        <Button label="Cancel" onPress={onCancelAdd} />
      </ButtonRow>
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

  return <Button label="Add replica" disabled={disabled} onPress={onShowAdd} />
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
  standbyChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.borderMuted,
    backgroundColor: colors.bgPanel,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  standbyChipText: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '600',
  },
  healthText: {
    color: colors.textMuted,
    fontSize: 12,
  },
  armedRow: {
    gap: spacing.xs,
    width: '100%',
  },
  promoteCard: {
    gap: spacing.sm,
    marginTop: spacing.sm,
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
})
