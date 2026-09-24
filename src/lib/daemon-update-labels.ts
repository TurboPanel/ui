import type { DaemonSupport, ServerUpdateCommit } from '@/lib/instance-api'
import { UPDATE_BLOCKED_REASONS } from '@/lib/upgrade-vocabulary'

/** The first twelve characters of a commit, or `Unknown`. */
export function shortCommit(commit?: string | null): string {
  return commit ? commit.slice(0, 12) : 'Unknown'
}

/**
 * `v0.1.0 · abc123def456` when the daemon reports a version (builds from
 * 0.1.0 on), else the commit alone — the build is still a fact without a
 * semver, the number is just not on that wire yet.
 */
export function runningBuildLabel(
  current: Pick<ServerUpdateCommit, 'commit' | 'version'> | null | undefined,
): string {
  const commit = shortCommit(current?.commit)
  const version = current?.version?.trim()
  return version ? `v${version} · ${commit}` : commit
}

/** The channel the instance follows, as a line label: `trunk` → `Trunk`. */
export function channelLabel(channel?: string | null): string {
  const trimmed = channel?.trim()
  if (!trimmed) return 'Target'
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1)
}

/** Why an unsupported daemon receives no commands, and the fix. */
export function daemonUnsupportedLabel(support: DaemonSupport): string {
  return `Daemon ${support.version ?? 'unknown'} is below the supported minimum ${support.minVersion}: it stays connected but receives no commands until it is updated.`
}

export function serverUpdateBlockedLabel(reason: string | null | undefined): string | null {
  const code = reason?.trim()
  if (!code) return null
  if (code === UPDATE_BLOCKED_REASONS.controlPlaneUpgradeRequired) {
    return 'Waiting for the control plane upgrade'
  }
  if (code === UPDATE_BLOCKED_REASONS.updatesManaged) {
    return 'Updates managed by TurboPanel High Availability'
  }
  return null
}

export function isServerUpdateActionHidden(
  reason: string | null | undefined,
): boolean {
  return reason?.trim() === UPDATE_BLOCKED_REASONS.updatesManaged
}
