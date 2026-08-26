import type { SourceRecord } from '@/lib/instance-api'

/**
 * `https://github.com/owner/repo(.git)` → `owner/repo`, else the URL itself.
 *
 * Lives here rather than beside a screen because the repository binding is no
 * longer a thing an operator manages on one page — it is created on attach and
 * displayed wherever a service names its source.
 */
export function repositoryLabel(row: SourceRecord): string {
  const trimmed = row.repositoryUrl.replace(/\.git$/, '')
  const segments = trimmed.split(/[/:]/).filter((part) => part.length > 0)
  if (segments.length < 2) return row.repositoryUrl
  return `${segments.at(-2)}/${segments.at(-1)}`
}
