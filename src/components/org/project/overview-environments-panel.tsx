import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { orgPanelStyles, webPointer } from '@/components/org/org-panel-styles'
import { useProjectContext } from '@/components/org/project/project-context'
import { ServerPinSelect } from '@/components/org/project/server-pin-select'
import {
  COMMAND_POLL_MS,
  isTerminalCommandStatus,
} from '@/components/org/server-commands-panel'
import { useAuth } from '@/lib/auth-context'
import {
  environmentStatusTone,
  hasHostDeployedContainers,
  isActiveContainerStatus,
} from '@/lib/container-status'
import { validateEnvironmentName } from '@/lib/environment-validation'
import {
  createEnvironment,
  deleteEnvironment,
  deployEnvironment,
  DeployHealthCheckMissingError,
  DeployResourceLimitExceededError,
  fetchCommand,
  fetchContainers,
  fetchOrgServers,
  isForbiddenError,
  runEnvironmentLifecycle,
  stopEnvironment,
  updateEnvironment,
  updateProject,
  type CommandStatus,
  type ContainerRecord,
  type EnvironmentRecord,
  type OrgServerRecord,
} from '@/lib/instance-api'
import {
  buildProjectOptionsPatch,
  mergeProjectOptionsLocal,
  resolveEffectiveServerId,
} from '@/lib/project-options'
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

function joinedEnvironmentIds(environments: EnvironmentRecord[]): string {
  return environments
    .map((env) => env.id)
    .sort((a, b) => a.localeCompare(b))
    .join(',')
}

function useEnvironmentContainers(
  environments: EnvironmentRecord[],
  handleUnauthorized: () => void | Promise<void>,
) {
  const [containersByEnv, setContainersByEnv] = useState<ContainersByEnv>({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const envIds = environments.map((env) => env.id)
  const envKey = joinedEnvironmentIds(environments)
  const envIdsRef = useRef(envIds)
  envIdsRef.current = envIds

  const refreshOne = useCallback(async (environmentId: string) => {
    const result = await fetchContainers({ environmentId })
    setContainersByEnv((current) => ({
      ...current,
      [environmentId]: result.containers,
    }))
  }, [])

  const refreshAll = useCallback(async () => {
    const ids = envIdsRef.current
    if (ids.length === 0) {
      setContainersByEnv({})
      return
    }
    setLoading(true)
    setError(null)
    try {
      const entries = await Promise.all(
        ids.map(async (id) => {
          const result = await fetchContainers({ environmentId: id })
          return [id, result.containers] as const
        }),
      )
      const next: ContainersByEnv = {}
      for (const [id, containers] of entries) {
        next[id] = containers
      }
      setContainersByEnv(next)
    } catch (err) {
      if (isForbiddenError(err)) {
        await handleUnauthorized()
        return
      }
      setError(
        err instanceof Error ? err.message : 'Failed to load environment status',
      )
    } finally {
      setLoading(false)
    }
  }, [handleUnauthorized])

  useEffect(() => {
    void refreshAll()
  }, [envKey, refreshAll])

  return { containersByEnv, loading, error, setError, refreshAll, refreshOne }
}

function useEnvironmentCommands(
  onTerminalSuccess: (environmentId: string) => void,
) {
  const [commands, setCommands] = useState<Record<string, TrackedCommand>>({})
  const onSuccessRef = useRef(onTerminalSuccess)
  useEffect(() => {
    onSuccessRef.current = onTerminalSuccess
  }, [onTerminalSuccess])

  const registerCommand = (
    commandId: string,
    input: Readonly<{
      environmentId: string
      serverId: string
      label: string
    }>,
  ) => {
    setCommands((current) => ({
      ...current,
      [commandId]: {
        environmentId: input.environmentId,
        serverId: input.serverId,
        label: input.label,
        status: 'queued',
        error: null,
      },
    }))
  }

  const inFlight = Object.values(commands).some(
    (row) => !isTerminalCommandStatus(row.status),
  )

  useEffect(() => {
    const active = Object.entries(commands).filter(
      ([, row]) => !isTerminalCommandStatus(row.status),
    )
    if (active.length === 0) {
      return
    }

    let cancelled = false
    const tick = async () => {
      for (const [commandId, row] of active) {
        try {
          const record = await fetchCommand(row.serverId, commandId)
          if (cancelled) return
          setCommands((current) => {
            const prev = current[commandId]
            if (!prev) return current
            return {
              ...current,
              [commandId]: {
                ...prev,
                status: record.status,
                error: record.error ?? null,
              },
            }
          })
          if (!isTerminalCommandStatus(record.status)) {
            continue
          }
          if (record.status === 'succeeded') {
            onSuccessRef.current(row.environmentId)
          }
        } catch {
          // Keep polling; next tick may succeed.
        }
      }
    }

    void tick()
    const timer = setInterval(() => {
      void tick()
    }, COMMAND_POLL_MS)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [commands])

  return { registerCommand, inFlight, commands }
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

function EnvironmentToggle({
  environments,
  containersByEnv,
  selectedEnvironmentId,
  baseSelected,
  onSelectBase,
  onSelectEnvironment,
}: Readonly<{
  environments: EnvironmentRecord[]
  containersByEnv: ContainersByEnv
  selectedEnvironmentId: string | null
  baseSelected: boolean
  onSelectBase: () => void
  onSelectEnvironment: (id: string) => void
}>) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.toggleScroll}
      accessibilityRole="tablist"
      accessibilityLabel="Environments"
    >
      <View style={orgPanelStyles.segmentGroup}>
        <Pressable
          accessibilityRole="tab"
          accessibilityState={{ selected: baseSelected }}
          accessibilityLabel="Base"
          style={[
            orgPanelStyles.segmentChip,
            baseSelected && orgPanelStyles.segmentChipActive,
            webPointer,
          ]}
          onPress={onSelectBase}
        >
          <Text
            style={[
              orgPanelStyles.segmentChipText,
              baseSelected && orgPanelStyles.segmentChipTextActive,
            ]}
            numberOfLines={1}
          >
            Base
          </Text>
        </Pressable>
        {environments.map((env) => {
          const active = !baseSelected && env.id === selectedEnvironmentId
          const name = environmentLabel(env)
          const tone = environmentStatusTone(containersByEnv[env.id] ?? [])
          return (
            <Pressable
              key={env.id}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              accessibilityLabel={`${name}, ${tone.label}`}
              style={[
                orgPanelStyles.segmentChip,
                active && orgPanelStyles.segmentChipActive,
                webPointer,
              ]}
              onPress={() => onSelectEnvironment(env.id)}
            >
              <Text
                style={[
                  orgPanelStyles.segmentChipText,
                  active && orgPanelStyles.segmentChipTextActive,
                ]}
                numberOfLines={1}
              >
                {name}
              </Text>
            </Pressable>
          )
        })}
      </View>
    </ScrollView>
  )
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
  canRemove,
  removeBlocked,
  removeArmed,
  removeBusy,
  showCreate,
  createName,
  createError,
  creating,
  onToggleRemove,
  onConfirmRemove,
  onShowCreate,
  onCreateChange,
  onCreateSubmit,
  onCreateCancel,
}: Readonly<{
  busy: boolean
  canRemove: boolean
  removeBlocked: boolean
  removeArmed: boolean
  removeBusy: boolean
  showCreate: boolean
  createName: string
  createError: string | null
  creating: boolean
  onToggleRemove: () => void
  onConfirmRemove: () => void
  onShowCreate: () => void
  onCreateChange: (value: string) => void
  onCreateSubmit: () => void
  onCreateCancel: () => void
}>) {
  let removeLabel = 'Remove'
  if (removeBusy) removeLabel = 'Removing…'
  else if (removeArmed) removeLabel = 'Confirm remove'

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
      {canRemove ? (
        <>
          <QuietButton
            label={removeLabel}
            accessibilityLabel={removeLabel}
            tone="danger"
            disabled={(busy || removeBlocked) && !removeArmed}
            onPress={removeArmed ? onConfirmRemove : onToggleRemove}
          />
          {removeArmed ? (
            <QuietButton label="Cancel" onPress={onToggleRemove} />
          ) : null}
        </>
      ) : null}
      {removeBlocked ? (
        <Text style={styles.hintInline}>Stop first</Text>
      ) : null}
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
    return (
      <Text style={styles.statusText} numberOfLines={1}>
        Shared setup
      </Text>
    )
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
  project,
  selectedEnvironment,
  hasServer,
  projectDefaultServerId,
  servers,
  savingPlacement,
  onSaveBaseServer,
  onSaveEnvironmentServer,
}: Readonly<{
  canManage: boolean
  baseSelected: boolean
  project: NonNullable<ReturnType<typeof useProjectContext>['project']> | null
  selectedEnvironment: EnvironmentRecord | null
  hasServer: boolean
  projectDefaultServerId: string | null
  servers: OrgServerRecord[]
  savingPlacement: boolean
  onSaveBaseServer: (serverId: string | null) => void
  onSaveEnvironmentServer: (serverId: string) => void
}>) {
  if (!canManage) return null
  if (baseSelected && project) {
    return (
      <ServerPinSelect
        label="Default server"
        hint="Optional. Environments without their own server inherit this."
        placementServerId={projectDefaultServerId}
        servers={servers}
        saving={savingPlacement}
        allowClear
        onSelect={onSaveBaseServer}
        onClear={() => onSaveBaseServer(null)}
      />
    )
  }
  if (!baseSelected && selectedEnvironment && !hasServer) {
    return (
      <ServerPinSelect
        label="Server"
        hint="Pin a server for this environment, or set a default on Base."
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
 * Compact Overview strip: Base / environment segmented toggle plus refined
 * Start / Stop / Refresh / Destroy for the selected environment.
 */
export function OverviewEnvironmentsPanel() {
  const {
    projectId,
    project,
    setProject,
    environments,
    selectedEnvironmentId,
    selectedEnvironment,
    baseSelected,
    setSelectedEnvironmentId,
    selectBaseCompose,
    refreshEnvironments,
    canManage,
  } = useProjectContext()
  const { handleUnauthorized } = useAuth()

  const {
    containersByEnv,
    loading,
    error,
    setError,
    refreshAll,
    refreshOne,
  } = useEnvironmentContainers(environments, handleUnauthorized)

  const onTerminalSuccess = useCallback(
    (environmentId: string) => {
      void refreshOne(environmentId).catch(() => {
        // Surfaced on next manual refresh.
      })
    },
    [refreshOne],
  )
  const { registerCommand, inFlight, commands } =
    useEnvironmentCommands(onTerminalSuccess)

  const [actionError, setActionError] = useState<string | null>(null)
  const [destroyArmed, setDestroyArmed] = useState(false)
  const [destroyBusy, setDestroyBusy] = useState(false)
  const [removeArmed, setRemoveArmed] = useState(false)
  const [removeBusy, setRemoveBusy] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [createName, setCreateName] = useState('')
  const [createError, setCreateError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [servers, setServers] = useState<OrgServerRecord[]>([])
  const [savingPlacement, setSavingPlacement] = useState(false)

  useEffect(() => {
    setDestroyArmed(false)
    setRemoveArmed(false)
    setActionError(null)
  }, [selectedEnvironmentId, baseSelected])

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const result = await fetchOrgServers()
        if (!cancelled) setServers(result.servers)
      } catch (err) {
        if (cancelled) return
        if (isForbiddenError(err)) {
          await handleUnauthorized()
        }
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [handleUnauthorized])

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

  const saveBaseServer = async (serverId: string | null) => {
    if (!project) return
    setSavingPlacement(true)
    setActionError(null)
    try {
      const options = buildProjectOptionsPatch(project, {
        defaultServerId: serverId,
      })
      await updateProject(projectId, { options })
      setProject({
        ...project,
        options: mergeProjectOptionsLocal(project.options, options),
      })
    } catch (err) {
      if (isForbiddenError(err)) {
        await handleUnauthorized()
        return
      }
      setActionError(
        err instanceof Error ? err.message : 'Failed to save default server',
      )
    } finally {
      setSavingPlacement(false)
    }
  }

  const saveEnvironmentServer = async (serverId: string) => {
    if (!selectedEnvironment) return
    setSavingPlacement(true)
    setActionError(null)
    try {
      await updateEnvironment(selectedEnvironment.id, { serverId })
      await refreshEnvironments()
    } catch (err) {
      if (isForbiddenError(err)) {
        await handleUnauthorized()
        return
      }
      setActionError(
        err instanceof Error ? err.message : 'Failed to save server',
      )
    } finally {
      setSavingPlacement(false)
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
      const response = useLifecycle
        ? await runEnvironmentLifecycle(selectedEnvironment.id, 'start')
        : await deployEnvironment(selectedEnvironment.id)
      trackEnqueue(
        selectedEnvironment.id,
        effectiveServerId ?? selectedEnvironment.serverId,
        response,
        'Start',
      )
    } catch (err) {
      if (isForbiddenError(err)) {
        await handleUnauthorized()
        return
      }
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
    try {
      const response = await runEnvironmentLifecycle(
        selectedEnvironment.id,
        'stop',
      )
      trackEnqueue(
        selectedEnvironment.id,
        effectiveServerId ?? selectedEnvironment.serverId,
        response,
        'Stop',
      )
    } catch (err) {
      if (isForbiddenError(err)) {
        await handleUnauthorized()
        return
      }
      setActionError(err instanceof Error ? err.message : 'Failed to stop')
    }
  }

  const handleDestroy = async () => {
    if (!selectedEnvironment) return
    setDestroyBusy(true)
    setActionError(null)
    try {
      const response = await stopEnvironment(selectedEnvironment.id)
      trackEnqueue(
        selectedEnvironment.id,
        effectiveServerId ??
          selectedEnvironment.serverId ??
          response.serverId,
        response,
        'Destroy',
      )
      setDestroyArmed(false)
    } catch (err) {
      if (isForbiddenError(err)) {
        await handleUnauthorized()
        return
      }
      setActionError(err instanceof Error ? err.message : 'Failed to destroy')
    } finally {
      setDestroyBusy(false)
    }
  }

  const handleCreate = async () => {
    const trimmed = createName.trim()
    const validation = validateEnvironmentName(trimmed)
    if (validation) {
      setCreateError(validation)
      return
    }
    setCreating(true)
    setCreateError(null)
    setActionError(null)
    try {
      const result = await createEnvironment({
        projectId,
        displayName: trimmed,
      })
      await refreshEnvironments()
      setSelectedEnvironmentId(result.id)
      setShowCreate(false)
      setCreateName('')
    } catch (err) {
      if (isForbiddenError(err)) {
        await handleUnauthorized()
        return
      }
      setCreateError(
        err instanceof Error ? err.message : 'Failed to create environment',
      )
    } finally {
      setCreating(false)
    }
  }

  const handleRemove = async () => {
    if (!selectedEnvironment) return
    if (environments.length <= 1) return
    setRemoveBusy(true)
    setActionError(null)
    try {
      await deleteEnvironment(selectedEnvironment.id)
      setRemoveArmed(false)
      await refreshEnvironments()
    } catch (err) {
      if (isForbiddenError(err)) {
        await handleUnauthorized()
        return
      }
      setActionError(
        err instanceof Error ? err.message : 'Failed to remove environment',
      )
    } finally {
      setRemoveBusy(false)
    }
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
  const removeBlocked = containers.some((row) =>
    isActiveContainerStatus(row.status),
  )
  const busy =
    inFlight || destroyBusy || removeBusy || creating || savingPlacement

  let statusLabel: string = tone.label
  if (inheritsBaseServer) {
    statusLabel = `${tone.label} · via Base`
  }

  return (
    <View style={styles.root}>
      <View style={styles.bar}>
        <EnvironmentToggle
          environments={environments}
          containersByEnv={containersByEnv}
          selectedEnvironmentId={selectedEnvironmentId}
          baseSelected={baseSelected}
          onSelectBase={selectBaseCompose}
          onSelectEnvironment={setSelectedEnvironmentId}
        />

        <StatusAside
          baseSelected={baseSelected}
          selectedEnvironment={selectedEnvironment}
          loading={loading}
          toneColor={tone.color}
          toneLabel={statusLabel}
        />

        <View style={styles.barSpacer} />

        <BarTrailingActions
          showLifecycle={!baseSelected && Boolean(selectedEnvironment) && canManage}
          showRefreshOnly={
            !baseSelected && Boolean(selectedEnvironment) && !canManage
          }
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
            setError(null)
            void refreshAll()
          }}
        />
      </View>

      <OverviewPlacementPins
        canManage={canManage}
        baseSelected={baseSelected}
        project={project}
        selectedEnvironment={selectedEnvironment}
        hasServer={hasServer}
        projectDefaultServerId={projectDefaultServerId}
        servers={servers}
        savingPlacement={savingPlacement}
        onSaveBaseServer={(serverId) => void saveBaseServer(serverId)}
        onSaveEnvironmentServer={(serverId) =>
          void saveEnvironmentServer(serverId)
        }
      />

      {canManage && !baseSelected ? (
        <ManageExtras
          busy={busy}
          canRemove={environments.length > 1}
          removeBlocked={removeBlocked}
          removeArmed={removeArmed}
          removeBusy={removeBusy}
          showCreate={showCreate}
          createName={createName}
          createError={createError}
          creating={creating}
          onToggleRemove={() => setRemoveArmed((current) => !current)}
          onConfirmRemove={() => void handleRemove()}
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

      {error ? <Text style={orgPanelStyles.error}>{error}</Text> : null}
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
  toggleScroll: {
    flexGrow: 0,
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
