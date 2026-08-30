import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
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
import { Link, type Href } from 'expo-router'
import { LogTranscriptView } from '@/components/org/logs/log-transcript-view'
import { panelStyles } from '@/components/ui/panel-styles'
import { EnvironmentDeploymentHistoryPanel } from '@/components/org/project/environment-deployment-history-panel'
import { StatusDot, TextField } from '@/components/ui'
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
import { validateEnvironmentName } from '@/lib/environment-validation'
import { DISPLAY_NAME_MAX_LENGTH } from '@/lib/display-name'
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
  useCreateEnvironment,
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
  projectEnvironmentBindingsHref,
  projectEnvironmentHostingHref,
} from '@/lib/project-navigation'
import { resolveEffectiveServerId } from '@/lib/project-options'
import { resolveServerLabel } from '@/lib/resource-labels'
import { queryKeys } from '@/lib/query-keys'
import { chrome, colors, layout, spacing, webPointer } from '@/lib/theme'

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
      hitSlop={{ top: 6, bottom: 6 }}
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
      <TextField
        label="Environment name"
        value={value}
        onChangeText={onChange}
        placeholder="e.g. Staging"
        autoCapitalize="none"
        autoCorrect={false}
        editable={!creating}
        maxLength={DISPLAY_NAME_MAX_LENGTH}
        accessibilityLabel="New environment name"
        error={fieldError}
      />
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

type SplitMenuItem = {
  title: string
  subtitle: string
  accessibilityLabel: string
  onPress: () => void
}

function ToolbarSplitButton({
  label,
  accessibilityLabel,
  caretAccessibilityLabel,
  primary,
  disabled,
  menuWidth = 260,
  items,
  onPrimaryPress,
}: Readonly<{
  label: string
  accessibilityLabel: string
  caretAccessibilityLabel: string
  primary?: boolean
  disabled?: boolean
  menuWidth?: number
  items: readonly SplitMenuItem[]
  onPrimaryPress: () => void
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
        left: Math.max(12, x + w - menuWidth),
      })
    })
  }, [menuOpen, isCompact, menuWidth])

  const close = () => setMenuOpen(false)

  return (
    <>
      <View ref={buttonRef} collapsable={false} style={styles.splitGroup}>
        <Pressable
          style={[
            styles.quietBtn,
            primary && styles.quietBtnPrimary,
            styles.splitPrimary,
            disabled && styles.buttonDisabled,
            webPointer,
          ]}
          disabled={disabled}
          hitSlop={{ top: 6, bottom: 6 }}
          onPress={onPrimaryPress}
          accessibilityRole="button"
          accessibilityLabel={accessibilityLabel}
        >
          <Text
            style={
              primary ? styles.quietBtnTextPrimary : styles.quietBtnText
            }
          >
            {label}
          </Text>
        </Pressable>
        <Pressable
          style={[
            styles.quietBtn,
            primary && styles.quietBtnPrimary,
            styles.splitCaret,
            disabled && styles.buttonDisabled,
            webPointer,
          ]}
          disabled={disabled}
          hitSlop={{ top: 6, bottom: 6 }}
          onPress={() => setMenuOpen((open) => !open)}
          accessibilityRole="button"
          accessibilityLabel={caretAccessibilityLabel}
          accessibilityState={{ expanded: menuOpen }}
        >
          <Text
            style={primary ? styles.caretGlyphPrimary : styles.caretGlyph}
          >
            ▾
          </Text>
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
                    width: menuWidth,
                  },
            ]}
          >
            {items.map((item) => (
              <Pressable
                key={item.accessibilityLabel}
                style={({ pressed }) => [
                  styles.menuItem,
                  pressed && styles.menuItemPressed,
                  webPointer,
                ]}
                onPress={() => {
                  close()
                  item.onPress()
                }}
                accessibilityRole="menuitem"
                accessibilityLabel={item.accessibilityLabel}
              >
                <Text style={styles.menuItemTitle}>{item.title}</Text>
                <Text style={styles.menuItemSub}>{item.subtitle}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      </Modal>
    </>
  )
}

function PreviewSplitButton({
  disabled,
  onPreviewMerged,
  onPreviewPrepared,
}: Readonly<{
  disabled: boolean
  onPreviewMerged: () => void
  onPreviewPrepared: () => void
}>) {
  return (
    <ToolbarSplitButton
      label="Preview"
      accessibilityLabel="Preview merged compose"
      caretAccessibilityLabel="Preview options"
      disabled={disabled}
      menuWidth={280}
      onPrimaryPress={onPreviewMerged}
      items={[
        {
          title: 'Merged compose',
          subtitle:
            'Project base combined with this environment’s overrides, including x-turbopanel metadata',
          accessibilityLabel: 'Preview merged compose',
          onPress: onPreviewMerged,
        },
        {
          title: 'Prepared compose',
          subtitle:
            'Deploy-ready document after variables, naming, and site split',
          accessibilityLabel: 'Preview prepared compose',
          onPress: onPreviewPrepared,
        },
      ]}
    />
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
  return (
    <ToolbarSplitButton
      label={inFlight ? 'Working…' : 'Redeploy'}
      accessibilityLabel="Redeploy environment"
      caretAccessibilityLabel="Redeploy options"
      primary
      disabled={disabled}
      menuWidth={240}
      onPrimaryPress={onRedeploy}
      items={[
        {
          title: 'Cacheless redeploy',
          subtitle: 'Rebuilds images without the Docker build cache — slower',
          accessibilityLabel: 'Cacheless redeploy',
          onPress: onCachelessRedeploy,
        },
      ]}
    />
  )
}

function LifecycleToolbar({
  hasServer,
  needsPrincipal,
  hasContainers,
  isRunning,
  inFlight,
  busy,
  destroyArmed,
  destroyBusy,
  onPreviewMerged,
  onPreviewPrepared,
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
  needsPrincipal: boolean
  hasContainers: boolean
  isRunning: boolean
  inFlight: boolean
  busy: boolean
  destroyArmed: boolean
  destroyBusy: boolean
  onPreviewMerged: () => void
  onPreviewPrepared: () => void
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
  // Deploying without a system user would "succeed" with the daemon silently
  // skipping every native release, so Deploy / Redeploy require one up front.
  // Start / Stop only touch containers that already exist and stay available.
  const deployDisabled = actionDisabled || needsPrincipal
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
      <PreviewSplitButton
        disabled={busy}
        onPreviewMerged={onPreviewMerged}
        onPreviewPrepared={onPreviewPrepared}
      />
      {showDeploy ? (
        <QuietButton
          label={inFlight ? 'Working…' : 'Deploy'}
          accessibilityLabel="Deploy environment"
          tone="primary"
          disabled={deployDisabled}
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
          disabled={deployDisabled}
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
      <StatusDot size="sm" color={toneColor} />
      <Text style={styles.statusText} numberOfLines={1}>
        {loading ? 'Loading…' : toneLabel}
      </Text>
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

function BarTrailingActions({
  showLifecycle,
  showRefreshOnly,
  hasServer,
  needsPrincipal,
  hasContainers,
  isRunning,
  inFlight,
  busy,
  destroyArmed,
  destroyBusy,
  onPreviewMerged,
  onPreviewPrepared,
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
  needsPrincipal: boolean
  hasContainers: boolean
  isRunning: boolean
  inFlight: boolean
  busy: boolean
  destroyArmed: boolean
  destroyBusy: boolean
  onPreviewMerged: () => void
  onPreviewPrepared: () => void
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
        needsPrincipal={needsPrincipal}
        hasContainers={hasContainers}
        isRunning={isRunning}
        inFlight={inFlight}
        busy={busy}
        destroyArmed={destroyArmed}
        destroyBusy={destroyBusy}
        onPreviewMerged={onPreviewMerged}
        onPreviewPrepared={onPreviewPrepared}
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
    return 'Health-check warnings are enabled for a service. Confirm deploy on the Environments tab, or set Health check policy to Disabled.'
  }
  if (err instanceof DeployResourceLimitExceededError) {
    return 'This start would exceed a resource limit. Open the Environments tab to review capacity and try again.'
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
  showLifecycleBar: boolean
  statusLabel: string
  toneColor: string
  hasServer: boolean
  /** A native release declares a source but no principal stewards it. */
  needsPrincipal: boolean
  hasContainers: boolean
  isRunning: boolean
  inFlight: boolean
  busy: boolean
  destroyArmed: boolean
  destroyBusy: boolean
  showCreate: boolean
  createName: string
  createError: string | null
  creating: boolean
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
  handleStop: () => Promise<void>
  handleDestroy: () => Promise<void>
  handleCreate: () => Promise<void>
  runDeployFromPreview: () => Promise<void>
  setDestroyArmed: Dispatch<SetStateAction<boolean>>
  setShowCreate: Dispatch<SetStateAction<boolean>>
  setCreateName: Dispatch<SetStateAction<string>>
  setCreateError: Dispatch<SetStateAction<string | null>>
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
    setSelectedEnvironmentId,
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
  const [showCreate, setShowCreate] = useState(false)
  const [createName, setCreateName] = useState('')
  const [createError, setCreateError] = useState<string | null>(null)
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
      name: trimmed,
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
  const creating = createEnvironmentMutation.isPending
  const destroyBusy = stopEnvironmentMutation.isPending
  const busy = inFlight || destroyBusy || creating

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
    showLifecycleBar: !baseSelected && Boolean(selectedEnvironment),
    statusLabel,
    toneColor: tone.color,
    hasServer,
    needsPrincipal,
    hasContainers,
    isRunning,
    inFlight,
    busy,
    destroyArmed,
    destroyBusy,
    showCreate,
    createName,
    createError,
    creating,
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
    handleStop,
    handleDestroy,
    handleCreate,
    runDeployFromPreview,
    setDestroyArmed,
    setShowCreate,
    setCreateName,
    setCreateError,
    setContainerError,
    setPreviewOpen,
    refetchAllContainers: containersQuery.refetchAll,
  }
}

/** The three independent panel-level error lines. */
function PanelErrorMessages({
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

/** Deployment history and the compose preview — both need a real environment. */
function EnvironmentDetailSections({
  orgId,
  project,
  selectedEnvironment,
  baseSelected,
  canMutateLifecycle,
  previewOpen,
  deployConfirmBusy,
  effectiveServerId,
  placementServerLabel,
  runDeployFromPreview,
  setPreviewOpen,
}: Pick<
  OverviewEnvironmentsPanelModel,
  | 'orgId'
  | 'project'
  | 'selectedEnvironment'
  | 'baseSelected'
  | 'canMutateLifecycle'
  | 'previewOpen'
  | 'deployConfirmBusy'
  | 'effectiveServerId'
  | 'placementServerLabel'
  | 'runDeployFromPreview'
  | 'setPreviewOpen'
>) {
  if (!selectedEnvironment || baseSelected) return null
  return (
    <>
      <EnvironmentDeploymentHistoryPanel
        orgId={orgId}
        environmentId={selectedEnvironment.id}
      />
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
    </>
  )
}

function OverviewEnvironmentsPanelView({
  orgId,
  project,
  selectedEnvironment,
  baseSelected,
  loading,
  canMutateLifecycle,
  showLifecycleBar,
  statusLabel,
  toneColor,
  hasServer,
  needsPrincipal,
  hasContainers,
  isRunning,
  inFlight,
  busy,
  destroyArmed,
  destroyBusy,
  showCreate,
  createName,
  createError,
  creating,
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
  deployLogError,
  toggleDeployLog,
  dismissDeployLog,
  openComposeInspect,
  openDeployConfirm,
  runLifecycleStart,
  handleStop,
  handleDestroy,
  handleCreate,
  runDeployFromPreview,
  setDestroyArmed,
  setShowCreate,
  setCreateName,
  setCreateError,
  setContainerError,
  setPreviewOpen,
  refetchAllContainers,
}: OverviewEnvironmentsPanelModel) {
  return (
    <View style={styles.root}>
      {showLifecycleBar ? (
        <View style={styles.bar}>
          <StatusAside
            baseSelected={baseSelected}
            selectedEnvironment={selectedEnvironment}
            loading={loading}
            toneColor={toneColor}
            toneLabel={statusLabel}
          />

          <View style={styles.barSpacer} />

          {selectedEnvironment && !hasServer ? (
            <MissingServerHostingLink environmentId={selectedEnvironment.id} />
          ) : null}

          {selectedEnvironment && hasServer && needsPrincipal ? (
            <MissingPrincipalBindingsLink
              environmentId={selectedEnvironment.id}
            />
          ) : null}

          <BarTrailingActions
            showLifecycle={canMutateLifecycle}
            showRefreshOnly={!canMutateLifecycle}
            hasServer={hasServer}
            needsPrincipal={needsPrincipal}
            hasContainers={hasContainers}
            isRunning={isRunning}
            inFlight={inFlight}
            busy={busy}
            destroyArmed={destroyArmed}
            destroyBusy={destroyBusy}
            onPreviewMerged={() => openComposeInspect('merged')}
            onPreviewPrepared={() => openComposeInspect('prepared')}
            onDeploy={() => openDeployConfirm('deploy')}
            onRedeploy={() => openDeployConfirm('redeploy')}
            onCachelessRedeploy={() => openDeployConfirm('cacheless')}
            onStart={() => {
              ignorePromise(runLifecycleStart())
            }}
            onStop={() => {
              ignorePromise(handleStop())
            }}
            onToggleDestroy={() => setDestroyArmed((current) => !current)}
            onConfirmDestroy={() => {
              ignorePromise(handleDestroy())
            }}
            onRefresh={() => {
              setContainerError(null)
              ignorePromise(
                refetchAllContainers().catch((err) => {
                  setContainerError(
                    err instanceof Error ? err.message : 'Failed to refresh',
                  )
                }),
              )
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
          onCreateSubmit={() => {
            ignorePromise(handleCreate())
          }}
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

      <PanelErrorMessages
        containerError={containerError}
        actionError={actionError}
        commandError={commandError}
      />

      {openDeployLog ? (
        <DeployLogSection
          orgId={orgId}
          openLog={openDeployLog}
          environmentLabel={deployLogEnvironmentLabel}
          status={deployLogStatus}
          error={deployLogError}
          collapsed={deployLogCollapsed}
          onToggle={toggleDeployLog}
          onDismiss={dismissDeployLog}
        />
      ) : null}

      <EnvironmentDetailSections
        orgId={orgId}
        project={project}
        selectedEnvironment={selectedEnvironment}
        baseSelected={baseSelected}
        canMutateLifecycle={canMutateLifecycle}
        previewOpen={previewOpen}
        deployConfirmBusy={deployConfirmBusy}
        effectiveServerId={effectiveServerId}
        placementServerLabel={placementServerLabel}
        runDeployFromPreview={runDeployFromPreview}
        setPreviewOpen={setPreviewOpen}
      />
    </View>
  )
}

/**
 * Overview lifecycle strip (Deploy / Redeploy / Start / Stop / Refresh /
 * Destroy) and env management. Project / environment / section chips live
 * in the compose editor toolbar via {@link ProjectSectionTabs}.
 * Server placement lives on the Hosting tab; when the environment has no
 * server this bar links there instead of embedding a pin.
 */
export function OverviewEnvironmentsPanel() {
  const model = useOverviewEnvironmentsPanelModel()
  return <OverviewEnvironmentsPanelView {...model} />
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
    color: chrome.accent,
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
    color: chrome.accent,
    fontWeight: '600',
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
    color: colors.textChip,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 14,
  },
  caretGlyphPrimary: {
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
  buttonDisabled: {
    opacity: 0.45,
  },
})
