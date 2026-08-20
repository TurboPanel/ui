import * as Clipboard from 'expo-clipboard'
import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { orgPanelStyles, webPointer } from '@/components/org/org-panel-styles'
import { SectionPanel } from '@/components/org/section-panel'
import {
  CA_ROTATION_IN_PROGRESS_ERROR,
  CA_ROTATION_NOT_CONVERGED_ERROR,
  downloadOrganizationCaPem,
  NO_PENDING_ROTATION_ERROR,
  type CaRotationResult,
  type CaRotationStatus,
  type CommandRecord,
  type OrganizationCaLeafHealth,
  type OrganizationCaRecord,
  type OrgServerRecord,
} from '@/lib/instance-api'
import { useOrganizationsQuery } from '@/lib/queries/auth'
import {
  hasPendingTrackedCommands,
  mergeTrackedCommandEntries,
  useCommandsBatch,
  type TrackedCommandEntry,
} from '@/lib/queries/commands'
import { useOrganizationCa } from '@/lib/queries/managed'
import { useOrgServers } from '@/lib/queries/servers'
import {
  useOrganizationCaRotation,
  useRetireOrganizationCa,
  useRotateOrganizationCa,
} from '@/lib/queries/tls'
import { useCan, queryKeys } from '@/lib/query-client'
import { colors, spacing } from '@/lib/theme'

const CA_NEAR_EXPIRY_MS = 30 * 24 * 60 * 60 * 1000
const FINGERPRINT_VISIBLE_CHARS = 16

function queuedRotationEntries(
  results: readonly CaRotationResult[],
): TrackedCommandEntry[] {
  const entries: TrackedCommandEntry[] = []
  for (const row of results) {
    if (!row.commandId) continue
    entries.push({ serverId: row.serverId, commandId: row.commandId })
  }
  return entries
}

function rotationResultKey(row: CaRotationResult): string {
  return [row.serverId, row.commandId ?? '', row.managedId ?? '', row.kind ?? ''].join(':')
}

function resultsMapFrom(
  results: readonly CaRotationResult[],
): Map<string, CaRotationResult> {
  const map = new Map<string, CaRotationResult>()
  for (const row of results) {
    map.set(rotationResultKey(row), row)
  }
  return map
}

function visibleRotationResults(
  seeded: Map<string, CaRotationResult>,
  journal: readonly CaRotationResult[] | undefined,
): CaRotationResult[] {
  if (seeded.size > 0) return Array.from(seeded.values())
  return journal ? [...journal] : []
}

function caCommonName(tls: OrganizationCaRecord): string {
  const subject = tls.metadata.subject?.trim()
  if (subject) return subject
  const dnsName = tls.metadata.dnsNames[0]?.trim()
  if (dnsName) return dnsName
  return 'Organization CA'
}

function truncateFingerprint(fingerprint: string): string {
  if (fingerprint.length <= FINGERPRINT_VISIBLE_CHARS) return fingerprint
  return `${fingerprint.slice(0, FINGERPRINT_VISIBLE_CHARS)}…`
}

function formatTlsDate(value: string | null | undefined): string {
  if (!value) return '—'
  const parsed = Date.parse(value)
  if (Number.isNaN(parsed)) return value
  return new Date(parsed).toLocaleString()
}

function isNearExpiry(notAfter: string | null | undefined, now = Date.now()): boolean {
  if (!notAfter) return false
  const parsed = Date.parse(notAfter)
  if (Number.isNaN(parsed)) return false
  return parsed - now <= CA_NEAR_EXPIRY_MS
}

function caWarningMessages(input: Readonly<{
  notAfter: string | null | undefined
  rotation: CaRotationStatus | null | undefined
  leafHealth: OrganizationCaLeafHealth | undefined
}>): string[] {
  const messages: string[] = []
  if (isNearExpiry(input.notAfter)) {
    messages.push('This Organization CA expires soon.')
  }
  if (input.rotation && input.rotation.state !== 'completed') {
    messages.push(
      'A previous Organization CA generation is still trusted during rotation.',
    )
  }
  const dueCount = input.leafHealth?.dueCount ?? 0
  if (dueCount > 0) {
    const noun = dueCount === 1 ? 'leaf certificate needs' : 'leaf certificates need'
    messages.push(`${String(dueCount)} ${noun} renewal.`)
  }
  return messages
}

function serverLabel(
  serverId: string,
  names: ReadonlyMap<string, string>,
): string {
  return names.get(serverId) ?? serverId
}

function liveResultStatus(
  row: CaRotationResult,
  commandsById: ReadonlyMap<string, CommandRecord>,
): string {
  if (!row.commandId) return row.status
  return commandsById.get(row.commandId)?.status ?? row.status
}

function liveResultError(
  row: CaRotationResult,
  commandsById: ReadonlyMap<string, CommandRecord>,
): string | undefined {
  if (!row.commandId) return row.error
  return commandsById.get(row.commandId)?.error ?? row.error
}

function isTerminalSuccessStatus(status: string): boolean {
  return status === 'succeeded'
}

function allResultsTerminalSuccess(
  results: readonly CaRotationResult[],
  commandsById: ReadonlyMap<string, CommandRecord>,
): boolean {
  if (results.length === 0) return false
  return results.every((row) =>
    isTerminalSuccessStatus(liveResultStatus(row, commandsById)),
  )
}

function retireErrorCopy(message: string): string {
  if (message.includes(CA_ROTATION_NOT_CONVERGED_ERROR)) {
    return "Some servers haven't converged yet"
  }
  if (message.includes(NO_PENDING_ROTATION_ERROR)) {
    return 'No rotation pending'
  }
  if (message.includes(CA_ROTATION_IN_PROGRESS_ERROR)) {
    return 'A rotation is already in progress'
  }
  return message
}

function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error && err.message.length > 0) return err.message
  return fallback
}

function orgConfirmName(
  orgId: string,
  organizations: readonly { id: string; name: string | null }[] | undefined,
): string {
  const match = organizations?.find((org) => org.id === orgId)
  return match?.name?.trim() || orgId
}

function serverNameMap(
  servers: readonly OrgServerRecord[] | undefined,
): Map<string, string> {
  const map = new Map<string, string>()
  for (const server of servers ?? []) {
    map.set(
      server.id,
      server.name?.trim() || server.hostname?.trim() || server.id,
    )
  }
  return map
}

function commandByIdMap(
  commands: readonly CommandRecord[] | undefined,
): Map<string, CommandRecord> {
  const map = new Map<string, CommandRecord>()
  for (const command of commands ?? []) {
    map.set(command.id, command)
  }
  return map
}

function isActiveRotation(
  rotation: CaRotationStatus | null | undefined,
): rotation is CaRotationStatus {
  return rotation != null && rotation.state !== 'completed'
}

function retireBlockerReason(
  showRetire: boolean,
  retireEnabled: boolean,
): string | null {
  if (!showRetire || retireEnabled) return null
  return retireErrorCopy(CA_ROTATION_NOT_CONVERGED_ERROR)
}

async function downloadCaBundle(): Promise<void> {
  const pem = await downloadOrganizationCaPem()
  await Clipboard.setStringAsync(pem)
  if (typeof document === 'undefined') return
  const blob = new Blob([pem], { type: 'application/x-pem-file' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = 'turbopanel-org-ca.pem'
  anchor.click()
  URL.revokeObjectURL(url)
}

function generationLabel(generation: number | null): string {
  if (generation == null) return '—'
  return String(generation)
}

function downloadSuccessMessage(): string {
  if (typeof document !== 'undefined') {
    return 'Organization CA copied and downloaded'
  }
  return 'Organization CA copied'
}

function caLoadError(isError: boolean, error: unknown): string | null {
  if (!isError) return null
  return errorMessage(error, 'Failed to load Organization CA')
}

function CaWarningCallout({ messages }: Readonly<{ messages: readonly string[] }>) {
  if (messages.length === 0) return null
  return (
    <View style={orgPanelStyles.calloutWarning}>
      {messages.map((message) => (
        <Text key={message} style={orgPanelStyles.calloutWarningText}>
          {message}
        </Text>
      ))}
    </View>
  )
}

function ActiveCaCard({
  tls,
  warnings,
}: Readonly<{ tls: OrganizationCaRecord; warnings: readonly string[] }>) {
  return (
    <View style={orgPanelStyles.detailCard}>
      <Text style={orgPanelStyles.detailTitle}>{caCommonName(tls)}</Text>
      <Text style={orgPanelStyles.detailLine}>
        <Text style={orgPanelStyles.detailLabel}>Fingerprint: </Text>
        {truncateFingerprint(tls.metadata.fingerprintSha256)}
      </Text>
      <Text style={orgPanelStyles.detailLine}>
        <Text style={orgPanelStyles.detailLabel}>Generation: </Text>
        {generationLabel(tls.caGeneration)}
      </Text>
      <Text style={orgPanelStyles.muted}>
        Valid {formatTlsDate(tls.metadata.notBefore)} →{' '}
        {formatTlsDate(tls.metadata.notAfter)}
      </Text>
      <CaWarningCallout messages={warnings} />
    </View>
  )
}

function CaActionToolbar({
  canManage,
  caBusy,
  rotateBusy,
  onDownload,
  onRotate,
}: Readonly<{
  canManage: boolean
  caBusy: boolean
  rotateBusy: boolean
  onDownload: () => void
  onRotate: () => void
}>) {
  return (
    <View style={styles.toolbar}>
      <Pressable
        style={[
          orgPanelStyles.toolbarBtnSecondary,
          webPointer,
          caBusy && styles.buttonDisabled,
        ]}
        disabled={caBusy}
        onPress={onDownload}
        accessibilityRole="button"
        accessibilityLabel="Download CA bundle"
      >
        <Text style={orgPanelStyles.toolbarBtnTextSecondary}>
          {caBusy ? 'Downloading…' : 'Download CA bundle'}
        </Text>
      </Pressable>
      {canManage ? (
        <Pressable
          style={[
            orgPanelStyles.toolbarBtnSecondary,
            styles.destructiveBtn,
            rotateBusy && styles.buttonDisabled,
            webPointer,
          ]}
          disabled={rotateBusy}
          onPress={onRotate}
          accessibilityRole="button"
          accessibilityLabel="Rotate Organization CA"
          accessibilityState={{ disabled: rotateBusy }}
        >
          <Text style={styles.destructiveBtnText}>Rotate</Text>
        </Pressable>
      ) : null}
    </View>
  )
}

function RotationProgressList({
  results,
  serverNames,
  commandsById,
}: Readonly<{
  results: readonly CaRotationResult[]
  serverNames: ReadonlyMap<string, string>
  commandsById: ReadonlyMap<string, CommandRecord>
}>) {
  return (
    <View style={styles.progressList}>
      {results.map((row) => (
        <RotationProgressRow
          key={rotationResultKey(row)}
          row={row}
          serverNames={serverNames}
          commandsById={commandsById}
        />
      ))}
    </View>
  )
}

function RetirePreviousCaButton({
  enabled,
  pending,
  blockerReason,
  onPress,
}: Readonly<{
  enabled: boolean
  pending: boolean
  blockerReason: string | null
  onPress: () => void
}>) {
  const disabled = !enabled || pending
  return (
    <View style={styles.retireBlock}>
      <Pressable
        style={[
          orgPanelStyles.toolbarBtnSecondary,
          disabled && styles.buttonDisabled,
          webPointer,
        ]}
        disabled={disabled}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel="Retire previous Organization CA"
        accessibilityHint={blockerReason ?? undefined}
        accessibilityState={{ disabled, busy: pending }}
      >
        <Text style={orgPanelStyles.toolbarBtnTextSecondary}>
          {pending ? 'Retiring…' : 'Retire previous CA'}
        </Text>
      </Pressable>
      {blockerReason ? (
        <Text style={orgPanelStyles.muted}>{blockerReason}</Text>
      ) : null}
    </View>
  )
}

function RotationProgressRow({
  row,
  serverNames,
  commandsById,
}: Readonly<{
  row: CaRotationResult
  serverNames: ReadonlyMap<string, string>
  commandsById: ReadonlyMap<string, CommandRecord>
}>) {
  const status = liveResultStatus(row, commandsById)
  const error = liveResultError(row, commandsById)
  const badgeParts = [row.kind, row.managedId].filter(
    (part): part is string => Boolean(part),
  )

  return (
    <View style={orgPanelStyles.detailCard}>
      <Text style={orgPanelStyles.detailTitle}>
        {serverLabel(row.serverId, serverNames)}
      </Text>
      {badgeParts.length > 0 ? (
        <Text style={orgPanelStyles.muted}>{badgeParts.join(' · ')}</Text>
      ) : null}
      {status ? <Text style={orgPanelStyles.muted}>{status}</Text> : null}
      {error ? <Text style={orgPanelStyles.error}>{error}</Text> : null}
    </View>
  )
}

function RotateConfirmSection({
  confirmName,
  confirmText,
  onConfirmTextChange,
  confirming,
  onConfirm,
  onCancel,
}: Readonly<{
  confirmName: string
  confirmText: string
  onConfirmTextChange: (value: string) => void
  confirming: boolean
  onConfirm: () => void
  onCancel: () => void
}>) {
  const matches = confirmText.trim() === confirmName
  const confirmDisabled = !matches || confirming
  return (
    <View style={orgPanelStyles.expandedSection}>
      <Text style={styles.stepLabel}>Confirm Organization CA rotation</Text>
      <Text style={styles.stepCopy}>
        Clients pinned with <Text style={styles.confirmName}>verify-ca</Text> or{' '}
        <Text style={styles.confirmName}>verify-full</Text> must pick up the new
        bundle. Binding-consuming services need a redeploy. Type{' '}
        <Text style={styles.confirmName}>{confirmName}</Text> to rotate.
      </Text>
      <TextInput
        style={Platform.OS === 'web' ? styles.webInput : styles.input}
        value={confirmText}
        onChangeText={onConfirmTextChange}
        placeholder={confirmName}
        placeholderTextColor={colors.textDim}
        autoCapitalize="none"
        autoCorrect={false}
        editable={!confirming}
      />
      <View style={styles.actions}>
        <Pressable
          style={[orgPanelStyles.toolbarBtnSecondary, webPointer]}
          disabled={confirming}
          onPress={onCancel}
          accessibilityRole="button"
          accessibilityLabel="Cancel Organization CA rotation"
        >
          <Text style={orgPanelStyles.toolbarBtnTextSecondary}>Cancel</Text>
        </Pressable>
        <Pressable
          style={[
            orgPanelStyles.toolbarBtnSecondary,
            styles.destructiveBtn,
            confirmDisabled && styles.buttonDisabled,
            webPointer,
          ]}
          disabled={confirmDisabled}
          onPress={onConfirm}
          accessibilityRole="button"
          accessibilityLabel="Confirm Organization CA rotation"
          accessibilityState={{ disabled: confirmDisabled, busy: confirming }}
        >
          <Text style={styles.destructiveBtnText}>
            {confirming ? 'Rotating…' : 'Rotate Organization CA'}
          </Text>
        </Pressable>
      </View>
    </View>
  )
}

function OrganizationCaReady({
  tls,
  warnings,
  canManage,
  caBusy,
  rotateBusy,
  caMessage,
  showConfirm,
  confirmName,
  confirmText,
  confirming,
  showProgress,
  results,
  serverNames,
  commandsById,
  showRetire,
  retireEnabled,
  retirePending,
  retireBlocker,
  onDownload,
  onRevealConfirm,
  onConfirmTextChange,
  onRotateConfirm,
  onCancelConfirm,
  onRetire,
}: Readonly<{
  tls: OrganizationCaRecord
  warnings: readonly string[]
  canManage: boolean
  caBusy: boolean
  rotateBusy: boolean
  caMessage: string | null
  showConfirm: boolean
  confirmName: string
  confirmText: string
  confirming: boolean
  showProgress: boolean
  results: readonly CaRotationResult[]
  serverNames: ReadonlyMap<string, string>
  commandsById: ReadonlyMap<string, CommandRecord>
  showRetire: boolean
  retireEnabled: boolean
  retirePending: boolean
  retireBlocker: string | null
  onDownload: () => void
  onRevealConfirm: () => void
  onConfirmTextChange: (value: string) => void
  onRotateConfirm: () => void
  onCancelConfirm: () => void
  onRetire: () => void
}>) {
  return (
    <>
      <ActiveCaCard tls={tls} warnings={warnings} />
      <CaActionToolbar
        canManage={canManage}
        caBusy={caBusy}
        rotateBusy={rotateBusy}
        onDownload={onDownload}
        onRotate={onRevealConfirm}
      />
      {caMessage ? <Text style={orgPanelStyles.muted}>{caMessage}</Text> : null}
      {canManage && showConfirm ? (
        <RotateConfirmSection
          confirmName={confirmName}
          confirmText={confirmText}
          onConfirmTextChange={onConfirmTextChange}
          confirming={confirming}
          onConfirm={onRotateConfirm}
          onCancel={onCancelConfirm}
        />
      ) : null}
      {showProgress ? (
        <RotationProgressList
          results={results}
          serverNames={serverNames}
          commandsById={commandsById}
        />
      ) : null}
      {canManage && showRetire ? (
        <RetirePreviousCaButton
          enabled={retireEnabled}
          pending={retirePending}
          blockerReason={retireBlocker}
          onPress={onRetire}
        />
      ) : null}
    </>
  )
}

function OrganizationCaBody({
  loading,
  tls,
  ...readyProps
}: Readonly<{ loading: boolean; tls: OrganizationCaRecord | undefined }> &
  Omit<Parameters<typeof OrganizationCaReady>[0], 'tls'>) {
  if (loading) {
    return <Text style={orgPanelStyles.muted}>Loading…</Text>
  }
  if (!tls) {
    return (
      <Text style={orgPanelStyles.muted}>Organization CA is not available.</Text>
    )
  }
  return <OrganizationCaReady tls={tls} {...readyProps} />
}

export function OrganizationCaPanel({ orgId }: Readonly<{ orgId: string }>) {
  const canManage = useCan('organization', orgId, 'organization:manage')
  const queryClient = useQueryClient()
  const caQuery = useOrganizationCa(orgId)
  const rotationQuery = useOrganizationCaRotation(orgId)
  const orgsQuery = useOrganizationsQuery()
  const serversQuery = useOrgServers(orgId)

  const [tracked, setTracked] = useState<TrackedCommandEntry[]>([])
  const [resultsById, setResultsById] = useState<Map<string, CaRotationResult>>(
    () => new Map(),
  )
  const [showConfirm, setShowConfirm] = useState(false)
  const [confirmText, setConfirmText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [caBusy, setCaBusy] = useState(false)
  const [caMessage, setCaMessage] = useState<string | null>(null)

  const commandsQuery = useCommandsBatch(orgId, tracked)
  const rotateMutation = useRotateOrganizationCa(orgId)
  const retireMutation = useRetireOrganizationCa(orgId)

  useEffect(() => {
    const rotation = rotationQuery.data
    if (rotation === undefined) return
    if (!isActiveRotation(rotation)) {
      setTracked([])
      setResultsById(new Map())
      return
    }
    setResultsById(resultsMapFrom(rotation.results))
    setTracked((prev) =>
      mergeTrackedCommandEntries(prev, queuedRotationEntries(rotation.results)),
    )
  }, [rotationQuery.data])

  const serverNames = useMemo(
    () => serverNameMap(serversQuery.data?.servers),
    [serversQuery.data?.servers],
  )
  const commandsById = useMemo(
    () => commandByIdMap(commandsQuery.data),
    [commandsQuery.data],
  )

  const tls = caQuery.data?.tls
  const rotation = rotationQuery.data
  const results = visibleRotationResults(resultsById, rotation?.results)
  const pending = hasPendingTrackedCommands(tracked, commandsQuery.data)
  const rotateBusy =
    pending || rotateMutation.isPending || retireMutation.isPending
  const confirmName = orgConfirmName(orgId, orgsQuery.data?.organizations)
  const warnings = caWarningMessages({
    notAfter: tls?.metadata.notAfter,
    rotation,
    leafHealth: caQuery.data?.leafHealth,
  })
  const displayError =
    error ?? caLoadError(caQuery.isError, caQuery.error)
  const showRetire = rotation?.state === 'awaiting_retire'
  const retireEnabled =
    !pending && allResultsTerminalSuccess(results, commandsById)

  const applyRotationSuccess = (
    rotationResults: readonly CaRotationResult[],
  ) => {
    setTracked((prev) =>
      mergeTrackedCommandEntries(prev, queuedRotationEntries(rotationResults)),
    )
    setResultsById(resultsMapFrom(rotationResults))
    setShowConfirm(false)
    setConfirmText('')
    void queryClient.invalidateQueries({
      queryKey: queryKeys.org(orgId).tlsCaRotation,
    })
  }

  const onDownload = () => {
    setCaBusy(true)
    setError(null)
    setCaMessage(null)
    void downloadCaBundle()
      .then(() => setCaMessage(downloadSuccessMessage()))
      .catch((err: unknown) => {
        setError(errorMessage(err, 'Failed to download Organization CA'))
      })
      .finally(() => setCaBusy(false))
  }

  const onRotateConfirm = () => {
    if (rotateBusy) return
    setError(null)
    rotateMutation.mutate(undefined, {
      onSuccess: (data) => applyRotationSuccess(data.results),
      onError: (err) => {
        setError(errorMessage(err, 'Failed to rotate Organization CA'))
      },
    })
  }

  const onRetire = () => {
    if (pending || retireMutation.isPending) return
    setError(null)
    retireMutation.mutate(undefined, {
      onError: (err) => {
        setError(
          retireErrorCopy(errorMessage(err, 'Failed to retire Organization CA')),
        )
      },
    })
  }

  return (
    <SectionPanel
      title="Organization CA"
      hint="Long-lived organization root. Managed databases and SQL clients trust this CA."
    >
      <OrganizationCaBody
        loading={caQuery.isLoading}
        tls={tls}
        warnings={warnings}
        canManage={canManage}
        caBusy={caBusy}
        rotateBusy={rotateBusy}
        caMessage={caMessage}
        showConfirm={showConfirm}
        confirmName={confirmName}
        confirmText={confirmText}
        confirming={rotateMutation.isPending}
        showProgress={isActiveRotation(rotation)}
        results={results}
        serverNames={serverNames}
        commandsById={commandsById}
        showRetire={showRetire}
        retireEnabled={retireEnabled}
        retirePending={retireMutation.isPending}
        retireBlocker={retireBlockerReason(showRetire, retireEnabled)}
        onDownload={onDownload}
        onRevealConfirm={() => {
          setError(null)
          setShowConfirm(true)
        }}
        onConfirmTextChange={setConfirmText}
        onRotateConfirm={onRotateConfirm}
        onCancelConfirm={() => {
          setShowConfirm(false)
          setConfirmText('')
        }}
        onRetire={onRetire}
      />
      {displayError ? (
        <Text style={orgPanelStyles.error}>{displayError}</Text>
      ) : null}
    </SectionPanel>
  )
}

const styles = StyleSheet.create({
  toolbar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  progressList: {
    gap: spacing.sm,
  },
  retireBlock: {
    gap: spacing.sm,
  },
  destructiveBtn: {
    borderColor: colors.error,
  },
  destructiveBtnText: {
    color: colors.errorText,
    fontSize: 13,
    fontWeight: '600',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  stepLabel: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700',
  },
  stepCopy: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 20,
  },
  confirmName: {
    color: colors.text,
    fontWeight: '700',
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgInput,
    color: colors.text,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    borderRadius: 6,
  },
  webInput: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgInput,
    color: colors.text,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    borderRadius: 6,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
})
