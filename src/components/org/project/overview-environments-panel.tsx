import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { orgPanelStyles, webPointer } from '@/components/org/org-panel-styles'
import { useProjectContext } from '@/components/org/project/project-context'
import { ServerPinSelect } from '@/components/org/project/server-pin-select'
import {
  environmentStatusTone,
  hasHostDeployedContainers,
} from '@/lib/container-status'
import { validateEnvironmentName } from '@/lib/environment-validation'
import {
  DeployHealthCheckMissingError,
  DeployResourceLimitExceededError,
  type CommandStatus,
  type ContainerRecord,
  type EnvironmentRecord,
  type OrgServerRecord,
} from '@/lib/instance-api'
import {
  isTerminalCommandStatus,
  useCommandsBatch,
  useContainersByEnvironments,
  useCreateEnvironment,
  useDeployEnvironment,
  useOrgServers,
  useRunEnvironmentLifecycle,
  useStopEnvironment,
  useUpdateEnvironment,
  type TrackedCommandEntry,
} from '@/lib/queries'
import { resolveEffectiveServerId } from '@/lib/project-options'
import { chrome, colors, spacing } from '@/lib/theme'

type ContainersByEnv = Record<string, ContainerRecord[]>

type TrackedCommand = {
  environmentId: string
  serverId: string
  label: string
  status: CommandStatus
  error: string | null
}

function environmentLabel(env: EnvironmentRecord): string {
  return env.displayName?.trim() || 'Environment'
}

function latestCommandForEnv(
  commands: Record<string, TrackedCommand>,
  environmentId: string,
): TrackedCommand | null {
  const rows = Object.values(commands).filter(
    (row) => row.environmentId === environmentId,
  )
  return rows.at(-1) ?? null
}

function quietButtonTextStyle(
  tone: 'neutral' | 'primary' | 'danger',
): {
  color: string
  fontSize: number
  fontWeight: '600' | '700'
} {
  if (tone === 'primary') return styles.quietBtnTextPrimary
  if (tone === 'danger') return styles.quietBtnTextDanger
  return styles.quietBtnText
}

function QuietButton({
  label,
  accessibilityLabel,
  onPress,
  disabled,
  tone = 'neutral',
}: Readonly<{
  label: string
  accessibilityLabel?: string
  onPress: () => void
  disabled?: boolean
  tone?: 'neutral' | 'primary' | 'danger'
}>) {
  return (
    <Pressable
      style={[
        styles.quietBtn,
        tone === 'primary' && styles.quietBtnPrimary,
        tone === 'danger' && styles.quietBtnDanger,
        disabled && styles.buttonDisabled,
        webPointer,
      ]}
      disabled={disabled}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
    >
      <Text style={quietButtonTextStyle(tone)}>{label}</Text>
    </Pressable>
  )
}

function EnvironmentCreateInline({
  value,
  fieldError,
  creating,
  onChange,
  onSubmit,
  onCancel,
}: Readonly<{
  value: string
  fieldError: string | null
  creating: boolean
  onChange: (value: string) => void
  onSubmit: () => void
  onCancel: () => void
}>) {
  return (
    <View style={styles.inlineForm}>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChange}
        placeholder="e.g. Staging"
        placeholderTextColor={colors.textDim}
        autoCapitalize="none"
        autoCorrect={false}
        editable={!creating}
        maxLength={255}
        accessibilityLabel="New environment name"
      />
      {fieldError ? <Text style={orgPanelStyles.error}>{fieldError}</Text> : null}
      <View style={styles.inlineActions}>
        <QuietButton
          label={creating ? 'Creating…' : 'Create'}
          accessibilityLabel={creating ? 'Creating environment' : 'Create environment'}
          tone="primary"
          disabled={creating}
          onPress={onSubmit}
        />
        <QuietButton label="Cancel" onPress={onCancel} />
      </View>
    </View>
  )
}

function LifecycleToolbar({
  hasServer,
  hasContainers,
  inFlight,
  busy,
  destroyArmed,
  destroyBusy,
  onStart,
  onStop,
  onToggleDestroy,
  onConfirmDestroy,
  onRefresh,
}: Readonly<{
  hasServer: boolean
  hasContainers: boolean
  inFlight: boolean
  busy: boolean
  destroyArmed: boolean
  destroyBusy: boolean
  onStart: () => void
  onStop: () => void
  onToggleDestroy: () => void
  onConfirmDestroy: () => void
  onRefresh: () => void
}>) {
  const startDisabled = !hasServer || busy
  let destroyLabel = 'Destroy'
  let destroyA11y = 'Destroy'
  if (destroyBusy) {
    destroyLabel = 'Destroying…'
    destroyA11y = 'Destroying environment'
  } else if (destroyArmed) {
    destroyLabel = 'Confirm'
    destroyA11y = 'Confirm destroy'
  }

  return (
    <View style={styles.actionsRow}>
      <QuietButton
        label={inFlight ? 'Working…' : 'Start'}
        accessibilityLabel={
          hasContainers
            ? 'Start environment'
            : 'Start environment for the first time'
        }
        tone="primary"
        disabled={startDisabled}
        onPress={onStart}
      />
      <QuietButton
        label="Stop"
        accessibilityLabel="Stop environment"
        disabled={busy}
        onPress={onStop}
      />
      <QuietButton
        label="Refresh"
        accessibilityLabel="Refresh environment status"
        disabled={busy && !destroyArmed}
        onPress={onRefresh}
      />
      <QuietButton
        label={destroyLabel}
        accessibilityLabel={destroyA11y}
        tone="danger"
        disabled={busy && !destroyArmed}
        onPress={destroyArmed ? onConfirmDestroy : onToggleDestroy}
      />
      {destroyArmed ? (
        <QuietButton label="Cancel" onPress={onToggleDestroy} />
      ) : null}
    </View>
  )
}

function ManageExtras({
  busy,
  showCreate,
  createName,
  createError,
  creating,
  onShowCreate,
  onCreateChange,
  onCreateSubmit,
  onCreateCancel,
}: Readonly<{
  busy: boolean
  showCreate: boolean
  createName: string
  createError: string | null
  creating: boolean
  onShowCreate: () => void
  onCreateChange: (value: string) => void
  onCreateSubmit: () => void
  onCreateCancel: () => void
}>) {
  if (showCreate) {
    return (
      <EnvironmentCreateInline
        value={createName}
        fieldError={createError}
        creating={creating}
        onChange={onCreateChange}
        onSubmit={onCreateSubmit}
        onCancel={onCreateCancel}
      />
    )
  }

  return (
    <View style={styles.extrasRow}>
      <QuietButton
        label="Add"
        accessibilityLabel="Add environment"
        disabled={busy}
        onPress={onShowCreate}
      />
    </View>
  )
}

function StatusAside({
  baseSelected,
  selectedEnvironment,
  loading,
  toneColor,
  toneLabel,
}: Readonly<{
  baseSelected: boolean
  selectedEnvironment: EnvironmentRecord | null
  loading: boolean
  toneColor: string
  toneLabel: string
}>) {
  if (baseSelected) {
    return null
  }
  if (!selectedEnvironment) {
    return <Text style={styles.statusText}>No environments yet</Text>
  }
  return (
    <View style={styles.statusCluster}>
      <View
        style={[styles.statusDot, { backgroundColor: toneColor }]}
        accessibilityElementsHidden
        importantForAccessibility="no"
      />
      <Text style={styles.statusText} numberOfLines={1}>
        {loading ? 'Loading…' : toneLabel}
      </Text>
    </View>
  )
}

function BarTrailingActions({
  showLifecycle,
  showRefreshOnly,
  hasServer,
  hasContainers,
  inFlight,
  busy,
  destroyArmed,
  destroyBusy,
  onStart,
  onStop,
  onToggleDestroy,
  onConfirmDestroy,
  onRefresh,
}: Readonly<{
  showLifecycle: boolean
  showRefreshOnly: boolean
  hasServer: boolean
  hasContainers: boolean
  inFlight: boolean
  busy: boolean
  destroyArmed: boolean
  destroyBusy: boolean
  onStart: () => void
  onStop: () => void
  onToggleDestroy: () => void
  onConfirmDestroy: () => void
  onRefresh: () => void
}>) {
  if (showLifecycle) {
    return (
      <LifecycleToolbar
        hasServer={hasServer}
        hasContainers={hasContainers}
        inFlight={inFlight}
        busy={busy}
        destroyArmed={destroyArmed}
        destroyBusy={destroyBusy}
        onStart={onStart}
        onStop={onStop}
        onToggleDestroy={onToggleDestroy}
        onConfirmDestroy={onConfirmDestroy}
        onRefresh={onRefresh}
      />
    )
  }
  if (showRefreshOnly) {
    return (
      <QuietButton
        label="Refresh"
        accessibilityLabel="Refresh environment status"
        onPress={onRefresh}
      />
    )
  }
  return null
}

function OverviewPlacementPins({
  canManage,
  baseSelected,
  selectedEnvironment,
  hasServer,
  servers,
  savingPlacement,
  onSaveEnvironmentServer,
}: Readonly<{
  canManage: boolean
  baseSelected: boolean
  selectedEnvironment: EnvironmentRecord | null
  hasServer: boolean
  servers: OrgServerRecord[]
  savingPlacement: boolean
  onSaveEnvironmentServer: (serverId: string) => void
}>) {
  if (!canManage) return null
  // Project default server lives in the Compose header; only show an
  // env-level pin when the selected environment has no effective server yet.
  if (!baseSelected && selectedEnvironment && !hasServer) {
    return (
      <ServerPinSelect
        label="Server"
        hint="Pin a server for this environment, or set Project server in the header."
        placementServerId={null}
        servers={servers}
        saving={savingPlacement}
        onSelect={onSaveEnvironmentServer}
      />
    )
  }
  return null
}

/**
 * Overview lifecycle strip (Start / Stop / Refresh / Destroy) and env management.
 * Project / environment / section chips live in the compose editor toolbar via
 * {@link ProjectSectionTabs}.
 */
export function OverviewEnvironmentsPanel() {
  const {
    orgId,
    projectId,
    project,
    environments,
    selectedEnvironmentId,
    selectedEnvironment,
    baseSelected,
    setSelectedEnvironmentId,
    invalidateEnvironments,
    canManage,
  } = useProjectContext()

  const environmentIds = useMemo(
    () => environments.map((env) => env.id),
    [environments],
  )

  const [trackedEntries, setTrackedEntries] = useState<
    readonly TrackedCommandEntry[]
  >([])
  const [commandMeta, setCommandMeta] = useState<
    Record<string, TrackedCommand>
  >({})
  const [actionError, setActionError] = useState<string | null>(null)
  const [containerError, setContainerError] = useState<string | null>(null)
  const [destroyArmed, setDestroyArmed] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [createName, setCreateName] = useState('')
  const [createError, setCreateError] = useState<string | null>(null)

  const containersQuery = useContainersByEnvironments(orgId, environmentIds)
  const containersByEnv = containersQuery.containersByEnv
  const loading = containersQuery.isLoading
  const serversQuery = useOrgServers(orgId, { enabled: canManage })

  const createEnvironmentMutation = useCreateEnvironment(orgId)
  const updateEnvironmentMutation = useUpdateEnvironment(
    orgId,
    selectedEnvironment?.id ?? '',
  )
  const deployEnvironmentMutation = useDeployEnvironment(
    orgId,
    selectedEnvironment?.id ?? '',
  )
  const lifecycleMutation = useRunEnvironmentLifecycle(
    orgId,
    selectedEnvironment?.id ?? '',
  )
  const stopEnvironmentMutation = useStopEnvironment(
    orgId,
    selectedEnvironment?.id ?? '',
  )
  const commandsQuery = useCommandsBatch(orgId, trackedEntries)
  const commandMetaRef = useRef(commandMeta)
  commandMetaRef.current = commandMeta
  const refetchOneRef = useRef(containersQuery.refetchOne)
  refetchOneRef.current = containersQuery.refetchOne

  useEffect(() => {
    if (!commandsQuery.data || trackedEntries.length === 0) return

    for (const [index, record] of commandsQuery.data.entries()) {
      const entry = trackedEntries[index]
      if (!entry) continue
      const meta = commandMetaRef.current[entry.commandId]
      if (!meta || isTerminalCommandStatus(meta.status)) continue

      const nextStatus = record.status
      const nextError = record.error ?? null
      if (meta.status !== nextStatus || meta.error !== nextError) {
        setCommandMeta((current) => {
          const latest = current[entry.commandId]
          if (!latest || isTerminalCommandStatus(latest.status)) return current
          if (latest.status === nextStatus && latest.error === nextError) {
            return current
          }
          return {
            ...current,
            [entry.commandId]: {
              ...latest,
              status: nextStatus,
              error: nextError,
            },
          }
        })
      }

      if (!isTerminalCommandStatus(nextStatus)) continue

      if (nextStatus === 'succeeded') {
        void refetchOneRef.current(meta.environmentId)
        if (meta.label === 'Destroy' || meta.label === 'Start') {
          void invalidateEnvironments()
        }
      }

      setTrackedEntries((current) =>
        current.filter((row) => row.commandId !== entry.commandId),
      )
    }
  }, [commandsQuery.data, trackedEntries, invalidateEnvironments])

  const commands = commandMeta
  const inFlight = Object.values(commands).some(
    (row) => !isTerminalCommandStatus(row.status),
  )

  useEffect(() => {
    setDestroyArmed(false)
    setActionError(null)
  }, [selectedEnvironmentId, baseSelected])

  const servers = serversQuery.data?.servers ?? []
  const projectDefaultServerId = project?.options?.defaultServerId ?? null
  const effectiveServerId = useMemo(
    () =>
      resolveEffectiveServerId(
        selectedEnvironment?.serverId,
        projectDefaultServerId,
      ),
    [selectedEnvironment?.serverId, projectDefaultServerId],
  )
  const inheritsBaseServer =
    Boolean(selectedEnvironment) &&
    !selectedEnvironment?.serverId &&
    Boolean(projectDefaultServerId)

  const registerCommand = (
    commandId: string,
    input: Readonly<{
      environmentId: string
      serverId: string
      label: string
    }>,
  ) => {
    setCommandMeta((current) => ({
      ...current,
      [commandId]: {
        environmentId: input.environmentId,
        serverId: input.serverId,
        label: input.label,
        status: 'queued',
        error: null,
      },
    }))
    setTrackedEntries((current) => [
      ...current,
      { serverId: input.serverId, commandId },
    ])
  }

  const saveEnvironmentServer = async (serverId: string) => {
    if (!selectedEnvironment) return
    setActionError(null)
    const result = await updateEnvironmentMutation.run({ serverId })
    if (!result.ok && updateEnvironmentMutation.actionError) {
      setActionError(updateEnvironmentMutation.actionError)
    }
  }

  const trackEnqueue = (
    environmentId: string,
    fallbackServerId: string | null | undefined,
    response: { commandId: string; serverId?: string },
    label: string,
  ) => {
    const serverId = fallbackServerId ?? response.serverId
    if (!serverId) {
      throw new Error('Command queued but target server was not returned')
    }
    registerCommand(response.commandId, {
      environmentId,
      serverId,
      label,
    })
  }

  const handleStart = async () => {
    if (!selectedEnvironment) return
    setActionError(null)
    const containers = containersByEnv[selectedEnvironment.id] ?? []
    const useLifecycle = hasHostDeployedContainers(containers)
    try {
      const result = useLifecycle
        ? await lifecycleMutation.run('start')
        : await deployEnvironmentMutation.run(undefined)
      if (!result.ok) {
        setActionError(
          lifecycleMutation.actionError ??
            deployEnvironmentMutation.actionError ??
            'Failed to start',
        )
        return
      }
      trackEnqueue(
        selectedEnvironment.id,
        effectiveServerId ?? selectedEnvironment.serverId,
        result.value,
        'Start',
      )
    } catch (err) {
      if (err instanceof DeployHealthCheckMissingError) {
        setActionError(
          err.required
            ? 'A service requires a compose healthcheck before the first start. Add healthcheck: in Compose, or set Health check policy to Disabled in service settings.'
            : 'Health-check warnings are enabled for a service. Confirm deploy on the Environments tab, or set Health check policy to Disabled.',
        )
        return
      }
      if (err instanceof DeployResourceLimitExceededError) {
        setActionError(
          'This start would exceed a resource limit. Open the Environments tab to review capacity and try again.',
        )
        return
      }
      setActionError(err instanceof Error ? err.message : 'Failed to start')
    }
  }

  const handleStop = async () => {
    if (!selectedEnvironment) return
    setActionError(null)
    const result = await lifecycleMutation.run('stop')
    if (!result.ok) {
      if (lifecycleMutation.actionError) {
        setActionError(lifecycleMutation.actionError)
      }
      return
    }
    trackEnqueue(
      selectedEnvironment.id,
      effectiveServerId ?? selectedEnvironment.serverId,
      result.value,
      'Stop',
    )
  }

  const handleDestroy = async () => {
    if (!selectedEnvironment) return
    setActionError(null)
    const result = await stopEnvironmentMutation.run()
    if (!result.ok) {
      if (stopEnvironmentMutation.actionError) {
        setActionError(stopEnvironmentMutation.actionError)
      }
      return
    }
    trackEnqueue(
      selectedEnvironment.id,
      effectiveServerId ??
        selectedEnvironment.serverId ??
        result.value.serverId,
      result.value,
      'Destroy',
    )
    setDestroyArmed(false)
  }

  const handleCreate = async () => {
    if (createEnvironmentMutation.isPending) return
    const trimmed = createName.trim()
    const validation = validateEnvironmentName(trimmed)
    if (validation) {
      setCreateError(validation)
      return
    }
    setCreateError(null)
    setActionError(null)
    const result = await createEnvironmentMutation.run({
      projectId,
      displayName: trimmed,
    })
    if (!result.ok) {
      if (createEnvironmentMutation.actionError) {
        setCreateError(createEnvironmentMutation.actionError)
      }
      return
    }
    await invalidateEnvironments()
    setSelectedEnvironmentId(result.value.id)
    setShowCreate(false)
    setCreateName('')
  }

  const selectedCommand =
    selectedEnvironment == null
      ? null
      : latestCommandForEnv(commands, selectedEnvironment.id)
  const commandError =
    selectedCommand &&
    isTerminalCommandStatus(selectedCommand.status) &&
    selectedCommand.status !== 'succeeded'
      ? selectedCommand.error ?? `Command ${selectedCommand.status}`
      : null

  const containers = selectedEnvironment
    ? (containersByEnv[selectedEnvironment.id] ?? [])
    : []
  const tone = environmentStatusTone(containers)
  const hasServer = Boolean(effectiveServerId)
  const hasContainers = hasHostDeployedContainers(containers)
  const creating = createEnvironmentMutation.isPending
  const destroyBusy = stopEnvironmentMutation.isPending
  const savingPlacement = updateEnvironmentMutation.isPending
  const busy = inFlight || destroyBusy || creating || savingPlacement

  let statusLabel: string = tone.label
  if (inheritsBaseServer) {
    statusLabel = `${tone.label} · via project server`
  }

  const showLifecycleBar =
    !baseSelected && Boolean(selectedEnvironment)

  return (
    <View style={styles.root}>
      {showLifecycleBar ? (
        <View style={styles.bar}>
          <StatusAside
            baseSelected={baseSelected}
            selectedEnvironment={selectedEnvironment}
            loading={loading}
            toneColor={tone.color}
            toneLabel={statusLabel}
          />

          <View style={styles.barSpacer} />

          <BarTrailingActions
            showLifecycle={canManage}
            showRefreshOnly={!canManage}
            hasServer={hasServer}
            hasContainers={hasContainers}
            inFlight={inFlight}
            busy={busy}
            destroyArmed={destroyArmed}
            destroyBusy={destroyBusy}
            onStart={() => void handleStart()}
            onStop={() => void handleStop()}
            onToggleDestroy={() => setDestroyArmed((current) => !current)}
            onConfirmDestroy={() => void handleDestroy()}
            onRefresh={() => {
              setContainerError(null)
              void containersQuery.refetchAll().catch((err) => {
                setContainerError(
                  err instanceof Error ? err.message : 'Failed to refresh',
                )
              })
            }}
          />
        </View>
      ) : null}

      <OverviewPlacementPins
        canManage={canManage}
        baseSelected={baseSelected}
        selectedEnvironment={selectedEnvironment}
        hasServer={hasServer}
        servers={servers}
        savingPlacement={savingPlacement}
        onSaveEnvironmentServer={(serverId) =>
          void saveEnvironmentServer(serverId)
        }
      />

      {canManage && !baseSelected ? (
        <ManageExtras
          busy={busy}
          showCreate={showCreate}
          createName={createName}
          createError={createError}
          creating={creating}
          onShowCreate={() => setShowCreate(true)}
          onCreateChange={(value) => {
            setCreateName(value)
            setCreateError(null)
          }}
          onCreateSubmit={() => void handleCreate()}
          onCreateCancel={() => {
            setShowCreate(false)
            setCreateName('')
            setCreateError(null)
          }}
        />
      ) : null}

      {destroyArmed ? (
        <Text style={styles.hintInline}>
          Destroys containers and volumes — cannot be undone
        </Text>
      ) : null}

      {containerError ? (
        <Text style={orgPanelStyles.error}>{containerError}</Text>
      ) : null}
      {actionError ? <Text style={orgPanelStyles.error}>{actionError}</Text> : null}
      {commandError ? (
        <Text style={orgPanelStyles.error}>{commandError}</Text>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    gap: spacing.sm,
  },
  bar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  statusCluster: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 28,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusText: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '500',
  },
  barSpacer: {
    flexGrow: 1,
    minWidth: spacing.sm,
  },
  actionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 4,
  },
  extrasRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 4,
  },
  quietBtn: {
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.borderChip,
    backgroundColor: colors.bgSecondary,
    paddingHorizontal: 10,
    paddingVertical: 6,
    minHeight: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  quietBtnPrimary: {
    borderColor: chrome.accent,
    backgroundColor: chrome.bgActive,
  },
  quietBtnDanger: {
    borderColor: colors.borderChip,
    backgroundColor: 'transparent',
  },
  quietBtnText: {
    color: colors.textChip,
    fontSize: 12,
    fontWeight: '600',
  },
  quietBtnTextPrimary: {
    color: chrome.accent,
    fontSize: 12,
    fontWeight: '700',
  },
  quietBtnTextDanger: {
    color: colors.error,
    fontSize: 12,
    fontWeight: '600',
  },
  hintInline: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 16,
  },
  inlineForm: {
    gap: spacing.xs,
    maxWidth: 360,
  },
  inlineActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
  input: {
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.borderChip,
    backgroundColor: colors.bgSecondary,
    color: colors.text,
    fontSize: 13,
    paddingHorizontal: 10,
    paddingVertical: 8,
    minHeight: 36,
  },
  buttonDisabled: {
    opacity: 0.45,
  },
})
