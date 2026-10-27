import type { InstanceUpdateTarget } from '@/lib/instance-api'
import type {
  UpgradePhase,
  UpgradeRunStatus,
  UpgradeStepPipelineId,
  UpgradeStepStatus,
} from '@/lib/upgrade-vocabulary'
import { UPGRADE_STEP_PIPELINE } from '@/lib/upgrade-vocabulary'

const PIPELINE_SET = new Set<string>(UPGRADE_STEP_PIPELINE)

/** Human channel label (`canary` → `Canary`, `rc` → `RC`), for a build with nothing else to name it. */
export function upgradeChannelTitle(channel: string | null | undefined): string {
  const trimmed = channel?.trim()
  if (!trimmed) return 'Build'
  if (trimmed.toLowerCase() === 'rc') return 'RC'
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1)
}

/** The localized build time, or null when `builtAt` is missing or not a date. */
function formatBuiltAt(
  builtAt: string | null | undefined,
  options: Readonly<{ locale?: string; timeZone?: string }> | undefined
): string | null {
  const trimmed = builtAt?.trim()
  if (!trimmed) return null
  const date = new Date(trimmed)
  if (Number.isNaN(date.getTime())) return null
  return new Intl.DateTimeFormat(options?.locale ?? undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: options?.timeZone,
  }).format(date)
}

/**
 * A build's name is its version: `v0.1.5-canary.1`, `v0.1.5-rc.2`, `v0.1.5`
 * (older timestamp canaries too: `v0.1.1-canary.20260919-143000-abc1234`).
 * Without a version, the short commit, else the short build id; null when
 * nothing names the build.
 */
export function upgradeBuildVersionLabel(
  target: Pick<InstanceUpdateTarget, 'version' | 'commit' | 'buildId'>
): string | null {
  const version = target.version?.trim().replace(/^v/i, '')
  if (version) return `v${version}`
  const commit = target.commit?.trim()
  if (commit && commit !== 'unknown') return commit.slice(0, 12)
  const buildId = target.buildId?.trim()
  if (buildId) return buildId.slice(0, 12)
  return null
}

/**
 * Readable build line from manifest metadata: `v0.1.5-canary.1 · Sep 30, 14:30`,
 * `v0.1.5-rc.2 · Sep 30, 14:30`, `v0.1.5 · Sep 30, 14:30`. Without a date, the
 * version alone. A build with no version, commit or build id is named by its
 * channel.
 */
export function formatUpgradeBuildDisplayName(
  target: Pick<
    InstanceUpdateTarget,
    'channel' | 'builtAt' | 'version' | 'commit' | 'buildId'
  > | null,
  options?: Readonly<{ locale?: string; timeZone?: string }>
): string {
  if (!target) return 'No package on this channel'
  const head = upgradeBuildVersionLabel(target) ?? upgradeChannelTitle(target.channel)
  const formatted = formatBuiltAt(target.builtAt, options)
  return formatted === null ? head : `${head} · ${formatted}`
}

function sameCommit(a: string, b: string): boolean {
  const x = a.trim().toLowerCase()
  const y = b.trim().toLowerCase()
  if (x.length < 7 || y.length < 7) return false
  return x.startsWith(y) || y.startsWith(x)
}

/**
 * What a unit reports as installed: `0.1.3-canary.417 · a96b655`. The exact
 * build label comes from the unit when it knows it (the control plane's build
 * label); otherwise, when the installed commit is the channel target's commit,
 * it is that target's version (a promoted rc runs the canary's bytes, so only
 * the manifest knows which build it is). Otherwise the plain version plus commit.
 *
 * On the `release` channel the version is the whole story — a released build
 * is exactly its version, so `hideCommit` drops the commit and leaves the
 * version alone (never a bare commit with nothing to pair it with).
 */
export function installedBuildLabel(
  installed:
    | Readonly<{
        version?: string | null
        commit?: string | null
        label?: string | null
      }>
    | null
    | undefined,
  target?: Pick<InstanceUpdateTarget, 'commit' | 'version'> | null,
  options?: Readonly<{ hideCommit?: boolean }>
): string {
  if (!installed) return 'Unknown'
  const commit = options?.hideCommit ? null : installed.commit?.trim() || null
  let version = installed.label?.trim().replace(/^v/, '') || null
  if (!version && commit && target?.commit && target.version && sameCommit(commit, target.commit)) {
    version = target.version.trim().replace(/^v/, '')
  }
  version = version ?? (installed.version?.trim() || null)
  if (version && commit) return `${version} · ${commit.slice(0, 7)}`
  if (version) return version
  if (commit) return commit.slice(0, 7)
  return 'Unknown'
}

export function upgradeBuildDetailLines(
  target: Pick<InstanceUpdateTarget, 'version' | 'commit' | 'buildId' | 'manifestUrl'> | null
): { version: string | null; commit: string | null; manifestUrl: string | null } {
  if (!target) {
    return { version: null, commit: null, manifestUrl: null }
  }
  const version = target.version?.trim() || null
  const commitRaw = target.commit?.trim()
  const commit = commitRaw && commitRaw !== 'unknown' ? commitRaw : target.buildId?.trim() || null
  const manifestUrl = target.manifestUrl?.trim() || null
  return { version, commit, manifestUrl }
}

/** Map a step status to the pipeline id used by `WizardSteps`. */
export function mapStepStatusToPipeline(
  status: UpgradeStepStatus | null | undefined
): UpgradeStepPipelineId {
  if (!status) return 'preparing'
  if (status === 'done' || status === 'skipped') return 'done'
  if (status === 'failed' || status === 'rolled_back' || status === 'needs_attention') {
    return 'verifying'
  }
  if (PIPELINE_SET.has(status)) return status as UpgradeStepPipelineId
  if (status === 'pending' || status === 'waiting' || status === 'dispatched') return 'preparing'
  return 'preparing'
}

/**
 * Step `errorCode`s the control plane sets itself (its `UPGRADE_STEP_ERROR_CODES`).
 * A daemon may report its own reason code; that one is shown as sent.
 */
const STEP_ERROR_LABELS: Readonly<Record<string, string>> = {
  rolled_back: 'Rolled back to the previous build',
  server_offline: 'Server offline for over an hour',
  step_timeout: 'Stopped reporting progress',
  dispatch_failed: "Couldn't reach the server",
  managed_upgrade_required: 'This server needs a managed update',
  downgrade_refused: 'Already newer than the target',
  updates_paused: 'Not started because updates were paused',
  retry_later: 'Failed before; tries again later',
}

/** Run `error` codes (the control plane's `UPGRADE_RUN_ERROR_CODES`). */
const RUN_ERROR_LABELS: Readonly<Record<string, string>> = {
  colocated_daemon_failed: 'The daemon step failed',
  control_plane_failed: 'The control plane step failed',
  updates_paused: 'Stopped because updates were paused',
}

export function upgradeStepErrorLabel(code: string | null | undefined): string | null {
  const trimmed = code?.trim()
  if (!trimmed) return null
  return STEP_ERROR_LABELS[trimmed] ?? trimmed
}

export function upgradeRunErrorLabel(code: string | null | undefined): string | null {
  const trimmed = code?.trim()
  if (!trimmed) return null
  return RUN_ERROR_LABELS[trimmed] ?? trimmed
}

export type UpgradeStepOutcome = Readonly<{
  tone: 'ok' | 'muted' | 'danger' | 'pending' | 'active'
  label: string
  /** Why it ended badly (or was skipped), when the step says. */
  detail: string | null
}>

/** Characters of the server id shown as the short id. */
const SERVER_SHORT_ID_LENGTH = 8

/**
 * How a step names its server: the name, else the hostname, else the short id.
 * `shortId` is set only when a name stands in front of it, so the id is never
 * printed twice.
 */
export function upgradeServerLabel(
  step: Readonly<{ serverId: string; serverName?: string | null; hostname?: string | null }>
): { primary: string; shortId: string | null } {
  const shortId = step.serverId.slice(0, SERVER_SHORT_ID_LENGTH)
  const named = step.serverName?.trim() || step.hostname?.trim() || null
  return named ? { primary: named, shortId } : { primary: shortId, shortId: null }
}

/** The plain note a step carries after a reported restart error that turned out fine, or null. */
export function upgradeStepNote(
  step: Readonly<{ detail?: { restartNote?: string } | null }>
): string | null {
  const note = step.detail?.restartNote?.trim()
  return note || null
}

/**
 * What a step's row says. A failed, rolled-back, or stuck step reads as that —
 * never as the pipeline stage it stopped on.
 */
export function upgradeStepOutcome(
  step: Readonly<{
    status: UpgradeStepStatus | null | undefined
    errorCode?: string | null
    errorMessage?: string | null
  }>
): UpgradeStepOutcome {
  const detail = upgradeStepErrorLabel(step.errorCode)
  switch (step.status) {
    case null:
    case undefined:
      return { tone: 'muted', label: 'Not started', detail: null }
    case 'done':
      return { tone: 'ok', label: 'Done', detail: null }
    case 'skipped':
      if (step.errorCode === 'server_offline') {
        const message = step.errorMessage?.trim()
        return {
          tone: 'muted',
          label: 'Skipped: offline',
          detail: message || SKIPPED_OFFLINE_DETAIL,
        }
      }
      return { tone: 'muted', label: 'Skipped', detail }
    case 'failed':
      return { tone: 'danger', label: 'Failed', detail }
    case 'rolled_back':
      return { tone: 'danger', label: 'Rolled back', detail }
    case 'needs_attention':
      return { tone: 'pending', label: 'Needs attention', detail }
    // Not started yet: it is waiting its turn (batch) or for the server to come
    // back online, not preparing anything.
    case 'pending':
      return { tone: 'pending', label: 'Queued', detail: null }
    case 'waiting':
      return { tone: 'pending', label: 'Waiting for server', detail: null }
    default: {
      const stage = mapStepStatusToPipeline(step.status)
      return {
        tone: 'active',
        label: stage.charAt(0).toUpperCase() + stage.slice(1),
        detail: null,
      }
    }
  }
}

/** Not started: nothing to highlight in the step bar yet. */
export function stepHasStarted(status: UpgradeStepStatus | null | undefined): boolean {
  return status != null && status !== 'pending' && status !== 'waiting'
}

/** Shown for a server the update left out because it was offline. */
export const SKIPPED_OFFLINE_DETAIL =
  'It was offline when the update started. It updates on its own when it reconnects.'

function skippedBadge(errorCode: string | null | undefined): {
  tone: 'muted'
  label: string
} {
  if (errorCode === 'server_offline') return { tone: 'muted', label: 'Skipped: offline' }
  if (errorCode === 'updates_paused') return { tone: 'muted', label: 'Skipped: paused' }
  return { tone: 'muted', label: 'Skipped' }
}

/** The fleet table's Status column: what the update is doing with this server, in plain words. */
export function fleetStatusBadge(
  status: UpgradeStepStatus,
  errorCode?: string | null
): {
  tone: 'ok' | 'muted' | 'danger' | 'pending' | 'info'
  label: string
} {
  switch (status) {
    case 'done':
      return { tone: 'ok', label: 'Updated' }
    case 'skipped':
      return skippedBadge(errorCode)
    case 'failed':
      return errorCode === 'retry_later'
        ? { tone: 'pending', label: 'Tries again later' }
        : { tone: 'danger', label: 'Failed' }
    case 'rolled_back':
      return { tone: 'danger', label: 'Rolled back' }
    case 'needs_attention':
      return { tone: 'pending', label: 'Needs attention' }
    case 'pending':
      return { tone: 'muted', label: 'Waiting' }
    case 'waiting':
      return { tone: 'pending', label: 'Offline' }
    default:
      return { tone: 'info', label: 'Updating' }
  }
}

/**
 * What each step says in the progress bar. The wire ids never change; only the
 * words do, and they say which version is running: until the restart the OLD
 * process is still the one answering.
 */
const STEP_LABELS: Readonly<Record<UpgradeStepPipelineId, string>> = {
  preparing: 'Preparing',
  downloading: 'Downloading',
  installing: 'Writing new files (still running the old version)',
  restarting: 'Restarting onto the new version',
  verifying: 'Checking the new version is running',
  done: 'Done',
}

export function upgradeStepLabel(id: UpgradeStepPipelineId): string {
  return STEP_LABELS[id]
}

const STEP_TERMINAL = new Set<UpgradeStepStatus>([
  'done',
  'skipped',
  'failed',
  'rolled_back',
  'needs_attention',
])

/** A run is still working on this piece: it has a step that has not ended. */
export function stepInFlight(status: UpgradeStepStatus | null | undefined): boolean {
  return status != null && !STEP_TERMINAL.has(status)
}

function remainingSteps<T extends Readonly<{ status: UpgradeStepStatus }>>(
  steps: readonly T[]
): T[] {
  return steps.filter((step) => !STEP_TERMINAL.has(step.status))
}

type OfflineWaitStep = Readonly<{
  status: UpgradeStepStatus
  phase?: string
  connected?: boolean
  attempts?: number
}>

/** Only fleet steps are skipped when offline; platform phases still fail the run. */
function isFleetOrUnknownPhase(phase: string | undefined): boolean {
  return phase === undefined || phase === 'fleet'
}

/**
 * A step counts as waiting on an offline server only when the panel would skip
 * it: status `waiting`, no dispatch attempts yet (`attempts === 0`), and the
 * host reported not connected (`connected === false`). A missing `connected` or
 * `attempts` (older panel) is unknown, so it never counts and the page makes no
 * offline claim. A `pending` step is not skippable yet.
 */
function isOfflineWaitStep(step: OfflineWaitStep): boolean {
  if (!isFleetOrUnknownPhase(step.phase)) return false
  return step.status === 'waiting' && step.connected === false && step.attempts === 0
}

/**
 * Copy when every unfinished step is waiting on a server the panel reports as
 * offline; null otherwise (including when the panel does not say).
 */
export function offlineWaitingNotice(steps: readonly OfflineWaitStep[]): string | null {
  const remaining = remainingSteps(steps)
  if (remaining.length === 0 || !remaining.every(isOfflineWaitStep)) return null
  const n = remaining.length
  return n === 1
    ? '1 server is offline, so this update is waiting for it. It is skipped if it stays offline, and it updates on its own when it reconnects.'
    : `${n} servers are offline, so this update is waiting for them. They are skipped if they stay offline, and they update on their own when they reconnect.`
}

/**
 * True when unfinished steps are only waiting or pending for servers the panel
 * reports as offline (none in flight, none queued on a connected or unknown
 * host). Starting a new update settles that run on the control plane.
 */
export function runWaitsOnlyOnOffline(
  run: Readonly<{ steps: readonly OfflineWaitStep[] }> | null | undefined
): boolean {
  if (!run) return false
  const remaining = remainingSteps(run.steps)
  if (remaining.length === 0) return false
  return remaining.every(isOfflineWaitStep)
}

/** The step has written the new files to disk (installing is over). */
const STEP_FILES_WRITTEN = new Set<UpgradeStepStatus>(['restarting', 'verifying'])

export type PieceIdentity = Readonly<{
  version?: string | null
  commit?: string | null
  label?: string | null
}>

export type PieceStepView = Readonly<{
  status: UpgradeStepStatus | null | undefined
  toVersion?: string | null
  toCommit?: string | null
}>

export type PieceIdentityLines = Readonly<{
  /** The new files are on disk (known from the run step), else null. */
  installedOnDisk: string | null
  /** What the live process reports about itself. */
  runningNow: string
  /** The target of an in-flight run, while the files are not written yet. */
  updatingTo: string | null
  /** New files on disk, old process still running. */
  restartPending: boolean
}>

function stepTargetLabel(step: PieceStepView): string | null {
  const version = step.toVersion?.trim() || null
  const commit = step.toCommit?.trim() || null
  if (!version && !commit) return null
  return installedBuildLabel({ version, commit })
}

/**
 * The two lines under a piece's Details. `running` is what the piece reports
 * about itself (heartbeat or hello), so it is always the live process. The
 * control plane does not report the files on disk, so "Installed on disk" is
 * only known from the run step: from Restarting on, the step's target is on
 * disk. While that differs from what runs, a restart is pending.
 */
export function pieceIdentityLines(
  input: Readonly<{
    running: PieceIdentity | null | undefined
    runningLabel: string
    step: PieceStepView | null | undefined
  }>
): PieceIdentityLines {
  const { step } = input
  const target = step && stepInFlight(step.status) ? stepTargetLabel(step) : null
  const written = step?.status != null && STEP_FILES_WRITTEN.has(step.status)
  const sameAsRunning = Boolean(
    target &&
    input.running?.commit &&
    step?.toCommit &&
    sameCommit(input.running.commit, step.toCommit)
  )
  const installedOnDisk = written ? target : null
  return {
    installedOnDisk,
    runningNow: input.runningLabel,
    updatingTo: written ? null : target,
    restartPending: installedOnDisk !== null && !sameAsRunning,
  }
}

/**
 * A piece's update status: `null` means the channel state is not known (daemon
 * not connected). While a run is working on the piece it is never "Up to date".
 */
export function updateAvailabilityBadge(
  updateAvailable: boolean | null,
  inFlight = false
): {
  tone: 'ok' | 'muted' | 'pending'
  label: string
} {
  if (inFlight) return { tone: 'pending', label: 'Updating' }
  if (updateAvailable === null) return { tone: 'muted', label: 'Not connected' }
  if (updateAvailable) return { tone: 'pending', label: 'Update available' }
  return { tone: 'ok', label: 'Up to date' }
}

/** `a`, `a and b`, `a, b and c`. */
export function joinWithAnd(items: readonly string[]): string {
  if (items.length <= 1) return items.join('')
  const head = items.slice(0, -1).join(', ')
  return `${head} and ${items.at(-1)}`
}

/**
 * "Control plane v0.1.5-canary.1 and UI v0.1.5-canary.2 can be updated." —
 * which pieces have an update, each with its version, for the sentence under
 * the Status headline.
 */
export function updateAvailableSentence(items: readonly string[]): string | null {
  if (items.length === 0) return null
  const sentence = `${joinWithAnd(items)} can be updated.`
  return sentence.charAt(0).toUpperCase() + sentence.slice(1)
}

/** Which component a server row of the update describes: a server's daemon, or the control plane. */
export function fleetComponentLabel(
  row: Readonly<{ unit?: 'daemon' | 'instance' | null }>
): string {
  return row.unit === 'instance' ? 'Control plane' : 'Daemon'
}

export function upgradePhaseLabel(phase: UpgradePhase | null | undefined): string {
  switch (phase) {
    case 'colocated_daemon':
      return 'Daemon step'
    case 'control_plane':
      return 'Control plane step'
    case 'fleet':
      return 'Server updates'
    default:
      return 'Update'
  }
}

export type FleetProgressSummary = {
  upToDate: number
  total: number
  needsAttention: number
  inProgress: number
  /** Servers the update left out because they were offline (never counted as up to date). */
  skippedOffline: number
  /** Servers left out for another reason (for example a cancelled run); not up to date either. */
  skippedOther: number
}

/** The fleet progress line, e.g. `2 of 3 servers up to date, 1 skipped (offline)`. */
export function fleetProgressText(summary: FleetProgressSummary, noun: string): string {
  const base = `${summary.upToDate} of ${summary.total} ${noun} up to date`
  const parts = [base]
  if (summary.skippedOffline > 0) parts.push(`${summary.skippedOffline} skipped (offline)`)
  if (summary.skippedOther > 0) parts.push(`${summary.skippedOther} skipped`)
  return parts.join(', ')
}
const TERMINAL_BAD = new Set<UpgradeStepStatus>(['failed', 'rolled_back', 'needs_attention'])

export function summarizeFleetSteps(
  steps: readonly {
    status: UpgradeStepStatus
    phase: UpgradePhase
    errorCode?: string | null
  }[]
): FleetProgressSummary {
  const fleet = steps.filter((step) => step.phase === 'fleet')
  let upToDate = 0
  let needsAttention = 0
  let inProgress = 0
  let skippedOffline = 0
  let skippedOther = 0
  for (const step of fleet) {
    if (step.status === 'skipped') {
      if (step.errorCode === 'server_offline') skippedOffline += 1
      else skippedOther += 1
    } else if (step.status === 'done') upToDate += 1
    else if (TERMINAL_BAD.has(step.status)) needsAttention += 1
    else inProgress += 1
  }
  return {
    upToDate,
    total: fleet.length,
    needsAttention,
    inProgress,
    skippedOffline,
    skippedOther,
  }
}

export type PlatformUpgradeHeadline =
  'up_to_date' | 'update_available' | 'updating' | 'needs_attention' | 'paused'

export function resolvePlatformUpgradeHeadline(
  input: Readonly<{
    activeRunStatus: UpgradeRunStatus | null
    updateAvailable: boolean
    needsAttentionCount: number
    /** An instance admin paused all updates; that is the first thing to say. */
    paused?: boolean
  }>
): PlatformUpgradeHeadline {
  if (input.paused) return 'paused'
  if (input.needsAttentionCount > 0) return 'needs_attention'
  if (input.activeRunStatus === 'pending' || input.activeRunStatus === 'running') {
    return 'updating'
  }
  if (input.updateAvailable) return 'update_available'
  return 'up_to_date'
}

export function platformUpgradeHeadlineCopy(headline: PlatformUpgradeHeadline): string {
  switch (headline) {
    case 'up_to_date':
      return 'TurboPanel is up to date'
    case 'update_available':
      return 'Update waiting'
    case 'updating':
      return 'Updating…'
    case 'needs_attention':
      return 'Needs attention'
    case 'paused':
      return 'Updates paused'
  }
}
