import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from 'react'
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native'
import { useQueryClient } from '@tanstack/react-query'
import { Link, useRouter, type Href } from 'expo-router'
import { LogTranscriptView } from '@/components/org/logs/log-transcript-view'
import { panelStyles } from '@/components/ui/panel-styles'
import { EnvironmentDeploymentHistoryPanel } from '@/components/org/project/environment-deployment-history-panel'
import { EnvironmentGitSourcePanel } from '@/components/org/project/environment-git-source-panel'
import { StatusDot } from '@/components/ui'
import { useProjectContext } from '@/components/org/project/project-context'
import {
  PreviewDeploymentModal,
  type ComposePreviewMode,
  type PreviewDeploymentPurpose,
} from '@/components/org/project/preview-deployment-modal'
import {
  environmentStatusTone,
  hasHostDeployedContainers,
} from '@/lib/container-status'
import {
  DeployHealthCheckMissingError,
  DeployResourceLimitExceededError,
  type CommandStatus,
  type CommandStatusRecord,
  type EnvironmentRecord,
} from '@/lib/instance-api'
import {
  commandStatusById,
  isTerminalCommandStatus,
  useCommandLog,
  useCommandsBatch,
  useContainersByProject,
  useDeleteEnvironment,
  useDeployEnvironment,
  useOrgServers,
  useProjectPrincipals,
  useRunEnvironmentLifecycle,
  useServicesByEnvironments,
  useStopEnvironment,
  type TrackedCommandEntry,
} from '@/lib/queries'
import { mergeComposeOverlay } from '@/lib/compose'
import { unownedPrincipalRequiredServices } from '@/lib/compose/principal-required'
import {
  environmentDeleteFailure,
  environmentDeletePrompt,
  type EnvironmentDeleteFailure,
} from '@/lib/environment-delete'
import {
  DESTROY_ARMED_HINT,
  DESTROY_EXPLANATION,
  environmentActionItems,
  type EnvironmentActionId,
} from '@/lib/environment-menu'
import {
  projectEnvironmentBindingsHref,
  projectEnvironmentHostingHref,
  projectEnvironmentSettingsHref,
  projectOverviewHref,
} from '@/lib/project-navigation'
import { resolveEffectiveServerId } from '@/lib/project-options'
import { resolveServerLabel } from '@/lib/resource-labels'
import { queryKeys } from '@/lib/query-keys'
import { chrome, colors, layout, spacing, webPointer } from '@/lib/theme'
import { userErrorMessage } from '@/lib/user-error'

type TrackedCommand = {
  environmentId: string
  serverId: string
  label: string
  status: CommandStatus
  error: string | null
}

type DeployConfirmMode = 'deploy' | 'redeploy' | 'cacheless'

/** The deploy whose transcript the Overview auto-opened. */
type OpenDeployLog = Readonly<{
  environmentId: string
  serverId: string
  commandId: string
  label: string
}>

type PreviewOpenState = {
  purpose: PreviewDeploymentPurpose
  mode: ComposePreviewMode
  confirm?: DeployConfirmMode
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
  tooltip,
  tone = 'neutral',
}: Readonly<{
  label: string
  accessibilityLabel?: string
  onPress: () => void
  disabled?: boolean
  /** Hover text on web (title attribute); ignored on native. */
  tooltip?: string
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
      hitSlop={{ top: 6, bottom: 6 }}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      {...(tooltip ? ({ title: tooltip } as object) : {})}
    >
      <Text style={quietButtonTextStyle(tone)}>{label}</Text>
    </Pressable>
  )
}

/** Pending delete state for one environment: armed, failure text, stop offer. */
function useOverviewEnvironmentDelete(onStop: () => void) {
  const router = useRouter()
  const {
    orgId,
    projectId,
    selectedEnvironment,
    invalidateEnvironments,
    setError,
  } = useProjectContext()
  const deleteEnvironment = useDeleteEnvironment(orgId)
  const [armed, setArmed] = useState(false)
  const [failure, setFailure] = useState<EnvironmentDeleteFailure | null>(null)
  const name = selectedEnvironment?.name?.trim() || 'environment'

  const confirm = async () => {
    if (!selectedEnvironment || deleteEnvironment.isPending) return
    setError(null)
    setFailure(null)
    const result = await deleteEnvironment.run(selectedEnvironment.id)
    if (!result.ok) {
      if (deleteEnvironment.actionError) {
        setFailure(environmentDeleteFailure(deleteEnvironment.actionError, name))
      }
      return
    }
    setArmed(false)
    await invalidateEnvironments()
    router.replace(projectOverviewHref(orgId, projectId) as Href)
  }

  const stop = () => {
    setArmed(false)
    setFailure(null)
    onStop()
  }

  return {
    armed,
    failure,
    name,
    pending: deleteEnvironment.isPending,
    arm: () => {
      setFailure(null)
      setArmed(true)
    },
    cancel: () => {
      setArmed(false)
      setFailure(null)
    },
    confirm,
    stop,
  }
}

/** What each menu entry does; the rules for which entries exist are in `environment-menu.ts`. */
function useEnvironmentActionHandlers(
  model: OverviewEnvironmentsPanelModel,
  onArmDelete: () => void,
): Readonly<Record<EnvironmentActionId, () => void>> {
  const router = useRouter()
  const { orgId, projectId, selectedEnvironment } = useProjectContext()
  const environmentId = selectedEnvironment?.id ?? ''
  return {
    'preview-merged': () => model.openComposeInspect('merged'),
    'preview-prepared': () => model.openComposeInspect('prepared'),
    cacheless: () => model.openDeployConfirm('cacheless'),
    stop: () => ignorePromise(model.handleStop()),
    refresh: () => {
      model.setContainerError(null)
      ignorePromise(
        model.refetchAllContainers().catch((err) => {
          model.setContainerError(userErrorMessage(err, 'Failed to refresh'))
        }),
      )
    },
    settings: () =>
      router.push(
        projectEnvironmentSettingsHref(orgId, projectId, environmentId) as Href,
      ),
    destroy: () => model.setDestroyArmed(true),
    delete: onArmDelete,
  }
}

/**
 * The header "⋯" menu: previews, cacheless redeploy, Stop, Refresh, settings,
 * Destroy and Delete. Delete reuses the Settings rules — same server refusal
 * ("Stop it first"), two presses.
 */
function EnvironmentActionsMenu({
  model,
}: Readonly<{ model: OverviewEnvironmentsPanelModel }>) {
  const { environments, selectedEnvironment, canOwn } = useProjectContext()
  const { width } = useWindowDimensions()
  const isCompact = width < layout.desktopBreakpoint
  const [menuOpen, setMenuOpen] = useState(false)
  const buttonRef = useRef<View>(null)
  const [menuPosition, setMenuPosition] = useState({ top: 56, left: 16 })
  const remove = useOverviewEnvironmentDelete(() =>
    ignorePromise(model.handleStop()),
  )
  const handlers = useEnvironmentActionHandlers(model, remove.arm)
  const items = environmentActionItems({
    canOwn,
    canMutate: model.canMutateLifecycle,
    environmentCount: environments.length,
    hasServer: model.hasServer,
    needsPrincipal: model.needsPrincipal,
    hasContainers: model.hasContainers,
    isRunning: model.isRunning,
    busy: model.busy,
  })

  useEffect(() => {
    if (!menuOpen || isCompact) return
    buttonRef.current?.measureInWindow((x, y, w, h) => {
      setMenuPosition({ top: y + h + 6, left: Math.max(12, x + w - 280) })
    })
  }, [menuOpen, isCompact])

  if (!selectedEnvironment) return null

  const close = () => setMenuOpen(false)

  return (
    <>
      <View ref={buttonRef} collapsable={false}>
        <Pressable
          style={[styles.quietBtn, webPointer]}
          hitSlop={{ top: 6, bottom: 6 }}
          onPress={() => setMenuOpen((open) => !open)}
          accessibilityRole="button"
          accessibilityLabel="Environment actions"
          accessibilityState={{ expanded: menuOpen }}
        >
          <Text style={styles.quietBtnText}>⋯</Text>
        </Pressable>
      </View>

      <Modal
        visible={menuOpen}
        transparent
        animationType={isCompact ? 'slide' : 'fade'}
        onRequestClose={close}
      >
        <View
          style={[styles.menuBackdrop, isCompact && styles.menuBackdropCompact]}
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
                    width: 280,
                  },
            ]}
          >
            {items.map((item) => (
              <Pressable
                key={item.id}
                disabled={item.disabledReason !== null}
                style={({ pressed }) => [
                  styles.menuItem,
                  pressed && styles.menuItemPressed,
                  item.disabledReason !== null && styles.buttonDisabled,
                  webPointer,
                ]}
                onPress={() => {
                  close()
                  handlers[item.id]()
                }}
                accessibilityRole="menuitem"
                accessibilityLabel={item.label}
              >
                <Text
                  style={
                    item.tone === 'danger'
                      ? styles.quietBtnTextDanger
                      : styles.menuItemTitle
                  }
                >
                  {item.label}
                </Text>
                {item.disabledReason ?? item.hint ? (
                  <Text style={styles.menuItemSub}>
                    {item.disabledReason ?? item.hint}
                  </Text>
                ) : null}
              </Pressable>
            ))}
          </View>
        </View>
      </Modal>

      {remove.armed ? (
        <View style={styles.deleteConfirm}>
          <Text style={styles.hintInline}>
            {environmentDeletePrompt(remove.name)}
          </Text>
          <View style={styles.inlineActions}>
            <QuietButton
              label={remove.pending ? 'Deleting…' : 'Delete environment'}
              accessibilityLabel="Confirm delete environment"
              tone="danger"
              disabled={remove.pending}
              onPress={() => ignorePromise(remove.confirm())}
            />
            <QuietButton label="Cancel" onPress={remove.cancel} />
          </View>
        </View>
      ) : null}

      {remove.failure ? (
        <View style={styles.deleteConfirm}>
          <Text style={panelStyles.error}>{remove.failure.text}</Text>
          {remove.failure.needsStop ? (
            <QuietButton
              label="Stop"
              accessibilityLabel="Stop environment"
              onPress={remove.stop}
            />
          ) : null}
        </View>
      ) : null}
    </>
  )
}

/** Deploy, Restart (or Start) and the "⋯" menu — the same three in every tab's header. */
function LifecycleToolbar({
  model,
}: Readonly<{ model: OverviewEnvironmentsPanelModel }>) {
  const {
    canMutateLifecycle,
    hasServer,
    needsPrincipal,
    hasContainers,
    isRunning,
    inFlight,
    busy,
    destroyArmed,
    destroyBusy,
  } = model
  const actionDisabled = !hasServer || busy
  const deployDisabled = actionDisabled || needsPrincipal

  if (destroyArmed || destroyBusy) {
    return (
      <View style={styles.actionsRow}>
        <QuietButton
          label={destroyBusy ? 'Destroying…' : 'Confirm destroy'}
          accessibilityLabel={
            destroyBusy ? 'Destroying environment' : 'Confirm destroy'
          }
          tooltip={DESTROY_EXPLANATION}
          tone="danger"
          disabled={destroyBusy}
          onPress={() => ignorePromise(model.handleDestroy())}
        />
        <QuietButton
          label="Cancel"
          disabled={destroyBusy}
          onPress={() => model.setDestroyArmed(false)}
        />
      </View>
    )
  }

  return (
    <View style={styles.actionsRow}>
      {canMutateLifecycle ? (
        <QuietButton
          label={inFlight ? 'Working…' : 'Deploy'}
          accessibilityLabel="Deploy environment"
          tone="primary"
          disabled={deployDisabled}
          onPress={() =>
            model.openDeployConfirm(hasContainers ? 'redeploy' : 'deploy')
          }
        />
      ) : null}
      {canMutateLifecycle && hasContainers && isRunning ? (
        <QuietButton
          label="Restart"
          accessibilityLabel="Restart environment"
          disabled={actionDisabled}
          onPress={() => ignorePromise(model.runLifecycleRestart())}
        />
      ) : null}
      {canMutateLifecycle && hasContainers && !isRunning ? (
        <QuietButton
          label="Start"
          accessibilityLabel="Start environment"
          disabled={actionDisabled}
          onPress={() => ignorePromise(model.runLifecycleStart())}
        />
      ) : null}
      <EnvironmentActionsMenu model={model} />
    </View>
  )
}

/**
 * Server placement lives on the Hosting tab. When the environment has no
 * server, Deploy stays disabled — this link in the same strip says why and
 * takes the operator there.
 */
function MissingServerHostingLink({
  environmentId,
}: Readonly<{ environmentId: string }>) {
  const { orgId, projectId } = useProjectContext()
  return (
    <Link
      href={
        projectEnvironmentHostingHref(orgId, projectId, environmentId) as Href
      }
      asChild
    >
      <Pressable
        accessibilityRole="link"
        accessibilityLabel="Set a server on the Hosting tab"
        style={webPointer}
      >
        <Text style={styles.statusText}>
          No server — <Text style={styles.hostingLink}>set one in Hosting</Text>
        </Text>
      </Pressable>
    </Link>
  )
}

/**
 * A native release deploys into a system user's home; without one the daemon
 * silently skips it. Deploy stays disabled until a system user stewards every
 * source-backed service — this link in the same strip says why and takes the
 * operator to the Bindings tab.
 */
function MissingPrincipalBindingsLink({
  environmentId,
}: Readonly<{ environmentId: string }>) {
  const { orgId, projectId } = useProjectContext()
  return (
    <Link
      href={
        projectEnvironmentBindingsHref(orgId, projectId, environmentId) as Href
      }
      asChild
    >
      <Pressable
        accessibilityRole="link"
        accessibilityLabel="Assign a system user on the Bindings tab"
        style={webPointer}
      >
        <Text style={styles.statusText}>
          No system user —{' '}
          <Text style={styles.hostingLink}>assign one in Bindings</Text>
        </Text>
      </Pressable>
    </Link>
  )
}

/** Terminal outcome banner for the deploy the transcript belongs to. */
function DeployOutcomeBanner({
  status,
  error,
}: Readonly<{ status: CommandStatus; error: string | null }>) {
  if (!isTerminalCommandStatus(status)) return null
  if (status === 'succeeded') {
    return (
      <View style={styles.outcomeSuccess}>
        <Text style={styles.outcomeSuccessText}>Deploy succeeded</Text>
      </View>
    )
  }
  return (
    <View style={panelStyles.calloutWarning}>
      <Text style={panelStyles.calloutWarningText}>
        {error ?? `Deploy ${status}`}
      </Text>
    </View>
  )
}

/**
 * Live transcript for the deploy this session just enqueued. Opens
 * automatically on enqueue, can be hidden, and stays reopenable from the same
 * command id while the deploy is still tracked — including after the operator
 * looks at another environment, because the command keeps streaming either way.
 * Only a newer deploy or an explicit close (offered once the command is
 * terminal) takes it away.
 */
function DeployLogSection({
  orgId,
  openLog,
  environmentLabel,
  status,
  error,
  collapsed,
  onToggle,
  onDismiss,
}: Readonly<{
  orgId: string
  openLog: OpenDeployLog
  /** Set only while the transcript belongs to a non-selected environment. */
  environmentLabel: string | null
  status: CommandStatus
  error: string | null
  collapsed: boolean
  onToggle: () => void
  /** Provided once the command is terminal; hidden while it is still running. */
  onDismiss: (() => void) | null
}>) {
  const log = useCommandLog(orgId, openLog.serverId, openLog.commandId, {
    enabled: !collapsed,
  })

  return (
    <View style={styles.logSection}>
      <View style={styles.logSectionHeader}>
        <Text style={styles.logSectionTitle}>
          {environmentLabel
            ? `${openLog.label} output · ${environmentLabel}`
            : `${openLog.label} output`}
        </Text>
        <View style={styles.barSpacer} />
        <QuietButton
          label={collapsed ? 'Show output' : 'Hide output'}
          accessibilityLabel={
            collapsed ? 'Show deploy output' : 'Hide deploy output'
          }
          onPress={onToggle}
        />
        {onDismiss ? (
          <QuietButton
            label="Close"
            accessibilityLabel="Close deploy output"
            onPress={onDismiss}
          />
        ) : null}
      </View>
      <DeployOutcomeBanner status={status} error={error} />
      {collapsed ? null : (
        <LogTranscriptView
          lines={log.snapshot.lines}
          state={log.state}
          downloadFileName={`deploy-${openLog.commandId}.log`}
        />
      )}
    </View>
  )
}

/** Labels whose commands produce a deploy transcript worth auto-opening. */
const DEPLOY_COMMAND_LABELS = new Set<string>([
  'Deploy',
  'Redeploy',
  'Cacheless redeploy',
])

function deployModeLabel(mode: DeployConfirmMode): string {
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
    label === 'Start' ||
    label === 'Restart'
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
  refetchOne(meta.environmentId)
  if (shouldInvalidateEnvironmentsForCommand(meta.label)) {
    invalidateEnvironments()
  }
}

function deployPreviewFailureMessage(err: unknown): string | null {
  if (err instanceof DeployHealthCheckMissingError) {
    if (err.required) {
      return 'A service requires a compose healthcheck before the first start. Add healthcheck: in Compose, or set Health check policy to Disabled in service settings.'
    }
    return 'Health-check warnings are enabled for a service. Confirm the deploy from this environment, or set Health check policy to Disabled.'
  }
  if (err instanceof DeployResourceLimitExceededError) {
    return 'This start would exceed a resource limit. Review the capacity of this environment and try again.'
  }
  return null
}

function patchTrackedCommandMeta(
  current: Record<string, TrackedCommand>,
  commandId: string,
  nextStatus: CommandStatus,
  nextError: string | null,
): Record<string, TrackedCommand> {
  const latest = current[commandId]
  if (!latest || isTerminalCommandStatus(latest.status)) return current
  if (latest.status === nextStatus && latest.error === nextError) {
    return current
  }
  return {
    ...current,
    [commandId]: {
      ...latest,
      status: nextStatus,
      error: nextError,
    },
  }
}

type TrackedCommandBatchRecord = Readonly<{
  status: CommandStatus
  errorMessage?: string | null
}>

function applyTrackedCommandRecordUpdate(
  entry: TrackedCommandEntry,
  record: TrackedCommandBatchRecord,
  metaById: Record<string, TrackedCommand>,
  setCommandMeta: Dispatch<SetStateAction<Record<string, TrackedCommand>>>,
  setTrackedEntries: Dispatch<SetStateAction<readonly TrackedCommandEntry[]>>,
  refetchOne: (environmentId: string) => unknown,
  invalidateEnvironments: () => unknown,
): void {
  const meta = metaById[entry.commandId]
  if (!meta || isTerminalCommandStatus(meta.status)) return

  const nextStatus = record.status
  const nextError = record.errorMessage ?? null
  if (meta.status !== nextStatus || meta.error !== nextError) {
    setCommandMeta((current) =>
      patchTrackedCommandMeta(current, entry.commandId, nextStatus, nextError),
    )
  }

  if (!isTerminalCommandStatus(nextStatus)) return

  if (nextStatus === 'succeeded') {
    applySucceededCommandSideEffects(meta, refetchOne, invalidateEnvironments)
  }

  setTrackedEntries((current) =>
    current.filter((row) => row.commandId !== entry.commandId),
  )
}

/** Rows are joined by command id — unreadable ids drop out of the batch. */
function syncTrackedCommandBatch(
  records: readonly CommandStatusRecord[] | undefined,
  trackedEntries: readonly TrackedCommandEntry[],
  metaById: Record<string, TrackedCommand>,
  setCommandMeta: Dispatch<SetStateAction<Record<string, TrackedCommand>>>,
  setTrackedEntries: Dispatch<SetStateAction<readonly TrackedCommandEntry[]>>,
  refetchOne: (environmentId: string) => unknown,
  invalidateEnvironments: () => unknown,
): void {
  if (!records || trackedEntries.length === 0) return

  const recordsById = commandStatusById(records)
  for (const entry of trackedEntries) {
    const record = recordsById.get(entry.commandId)
    if (!record) continue
    applyTrackedCommandRecordUpdate(
      entry,
      record,
      metaById,
      setCommandMeta,
      setTrackedEntries,
      refetchOne,
      invalidateEnvironments,
    )
  }
}

/** Fire-and-forget without the `void` operator (typescript:S3735). */
function ignorePromise(promise: Promise<unknown>): void {
  promise.catch(() => {
    // Best-effort; callers surface errors via query/mutation state.
  })
}

type OverviewEnvironmentsPanelModel = Readonly<{
  orgId: string
  project: ReturnType<typeof useProjectContext>['project']
  selectedEnvironment: EnvironmentRecord | null
  baseSelected: boolean
  loading: boolean
  canMutateLifecycle: boolean
  statusLabel: string
  toneColor: string
  /** The bare running word (Running, Starting…, Stopped, …) without any placement note. */
  toneLabel: string
  hasServer: boolean
  /** A native release declares a source but no principal stewards it. */
  needsPrincipal: boolean
  hasContainers: boolean
  isRunning: boolean
  inFlight: boolean
  busy: boolean
  destroyArmed: boolean
  destroyBusy: boolean
  containerError: string | null
  actionError: string | null
  commandError: string | null
  previewOpen: PreviewOpenState | null
  deployConfirmBusy: boolean
  effectiveServerId: string | null
  placementServerLabel: string | null
  openDeployLog: OpenDeployLog | null
  deployLogCollapsed: boolean
  deployLogStatus: CommandStatus
  /** Owning environment name while the transcript is not the selected one. */
  deployLogEnvironmentLabel: string | null
  deployLogError: string | null
  toggleDeployLog: () => void
  dismissDeployLog: (() => void) | null
  openComposeInspect: (mode: ComposePreviewMode) => void
  openDeployConfirm: (confirm: DeployConfirmMode) => void
  runLifecycleStart: () => Promise<void>
  runLifecycleRestart: () => Promise<void>
  handleStop: () => Promise<void>
  handleDestroy: () => Promise<void>
  runDeployFromPreview: () => Promise<void>
  setDestroyArmed: Dispatch<SetStateAction<boolean>>
  setContainerError: Dispatch<SetStateAction<string | null>>
  setPreviewOpen: Dispatch<SetStateAction<PreviewOpenState | null>>
  refetchAllContainers: () => Promise<unknown>
}>

function useOverviewEnvironmentsPanelModel(): OverviewEnvironmentsPanelModel {
  const {
    orgId,
    projectId,
    project,
    environments,
    selectedEnvironmentId,
    selectedEnvironment,
    baseSelected,
    invalidateEnvironments,
    isSystemProject,
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
  const [previewOpen, setPreviewOpen] = useState<PreviewOpenState | null>(
    null,
  )
  const [deployConfirmBusy, setDeployConfirmBusy] = useState(false)
  const [openDeployLog, setOpenDeployLog] = useState<OpenDeployLog | null>(null)
  const [deployLogCollapsed, setDeployLogCollapsed] = useState(false)
  const queryClient = useQueryClient()

  const containersQuery = useContainersByProject(orgId, projectId, {
    environmentIds,
    observeUntilHostDeployed: isSystemProject,
  })
  const containersByEnv = containersQuery.containersByEnv
  const loading = containersQuery.isLoading
  const canMutateLifecycle = canManage && projectAllowsMutations

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
    syncTrackedCommandBatch(
      commandsQuery.data,
      trackedEntries,
      commandMetaRef.current,
      setCommandMeta,
      setTrackedEntries,
      refetchOneRef.current,
      invalidateEnvironments,
    )
  }, [commandsQuery.data, trackedEntries, invalidateEnvironments])

  const commands = commandMeta
  const inFlight = Object.values(commands).some(
    (row) => !isTerminalCommandStatus(row.status),
  )

  useEffect(() => {
    // The open transcript is keyed to the tracked command, not to the current
    // selection: `trackedEntries` keeps polling it in the background, and the
    // history list has no interval of its own, so clearing it here would strand
    // an in-flight deploy until it finished.
    setDestroyArmed(false)
    setActionError(null)
    setPreviewOpen(null)
    setDeployConfirmBusy(false)
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
    enabled: Boolean(effectiveServerId) && previewOpen != null,
  })
  const placementServerLabel = useMemo(
    () =>
      resolveServerLabel(
        effectiveServerId,
        serversQuery.data?.servers,
      ),
    [effectiveServerId, serversQuery.data?.servers],
  )
  const inheritsBaseServer =
    Boolean(selectedEnvironment) &&
    !selectedEnvironment?.serverId &&
    Boolean(projectDefaultServerId)

  // Require a system user before Deploy: without one the daemon silently
  // skips every native release ("release skipped … no project principal
  // assigned" in the transcript) and the deploy "succeeds" unreleased.
  const principalsQuery = useProjectPrincipals(orgId, projectId)
  const selectedEnvId = selectedEnvironment?.id ?? null
  const selectedEnvIds = useMemo(
    () => (selectedEnvId ? [selectedEnvId] : []),
    [selectedEnvId],
  )
  const envServicesQuery = useServicesByEnvironments(orgId, selectedEnvIds)
  const envComposeOverlay = selectedEnvironment?.options?.compose
  const projectCompose = project?.options?.compose
  const missingPrincipalServices = useMemo(() => {
    // Never gate on missing data: while the queries load (or fail) the
    // deploy path's own errors remain the backstop.
    if (!selectedEnvId || principalsQuery.data == null) return []
    if (envServicesQuery.isLoading) return []
    return unownedPrincipalRequiredServices({
      document: mergeComposeOverlay(projectCompose, envComposeOverlay),
      services: envServicesQuery.servicesByEnv[selectedEnvId] ?? [],
      principals: principalsQuery.data.principals,
    })
  }, [
    selectedEnvId,
    principalsQuery.data,
    envServicesQuery.isLoading,
    envServicesQuery.servicesByEnv,
    projectCompose,
    envComposeOverlay,
  ])
  const needsPrincipal = missingPrincipalServices.length > 0

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
    if (DEPLOY_COMMAND_LABELS.has(label)) {
      setOpenDeployLog({ environmentId, serverId, commandId: response.commandId, label })
      setDeployLogCollapsed(false)
    }
  }

  const runLifecycleAction = async (
    action: 'start' | 'restart',
    label: string,
  ) => {
    if (!selectedEnvironment) return
    setActionError(null)
    try {
      const result = await lifecycleMutation.run(action)
      if (!result.ok) {
        setActionError(
          lifecycleMutation.actionError ?? `Failed to ${action}`,
        )
        return
      }
      trackEnqueue(
        selectedEnvironment.id,
        effectiveServerId ?? selectedEnvironment.serverId,
        result.value,
        label,
      )
    } catch (err) {
      setActionError(userErrorMessage(err, `Failed to ${action}`))
    }
  }
  const runLifecycleStart = () => runLifecycleAction('start', 'Start')
  const runLifecycleRestart = () => runLifecycleAction('restart', 'Restart')

  const openComposeInspect = (mode: ComposePreviewMode) => {
    setActionError(null)
    setPreviewOpen({ purpose: 'inspect', mode })
  }

  const openDeployConfirm = (confirm: DeployConfirmMode) => {
    setActionError(null)
    setPreviewOpen({ purpose: 'confirm', mode: 'prepared', confirm })
  }

  const runDeployFromPreview = async () => {
    if (!selectedEnvironment || previewOpen?.purpose !== 'confirm') return
    const confirmMode = previewOpen.confirm ?? 'deploy'
    setActionError(null)
    setDeployConfirmBusy(true)
    try {
      const result = await deployEnvironmentMutation.run(
        confirmMode === 'cacheless' ? { noCache: true } : undefined,
      )
      if (!result.ok) {
        setActionError(
          deployEnvironmentMutation.actionError ?? 'Failed to deploy',
        )
        return
      }
      setPreviewOpen(null)
      trackEnqueue(
        selectedEnvironment.id,
        effectiveServerId ?? selectedEnvironment.serverId,
        result.value,
        deployModeLabel(confirmMode),
      )
    } catch (err) {
      const previewMessage = deployPreviewFailureMessage(err)
      if (previewMessage) {
        setPreviewOpen(null)
        setActionError(previewMessage)
        return
      }
      setActionError(userErrorMessage(err, 'Failed to deploy'))
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

  const selectedCommand =
    selectedEnvironment == null
      ? null
      : latestCommandForEnv(commands, selectedEnvironment.id)
  const commandError = resolveCommandError(selectedCommand)

  const deployLogMeta = openDeployLog
    ? (commands[openDeployLog.commandId] ?? null)
    : null
  const deployLogStatus: CommandStatus = deployLogMeta?.status ?? 'queued'
  const deployLogTerminal = isTerminalCommandStatus(deployLogStatus)
  const deployLogEnvironmentId = openDeployLog?.environmentId ?? null
  const deployLogEnvironmentLabel = useMemo(() => {
    if (!deployLogEnvironmentId) return null
    if (deployLogEnvironmentId === selectedEnvironmentId) return null
    const owner = environments.find((row) => row.id === deployLogEnvironmentId)
    return owner?.name?.trim() || 'another environment'
  }, [deployLogEnvironmentId, selectedEnvironmentId, environments])

  useEffect(() => {
    // A finished deploy is a new history row (and a settled duration on an
    // existing one) — the history list has no interval of its own.
    if (!deployLogTerminal || !deployLogEnvironmentId) return
    ignorePromise(
      queryClient.invalidateQueries({
        queryKey: queryKeys
          .org(orgId)
          .environments.deployments(deployLogEnvironmentId),
      }),
    )
  }, [deployLogTerminal, deployLogEnvironmentId, orgId, queryClient])

  const containers = selectedEnvironment
    ? (containersByEnv[selectedEnvironment.id] ?? [])
    : []
  const tone = environmentStatusTone(containers)
  const hasServer = Boolean(effectiveServerId)
  const { hasContainers, isRunning } = deriveLifecycleContainerState(
    containers,
    tone.label,
  )
  const destroyBusy = stopEnvironmentMutation.isPending
  const busy = inFlight || destroyBusy

  const statusLabel = resolveLifecycleStatusLabel(
    tone.label,
    inheritsBaseServer,
  )

  return {
    orgId,
    project,
    selectedEnvironment,
    baseSelected,
    loading,
    canMutateLifecycle,
    statusLabel,
    toneColor: tone.color,
    toneLabel: tone.label,
    hasServer,
    needsPrincipal,
    hasContainers,
    isRunning,
    inFlight,
    busy,
    destroyArmed,
    destroyBusy,
    containerError,
    actionError,
    commandError,
    previewOpen,
    deployConfirmBusy,
    effectiveServerId,
    placementServerLabel,
    openDeployLog,
    deployLogCollapsed,
    deployLogStatus,
    deployLogEnvironmentLabel,
    deployLogError: deployLogMeta?.error ?? null,
    toggleDeployLog: () => setDeployLogCollapsed((current) => !current),
    // Dismissal is only offered once the deploy is terminal — a live transcript
    // is never taken away from under the operator.
    dismissDeployLog: deployLogTerminal
      ? () => {
          setOpenDeployLog(null)
          setDeployLogCollapsed(false)
        }
      : null,
    openComposeInspect,
    openDeployConfirm,
    runLifecycleStart,
    runLifecycleRestart,
    handleStop,
    handleDestroy,
    runDeployFromPreview,
    setDestroyArmed,
    setContainerError,
    setPreviewOpen,
    refetchAllContainers: containersQuery.refetchAll,
  }
}

/** The three independent error lines the lifecycle can raise. */
function LifecycleErrorMessages({
  containerError,
  actionError,
  commandError,
}: Pick<
  OverviewEnvironmentsPanelModel,
  'containerError' | 'actionError' | 'commandError'
>) {
  return (
    <>
      {containerError ? (
        <Text style={panelStyles.error}>{containerError}</Text>
      ) : null}
      {actionError ? <Text style={panelStyles.error}>{actionError}</Text> : null}
      {commandError ? (
        <Text style={panelStyles.error}>{commandError}</Text>
      ) : null}
    </>
  )
}

const EnvironmentLifecycleContext =
  createContext<OverviewEnvironmentsPanelModel | null>(null)

/**
 * One lifecycle model per environment page. The header's buttons, the deploy
 * output under it and the Deployments tab all read this single instance, so a
 * deploy started in the header shows its output on every tab and nothing polls
 * twice. Mount it where the environment's tabs are.
 */
export function EnvironmentLifecycleProvider({
  children,
}: Readonly<{ children: ReactNode }>) {
  const model = useOverviewEnvironmentsPanelModel()
  return (
    <EnvironmentLifecycleContext.Provider value={model}>
      {children}
    </EnvironmentLifecycleContext.Provider>
  )
}

export function useEnvironmentLifecycle(): OverviewEnvironmentsPanelModel {
  const model = useContext(EnvironmentLifecycleContext)
  if (!model) {
    throw new TypeError(
      'useEnvironmentLifecycle must be used within EnvironmentLifecycleProvider',
    )
  }
  return model
}

/** Deploy, Restart and the "⋯" menu for the environment in view, with the reason a button is off. */
export function EnvironmentLifecycleActions() {
  const model = useEnvironmentLifecycle()
  const { selectedEnvironment, canMutateLifecycle, hasServer, needsPrincipal } =
    model
  if (!selectedEnvironment) return null
  let blocker = null
  if (canMutateLifecycle && !hasServer) {
    blocker = <MissingServerHostingLink environmentId={selectedEnvironment.id} />
  } else if (canMutateLifecycle && needsPrincipal) {
    blocker = (
      <MissingPrincipalBindingsLink environmentId={selectedEnvironment.id} />
    )
  }
  return (
    <View style={styles.actionsCluster}>
      {blocker}
      <LifecycleToolbar model={model} />
    </View>
  )
}

/**
 * What a lifecycle action says back: errors, the destroy warning, the live
 * deploy output and the preview / confirm sheet. Rendered once, under the
 * header, so it shows on every tab.
 */
export function EnvironmentLifecycleNotices() {
  const model = useEnvironmentLifecycle()
  const {
    orgId,
    project,
    selectedEnvironment,
    canMutateLifecycle,
    previewOpen,
    deployConfirmBusy,
    effectiveServerId,
    placementServerLabel,
    runDeployFromPreview,
    setPreviewOpen,
  } = model
  if (!selectedEnvironment) return null
  return (
    <View style={styles.root}>
      {model.destroyArmed ? (
        <Text style={styles.hintInline}>{DESTROY_ARMED_HINT}</Text>
      ) : null}

      <LifecycleErrorMessages
        containerError={model.containerError}
        actionError={model.actionError}
        commandError={model.commandError}
      />

      {model.openDeployLog ? (
        <DeployLogSection
          orgId={orgId}
          openLog={model.openDeployLog}
          environmentLabel={model.deployLogEnvironmentLabel}
          status={model.deployLogStatus}
          error={model.deployLogError}
          collapsed={model.deployLogCollapsed}
          onToggle={model.toggleDeployLog}
          onDismiss={model.dismissDeployLog}
        />
      ) : null}

      <PreviewDeploymentModal
        visible={previewOpen != null}
        orgId={orgId}
        environmentId={selectedEnvironment.id}
        environmentLabel={selectedEnvironment.name?.trim() || 'this environment'}
        canManage={canMutateLifecycle}
        placementServerId={effectiveServerId}
        placementServerLabel={placementServerLabel}
        projectCompose={project?.options?.compose}
        environmentCompose={selectedEnvironment.options?.compose}
        deploying={deployConfirmBusy}
        purpose={previewOpen?.purpose ?? 'inspect'}
        initialMode={previewOpen?.mode ?? 'merged'}
        confirmLabel={
          previewOpen?.purpose === 'confirm' && previewOpen.confirm
            ? deployModeLabel(previewOpen.confirm)
            : 'Deploy'
        }
        onCancel={() => {
          if (deployConfirmBusy) return
          setPreviewOpen(null)
        }}
        onConfirm={
          previewOpen?.purpose === 'confirm'
            ? () => {
                ignorePromise(runDeployFromPreview())
              }
            : undefined
        }
      />
    </View>
  )
}

/** Branch and deploy-on-push for the environment in view (its Settings tab). */
export function EnvironmentGitSourceSection() {
  const { orgId, project, selectedEnvironment, canMutateLifecycle } =
    useEnvironmentLifecycle()
  if (!selectedEnvironment) return null
  return (
    <EnvironmentGitSourcePanel
      orgId={orgId}
      environmentId={selectedEnvironment.id}
      projectCompose={project?.options?.compose}
      environmentCompose={selectedEnvironment.options?.compose}
      canEdit={canMutateLifecycle}
    />
  )
}

function SystemEnvironmentPanelBody() {
  const model = useEnvironmentLifecycle()
  const { selectedEnvironment, baseSelected } = model
  if (baseSelected) return null
  if (!selectedEnvironment) {
    return <Text style={styles.statusText}>No environments yet</Text>
  }
  return (
    <View style={styles.root}>
      <View style={styles.bar}>
        <View style={styles.statusCluster}>
          <StatusDot size="sm" color={model.toneColor} />
          <Text style={styles.statusText} numberOfLines={1}>
            {model.loading ? 'Loading…' : model.statusLabel}
          </Text>
        </View>
        <View style={styles.barSpacer} />
        <QuietButton
          label="Refresh"
          accessibilityLabel="Refresh environment status"
          onPress={() => {
            model.setContainerError(null)
            ignorePromise(
              model.refetchAllContainers().catch((err) => {
                model.setContainerError(userErrorMessage(err, 'Failed to refresh'))
              }),
            )
          }}
        />
      </View>
      <EnvironmentLifecycleNotices />
      <EnvironmentGitSourceSection />
      <EnvironmentDeploymentHistoryPanel
        orgId={model.orgId}
        environmentId={selectedEnvironment.id}
        canManage={model.canMutateLifecycle}
      />
    </View>
  )
}

/**
 * Platform (system) projects keep their read-only strip: status, Refresh,
 * deploy output and history. They never get the tabbed environment header.
 */
export function SystemEnvironmentPanel() {
  return (
    <EnvironmentLifecycleProvider>
      <SystemEnvironmentPanelBody />
    </EnvironmentLifecycleProvider>
  )
}

const styles = StyleSheet.create({
  root: {
    gap: spacing.sm,
  },
  logSection: {
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.borderArea,
    backgroundColor: colors.bgArea,
  },
  logSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  logSectionTitle: {
    color: colors.textTitle,
    fontSize: 13,
    fontWeight: '600',
  },
  outcomeSuccess: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: chrome.accent,
    backgroundColor: chrome.bgActive,
    borderLeftWidth: 3,
    borderLeftColor: chrome.accent,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  outcomeSuccessText: {
    color: colors.link,
    fontSize: 13,
    fontWeight: '600',
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
  hostingLink: {
    color: colors.link,
    fontWeight: '600',
  },
  barSpacer: {
    flexGrow: 1,
    minWidth: spacing.sm,
  },
  actionsCluster: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.sm,
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
    borderRadius: 8,
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
    color: colors.link,
    fontSize: 12,
    fontWeight: '700',
  },
  quietBtnTextDanger: {
    color: colors.error,
    fontSize: 12,
    fontWeight: '600',
  },
  deleteConfirm: {
    gap: spacing.xs,
    maxWidth: 420,
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
  buttonDisabled: {
    opacity: 0.45,
  },
})
