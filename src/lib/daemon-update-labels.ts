import type { DaemonSupport, ServerUpdateCommit } from '@/lib/instance-api'

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
  current: Pick<ServerUpdateCommit, 'commit' | 'version'> | null | undefined
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

const UNSUPPORTED_FALLBACK =
  'This daemon is out of date. It stays connected but gets no commands until it is updated.'

/**
 * Why an unsupported daemon receives no commands. Uses the control plane's own
 * `reason` when it sends one (older control planes do not), minus its machine
 * code prefix; otherwise a plain line that needs no fields.
 */
export function daemonUnsupportedLabel(support: DaemonSupport): string {
  const reason = support.reason
    ?.trim()
    .replace(/^[a-z]+(?:_[a-z]+)+:\s*/, '')
    .replace(/\s*[—-]\s*update the daemon\.?$/, '')
  if (!reason) return UNSUPPORTED_FALLBACK
  const sentence = reason.charAt(0).toUpperCase() + reason.slice(1)
  return `${sentence.replace(/\.$/, '')}. It stays connected but gets no commands until it is updated.`
}
