import type { InstanceUpdateTarget } from '@/lib/instance-api'
import type {
  UpgradePhase,
  UpgradeRunStatus,
  UpgradeStepPipelineId,
  UpgradeStepStatus,
} from '@/lib/upgrade-vocabulary'
import { UPGRADE_STEP_PIPELINE } from '@/lib/upgrade-vocabulary'

const PIPELINE_SET = new Set<string>(UPGRADE_STEP_PIPELINE)

/** Human channel label for build names (`canary` → `Canary`). */
export function upgradeChannelTitle(channel: string | null | undefined): string {
  const trimmed = channel?.trim()
  if (!trimmed) return 'Build'
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1)
}

/**
 * Readable build line: `Canary · Sep 19, 14:30` from manifest metadata.
 * Falls back to version or short commit when `builtAt` is missing.
 */
export function formatUpgradeBuildDisplayName(
  target: Pick<InstanceUpdateTarget, 'channel' | 'builtAt' | 'version' | 'commit' | 'buildId'> | null,
  options?: Readonly<{ locale?: string; timeZone?: string }>,
): string {
  if (!target) return 'No package on this channel'
  const channel = upgradeChannelTitle(target.channel)
  const builtAt = target.builtAt?.trim()
  if (builtAt) {
    const date = new Date(builtAt)
    if (!Number.isNaN(date.getTime())) {
      const formatted = new Intl.DateTimeFormat(options?.locale ?? undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: options?.timeZone,
      }).format(date)
      return `${channel} · ${formatted}`
    }
  }
  const version = target.version?.trim()
  if (version) return `${channel} · v${version}`
  const commit = target.commit?.trim()
  if (commit && commit !== 'unknown') return `${channel} · ${commit.slice(0, 12)}`
  const buildId = target.buildId?.trim()
  if (buildId) return `${channel} · ${buildId.slice(0, 12)}`
  return channel
}

export function upgradeBuildDetailLines(
  target: Pick<InstanceUpdateTarget, 'version' | 'commit' | 'buildId' | 'manifestUrl'> | null,
): { version: string | null; commit: string | null; manifestUrl: string | null } {
  if (!target) {
    return { version: null, commit: null, manifestUrl: null }
  }
  const version = target.version?.trim() || null
  const commitRaw = target.commit?.trim()
  const commit =
    commitRaw && commitRaw !== 'unknown' ? commitRaw : target.buildId?.trim() || null
  const manifestUrl = target.manifestUrl?.trim() || null
  return { version, commit, manifestUrl }
}

/** Map a step status to the pipeline id used by `WizardSteps`. */
export function mapStepStatusToPipeline(
  status: UpgradeStepStatus | null | undefined,
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
  steps: readonly { status: UpgradeStepStatus; phase: UpgradePhase }[],
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
  | 'up_to_date'
  | 'update_available'
  | 'updating'
  | 'needs_attention'

export function resolvePlatformUpgradeHeadline(input: Readonly<{
  activeRunStatus: UpgradeRunStatus | null
  updateAvailable: boolean
  needsAttentionCount: number
}>): PlatformUpgradeHeadline {
  if (input.needsAttentionCount > 0) return 'needs_attention'
  if (
    input.activeRunStatus === 'pending' ||
    input.activeRunStatus === 'running'
  ) {
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
