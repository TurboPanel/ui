import type {
  DaemonSupport,
  ServerUpdateBlockedCode,
  ServerUpdateCommit,
  ServerUpdateStatus,
} from '@/lib/instance-api'

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

/** What the server said about blocked updates for one server. */
export type ServerUpdateBlock = Pick<
  ServerUpdateStatus,
  'updateBlocked' | 'updateBlockedCode' | 'updateBlockedReason'
>

const BLOCKED_LABELS: Record<ServerUpdateBlockedCode, string> = {
  control_plane_upgrade_required: 'Waiting for the control plane upgrade',
  updates_managed: 'Updates managed by TurboPanel High Availability',
  upgrade_gate_unavailable: "Updates unavailable: the control plane couldn't confirm it is ready",
  colocated_with_instance: 'Updated together with the control plane',
}

/**
 * The line to show when the server refuses updates for a server, or `null`.
 * Reads the server's `updateBlockedCode`; any code this ui does not name, and
 * a control plane that sends no code, show the server's own sentence.
 */
export function serverUpdateBlockedLabel(
  block: ServerUpdateBlock | null | undefined,
): string | null {
  const code = block?.updateBlockedCode?.trim()
  if (code && code in BLOCKED_LABELS) {
    return BLOCKED_LABELS[code as ServerUpdateBlockedCode]
  }
  if (!block?.updateBlocked && !code) return null
  return block?.updateBlockedReason?.trim() || 'Updates are blocked for this server'
}

/** The server refuses updates for this server, so offer no Update action. */
export function isServerUpdateActionHidden(
  block: ServerUpdateBlock | null | undefined,
): boolean {
  return block?.updateBlocked === true || Boolean(block?.updateBlockedCode)
}
