import type { RepositoryRecord } from '@/lib/instance-api'

/**
 * `https://github.com/owner/repo(.git)` → `owner/repo`, else the URL itself.
 *
 * Lives here rather than beside a screen because the label renders in several
 * places — the Repositories screen, the Services form, the create wizard —
 * wherever a repository is named. The compose document key is intentionally
 * still `x-turbopanel.source`.
 */
export function repositoryLabel(row: RepositoryRecord): string {
  const trimmed = row.repositoryUrl.replace(/\.git$/, '')
  const segments = trimmed.split(/[/:]/).filter((part) => part.length > 0)
  if (segments.length < 2) return row.repositoryUrl
  return `${segments.at(-2)}/${segments.at(-1)}`
}

/**
 * Host of a clone URL, lower-cased — `https://`, `ssh://`, and the scp-like
 * `git@host:path` form all yield the bare host, user and port stripped.
 */
function cloneUrlHost(repositoryUrl: string): string | null {
  const trimmed = repositoryUrl.trim()
  if (trimmed.length === 0) return null
  const schemeMatch = /^[a-z][a-z0-9+.-]*:\/\/([^/]+)/i.exec(trimmed)
  const scpMatch = /^([^/@\s]+@[^:/\s]+):/.exec(trimmed)
  const authority =
    schemeMatch?.[1] ??
    scpMatch?.[1] ??
    (trimmed.includes('/') ? trimmed.slice(0, trimmed.indexOf('/')) : null)
  if (!authority) return null
  const host = authority
    .slice(authority.indexOf('@') + 1)
    .replace(/:\d+$/, '')
    .toLowerCase()
  return host.length > 0 ? host : null
}

/**
 * Which forge a repository row lives on, as a badge label.
 *
 * The stored `provider` alone cannot answer this: the clone-URL lane writes
 * `git` for a public repository regardless of host (a public binding has no
 * provider API behind it), so a pasted `https://github.com/...` URL would
 * read as bare "Git". The host says what the operator actually connected.
 */
export function repositoryProviderLabel(
  row: Pick<RepositoryRecord, 'provider' | 'repositoryUrl'>
): string {
  if (row.provider === 'github') return 'GitHub'
  const host = cloneUrlHost(row.repositoryUrl)
  if (host === 'github.com') return 'GitHub'
  if (row.provider === 'gitlab' || host === 'gitlab.com' || host?.startsWith('gitlab.')) {
    return 'GitLab'
  }
  if (host === 'bitbucket.org') return 'Bitbucket'
  if (host === 'codeberg.org') return 'Codeberg'
  return 'Git'
}

/**
 * Public/Private as far as the row itself can tell. A deploy key exists to
 * read a private repository; neither key nor connection means an anonymous
 * https clone, which only works on a public one. A connection-lane row is the
 * gap — visibility is a provider fact the row does not record — so callers
 * with the provider's own summary in hand should prefer its `private` flag.
 */
export function repositoryAccessLabel(
  row: Pick<RepositoryRecord, 'connectionId' | 'secretId'>
): 'Public' | 'Private' | null {
  if (row.secretId) return 'Private'
  if (row.connectionId) return null
  return 'Public'
}
