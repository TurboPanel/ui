import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native'
import { orgPanelStyles, webPointer } from '@/components/org/org-panel-styles'
import { useProjectContext } from '@/components/org/project/project-context'
import { PreviewDeploymentModal } from '@/components/org/project/preview-deployment-modal'
import {
  environmentStatusTone,
  hasHostDeployedContainers,
} from '@/lib/container-status'
import { validateEnvironmentName } from '@/lib/environment-validation'
import {
  DeployHealthCheckMissingError,
  DeployResourceLimitExceededError,
  type CommandStatus,
  type EnvironmentRecord,
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
  type TrackedCommandEntry,
} from '@/lib/queries'
import { resolveEffectiveServerId } from '@/lib/project-options'
import { chrome, colors, layout, spacing } from '@/lib/theme'

type TrackedCommand = {
  environmentId: string
  serverId: string
  label: string
  status: CommandStatus
  error: string | null
}

type DeployPreviewMode = 'deploy' | 'redeploy' | 'cacheless'

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

function RedeploySplitButton({
  inFlight,
  disabled,
  onRedeploy,
  onCachelessRedeploy,
}: Readonly<{
  inFlight: boolean
  disabled: boolean
  onRedeploy: () => void
  onCachelessRedeploy: () => void
}>) {
  const { width } = useWindowDimensions()
  const isCompact = width < layout.desktopBreakpoint
  const [menuOpen, setMenuOpen] = useState(false)
  const buttonRef = useRef<View>(null)
  const [menuPosition, setMenuPosition] = useState({ top: 56, left: 16 })

  useEffect(() => {
    if (!menuOpen || isCompact) return
    buttonRef.current?.measureInWindow((x, y, w, h) => {
      setMenuPosition({
        top: y + h + 6,
        left: Math.max(12, x + w - 240),
      })
    })
  }, [menuOpen, isCompact])

  const close = () => setMenuOpen(false)

  return (
    <>
      <View ref={buttonRef} collapsable={false} style={styles.splitGroup}>
        <Pressable
          style={[
            styles.quietBtn,
            styles.quietBtnPrimary,
            styles.splitPrimary,
            disabled && styles.buttonDisabled,
            webPointer,
          ]}
          disabled={disabled}
          onPress={onRedeploy}
          accessibilityRole="button"
          accessibilityLabel="Redeploy environment"
        >
          <Text style={styles.quietBtnTextPrimary}>
            {inFlight ? 'Working…' : 'Redeploy'}
          </Text>
        </Pressable>
        <Pressable
          style={[
            styles.quietBtn,
            styles.quietBtnPrimary,
            styles.splitCaret,
            disabled && styles.buttonDisabled,
            webPointer,
          ]}
          disabled={disabled}
          onPress={() => setMenuOpen((open) => !open)}
          accessibilityRole="button"
          accessibilityLabel="Redeploy options"
          accessibilityState={{ expanded: menuOpen }}
        >
          <Text style={styles.caretGlyph}>▾</Text>
        </Pressable>
      </View>

      <Modal
        visible={menuOpen}
        transparent
        animationType={isCompact ? 'slide' : 'fade'}
        onRequestClose={close}
      >
        <View
          style={[
            styles.menuBackdrop,
            isCompact && styles.menuBackdropCompact,
          ]}
        >
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={close}
            accessibilityRole="button"
            accessibilityLabel="Dismiss menu"
          />
          <View
            style={[
              styles.menuCard,
              isCompact
                ? styles.menuCardCompact
                : {
                    position: 'absolute',
                    top: menuPosition.top,
                    left: menuPosition.left,
                    width: 240,
                  },
            ]}
          >
            <Pressable
              style={({ pressed }) => [
                styles.menuItem,
                pressed && styles.menuItemPressed,
                webPointer,
              ]}
              onPress={() => {
                close()
                onCachelessRedeploy()
              }}
              accessibilityRole="menuitem"
              accessibilityLabel="Cacheless redeploy"
            >
              <Text style={styles.menuItemTitle}>Cacheless redeploy</Text>
              <Text style={styles.menuItemSub}>
                Rebuilds images without the Docker build cache — slower
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </>
  )
}

function LifecycleToolbar({
  hasServer,
  hasContainers,
  isRunning,
  inFlight,
  busy,
  destroyArmed,
  destroyBusy,
  onDeploy,
  onRedeploy,
  onCachelessRedeploy,
  onStart,
  onStop,
  onToggleDestroy,
  onConfirmDestroy,
  onRefresh,
}: Readonly<{
  hasServer: boolean
  hasContainers: boolean
  isRunning: boolean
  inFlight: boolean
  busy: boolean
  destroyArmed: boolean
  destroyBusy: boolean
  onDeploy: () => void
  onRedeploy: () => void
  onCachelessRedeploy: () => void
  onStart: () => void
  onStop: () => void
  onToggleDestroy: () => void
  onConfirmDestroy: () => void
  onRefresh: () => void
}>) {
  const actionDisabled = !hasServer || busy
  let destroyLabel = 'Destroy'
  let destroyA11y = 'Destroy'
  if (destroyBusy) {
    destroyLabel = 'Destroying…'
    destroyA11y = 'Destroying environment'
  } else if (destroyArmed) {
    destroyLabel = 'Confirm'
    destroyA11y = 'Confirm destroy'
  }

  const showStop = hasContainers && isRunning
  const showStart = hasContainers && !isRunning
  const showDeploy = !hasContainers
  const showRedeploy = hasContainers

  return (
    <View style={styles.actionsRow}>
      {showDeploy ? (
        <QuietButton
          label={inFlight ? 'Working…' : 'Deploy'}
          accessibilityLabel="Deploy environment"
          tone="primary"
          disabled={actionDisabled}
          onPress={onDeploy}
        />
      ) : null}
      {showStart ? (
        <QuietButton
          label={inFlight ? 'Working…' : 'Start'}
          accessibilityLabel="Start environment"
          tone="primary"
          disabled={actionDisabled}
          onPress={onStart}
        />
      ) : null}
      {showRedeploy ? (
        <RedeploySplitButton
          inFlight={inFlight}
          disabled={actionDisabled}
          onRedeploy={onRedeploy}
          onCachelessRedeploy={onCachelessRedeploy}
        />
      ) : null}
      {showStop ? (
        <QuietButton
          label="Stop"
          accessibilityLabel="Stop environment"
          disabled={busy}
          onPress={onStop}
        />
      ) : null}
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
  isRunning,
  inFlight,
  busy,
  destroyArmed,
  destroyBusy,
  onDeploy,
  onRedeploy,
  onCachelessRedeploy,
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
  isRunning: boolean
  inFlight: boolean
  busy: boolean
  destroyArmed: boolean
  destroyBusy: boolean
  onDeploy: () => void
  onRedeploy: () => void
  onCachelessRedeploy: () => void
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
        isRunning={isRunning}
        inFlight={inFlight}
        busy={busy}
        destroyArmed={destroyArmed}
        destroyBusy={destroyBusy}
        onDeploy={onDeploy}
        onRedeploy={onRedeploy}
        onCachelessRedeploy={onCachelessRedeploy}
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

function deployModeLabel(mode: DeployPreviewMode): string {
  if (mode === 'cacheless') return 'Cacheless redeploy'
  if (mode === 'redeploy') return 'Redeploy'
  return 'Deploy'
}

function shouldInvalidateEnvironmentsForCommand(label: string): boolean {
  return (
    label === 'Destroy' ||
    label === 'Deploy' ||
    label === 'Redeploy' ||
    label === 'Cacheless redeploy' ||
    label === 'Start'
  )
}

function deriveLifecycleContainerState(
  containers: Parameters<typeof hasHostDeployedContainers>[0],
  toneLabel: string,
): { hasContainers: boolean; isRunning: boolean } {
  return {
    hasContainers: hasHostDeployedContainers(containers),
    isRunning: toneLabel === 'Running',
  }
}

function resolveCommandError(
  selectedCommand: TrackedCommand | null,
): string | null {
  if (
    !selectedCommand ||
    !isTerminalCommandStatus(selectedCommand.status) ||
    selectedCommand.status === 'succeeded'
  ) {
    return null
  }
  return selectedCommand.error ?? `Command ${selectedCommand.status}`
}

function resolveLifecycleStatusLabel(
  toneLabel: string,
  inheritsBaseServer: boolean,
): string {
  if (inheritsBaseServer) {
    return `${toneLabel} · via project server`
  }
  return toneLabel
}

function applySucceededCommandSideEffects(
  meta: TrackedCommand,
  refetchOne: (environmentId: string) => unknown,
  invalidateEnvironments: () => unknown,
): void {
  void refetchOne(meta.environmentId)
  if (shouldInvalidateEnvironmentsForCommand(meta.label)) {
    void invalidateEnvironments()
  }
}

function deployPreviewFailureMessage(err: unknown): string | null {
  if (err instanceof DeployHealthCheckMissingError) {
    if (err.required) {
      return 'A service requires a compose healthcheck before the first start. Add healthcheck: in Compose, or set Health check policy to Disabled in service settings.'
    }
    return 'Health-check warnings are enabled for a service. Confirm deploy on the Environments tab, or set Health check policy to Disabled.'
  }
  if (err instanceof DeployResourceLimitExceededError) {
    return 'This start would exceed a resource limit. Open the Environments tab to review capacity and try again.'
  }
  return null
}

/**
 * Overview lifecycle strip (Deploy / Redeploy / Start / Stop / Refresh /
 * Destroy) and env management. Project / environment / section chips live
 * in the compose editor toolbar via {@link ProjectSectionTabs}.
 * Server placement lives exclusively in {@link ProjectSettingsArea}.
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
    projectAllowsMutations,
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
  const [previewDeployOpen, setPreviewDeployOpen] = useState(false)
  const [deployConfirmBusy, setDeployConfirmBusy] = useState(false)
  const [deployPreviewMode, setDeployPreviewMode] =
    useState<DeployPreviewMode>('deploy')

  const containersQuery = useContainersByEnvironments(orgId, environmentIds)
  const containersByEnv = containersQuery.containersByEnv
  const loading = containersQuery.isLoading
  const canMutateLifecycle = canManage && projectAllowsMutations

  const createEnvironmentMutation = useCreateEnvironment(orgId)
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
  const refetchOneRef = useRef(containersQuery.refetchOne)

  useEffect(() => {
    commandMetaRef.current = commandMeta
    refetchOneRef.current = containersQuery.refetchOne
  }, [commandMeta, containersQuery.refetchOne])

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
        applySucceededCommandSideEffects(
          meta,
          refetchOneRef.current,
          invalidateEnvironments,
        )
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
    setPreviewDeployOpen(false)
    setDeployConfirmBusy(false)
    setDeployPreviewMode('deploy')
  }, [selectedEnvironmentId, baseSelected])

  const projectDefaultServerId = project?.options?.defaultServerId ?? null
  const effectiveServerId = useMemo(
    () =>
      resolveEffectiveServerId(
        selectedEnvironment?.serverId,
        projectDefaultServerId,
      ),
    [selectedEnvironment?.serverId, projectDefaultServerId],
  )
  const serversQuery = useOrgServers(orgId, {
    enabled: Boolean(effectiveServerId) && previewDeployOpen,
  })
  const placementServerLabel = useMemo(() => {
    if (!effectiveServerId) return null
    const server = serversQuery.data?.servers.find(
      (row) => row.id === effectiveServerId,
    )
    if (!server) return effectiveServerId
    return server.displayName?.trim() || server.hostname || server.id
  }, [effectiveServerId, serversQuery.data?.servers])
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

  const runLifecycleStart = async () => {
    if (!selectedEnvironment) return
    setActionError(null)
    try {
      const result = await lifecycleMutation.run('start')
      if (!result.ok) {
        setActionError(lifecycleMutation.actionError ?? 'Failed to start')
        return
      }
      trackEnqueue(
        selectedEnvironment.id,
        effectiveServerId ?? selectedEnvironment.serverId,
        result.value,
        'Start',
      )
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to start')
    }
  }

  const openDeployPreview = (mode: DeployPreviewMode) => {
    setActionError(null)
    setDeployPreviewMode(mode)
    setPreviewDeployOpen(true)
  }

  const runDeployFromPreview = async () => {
    if (!selectedEnvironment) return
    setActionError(null)
    setDeployConfirmBusy(true)
    try {
      const result = await deployEnvironmentMutation.run(
        deployPreviewMode === 'cacheless' ? { noCache: true } : undefined,
      )
      if (!result.ok) {
        setActionError(
          deployEnvironmentMutation.actionError ?? 'Failed to deploy',
        )
        return
      }
      setPreviewDeployOpen(false)
      trackEnqueue(
        selectedEnvironment.id,
        effectiveServerId ?? selectedEnvironment.serverId,
        result.value,
        deployModeLabel(deployPreviewMode),
      )
    } catch (err) {
      const previewMessage = deployPreviewFailureMessage(err)
      if (previewMessage) {
        setPreviewDeployOpen(false)
        setActionError(previewMessage)
        return
      }
      setActionError(err instanceof Error ? err.message : 'Failed to deploy')
    } finally {
      setDeployConfirmBusy(false)
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
  const commandError = resolveCommandError(selectedCommand)

  const containers = selectedEnvironment
    ? (containersByEnv[selectedEnvironment.id] ?? [])
    : []
  const tone = environmentStatusTone(containers)
  const hasServer = Boolean(effectiveServerId)
  const { hasContainers, isRunning } = deriveLifecycleContainerState(
    containers,
    tone.label,
  )
  const creating = createEnvironmentMutation.isPending
  const destroyBusy = stopEnvironmentMutation.isPending
  const busy = inFlight || destroyBusy || creating

  const statusLabel = resolveLifecycleStatusLabel(
    tone.label,
    inheritsBaseServer,
  )

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
            showLifecycle={canMutateLifecycle}
            showRefreshOnly={!canMutateLifecycle}
            hasServer={hasServer}
            hasContainers={hasContainers}
            isRunning={isRunning}
            inFlight={inFlight}
            busy={busy}
            destroyArmed={destroyArmed}
            destroyBusy={destroyBusy}
            onDeploy={() => openDeployPreview('deploy')}
            onRedeploy={() => openDeployPreview('redeploy')}
            onCachelessRedeploy={() => openDeployPreview('cacheless')}
            onStart={() => {
              void runLifecycleStart()
            }}
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

      {canMutateLifecycle && !baseSelected ? (
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

      {selectedEnvironment && !baseSelected ? (
        <PreviewDeploymentModal
          visible={previewDeployOpen}
          orgId={orgId}
          environmentId={selectedEnvironment.id}
          environmentLabel={
            selectedEnvironment.displayName?.trim() || 'this environment'
          }
          canManage={canMutateLifecycle}
          placementServerId={effectiveServerId}
          placementServerLabel={placementServerLabel}
          projectCompose={project?.options?.compose}
          environmentCompose={selectedEnvironment.options?.compose}
          deploying={deployConfirmBusy}
          confirmLabel={deployModeLabel(deployPreviewMode)}
          onCancel={() => {
            if (deployConfirmBusy) return
            setPreviewDeployOpen(false)
          }}
          onConfirm={() => {
            void runDeployFromPreview()
          }}
        />
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
  splitGroup: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  splitPrimary: {
    borderTopRightRadius: 0,
    borderBottomRightRadius: 0,
    borderRightWidth: 0,
  },
  splitCaret: {
    borderTopLeftRadius: 0,
    borderBottomLeftRadius: 0,
    paddingHorizontal: 8,
    minWidth: 28,
  },
  caretGlyph: {
    color: chrome.accent,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 14,
  },
  menuBackdrop: {
    flex: 1,
    backgroundColor: colors.overlay,
  },
  menuBackdropCompact: {
    justifyContent: 'flex-end',
  },
  menuCard: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.borderChip,
    backgroundColor: colors.bgPanel,
    overflow: 'hidden',
  },
  menuCardCompact: {
    margin: spacing.md,
    marginBottom: spacing.xl,
  },
  menuItem: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    gap: 4,
  },
  menuItemPressed: {
    backgroundColor: colors.bgSecondary,
  },
  menuItemTitle: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '600',
  },
  menuItemSub: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 16,
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
