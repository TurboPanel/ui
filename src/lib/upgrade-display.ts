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
  managed_upgrade_required: 'This server needs a managed upgrade',
  downgrade_refused: 'Already newer than the target',
}

/** Run `error` codes (the control plane's `UPGRADE_RUN_ERROR_CODES`). */
const RUN_ERROR_LABELS: Readonly<Record<string, string>> = {
  colocated_daemon_failed: 'The co-located daemon step failed',
  control_plane_failed: 'The control-plane step failed',
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

/**
 * What a step's row says. A failed, rolled-back, or stuck step reads as that —
 * never as the pipeline stage it stopped on.
 */
export function upgradeStepOutcome(
  step: Readonly<{
    status: UpgradeStepStatus | null | undefined
    errorCode?: string | null
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

/** The fleet table's Status column: what the rollout is doing with this server, in plain words. */
export function fleetStatusBadge(status: UpgradeStepStatus): {
  tone: 'ok' | 'muted' | 'danger' | 'pending' | 'info'
  label: string
} {
  switch (status) {
    case 'done':
      return { tone: 'ok', label: 'Updated' }
    case 'skipped':
      return { tone: 'muted', label: 'Skipped' }
    case 'failed':
      return { tone: 'danger', label: 'Failed' }
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

export function upgradePhaseLabel(phase: UpgradePhase | null | undefined): string {
  switch (phase) {
    case 'colocated_daemon':
      return 'Co-located daemon'
    case 'control_plane':
      return 'Control plane'
    case 'fleet':
      return 'Fleet'
    default:
      return 'Upgrade'
  }
}

export type FleetProgressSummary = {
  upToDate: number
  total: number
  needsAttention: number
  inProgress: number
}

const TERMINAL_OK = new Set<UpgradeStepStatus>(['done', 'skipped'])
const TERMINAL_BAD = new Set<UpgradeStepStatus>(['failed', 'rolled_back', 'needs_attention'])

export function summarizeFleetSteps(
  steps: readonly { status: UpgradeStepStatus; phase: UpgradePhase }[]
): FleetProgressSummary {
  const fleet = steps.filter((step) => step.phase === 'fleet')
  let upToDate = 0
  let needsAttention = 0
  let inProgress = 0
  for (const step of fleet) {
    if (TERMINAL_OK.has(step.status)) upToDate += 1
    else if (TERMINAL_BAD.has(step.status)) needsAttention += 1
    else inProgress += 1
  }
  return {
    upToDate,
    total: fleet.length,
    needsAttention,
    inProgress,
  }
}

export type PlatformUpgradeHeadline =
  'up_to_date' | 'update_available' | 'updating' | 'needs_attention'

export function resolvePlatformUpgradeHeadline(
  input: Readonly<{
    activeRunStatus: UpgradeRunStatus | null
    updateAvailable: boolean
    needsAttentionCount: number
  }>
): PlatformUpgradeHeadline {
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
      return 'Update available'
    case 'updating':
      return 'Updating…'
    case 'needs_attention':
      return 'Needs attention'
  }
}
