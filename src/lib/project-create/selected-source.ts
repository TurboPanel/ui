import type { RepositoryRecord } from '@/lib/instance-api'

/**
 * Resolve the repository the create wizard Continue button needs.
 *
 * Attach can succeed before `useRepositories()` has the new row, so the
 * attached record is a fallback while the list cache catches up.
 */
export function resolveWizardSelectedSource(
  listed: readonly RepositoryRecord[] | undefined,
  selectedSourceId: string,
  attachedSource: RepositoryRecord | null,
): RepositoryRecord | null {
  const fromList = (listed ?? []).find(
    (source) => source.id === selectedSourceId,
  )
  if (fromList) return fromList
  if (attachedSource?.id === selectedSourceId) return attachedSource
  return null
}
