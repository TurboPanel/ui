import type {
  GitConnectionRecord,
  ProjectRecord,
  RepositoryRecord,
} from '@/lib/instance-api'

/**
 * Pure row-shaping logic for the org-level Repositories screen.
 *
 * Lives in `src/lib` rather than beside the section component so the logic is
 * inside the coverage denominator and testable without rendering the table.
 */

/** The `ProjectRecord` fields the usage index actually reads. */
export type RepositoryUsageProject = Pick<ProjectRecord, 'id' | 'name' | 'repositoryId'>

/**
 * `repository.id` → names of the projects bound to it.
 *
 * `project.repositoryId` is on the list read already, so one projects query
 * answers "used by what" for every row — no per-repository fan-out. A
 * repository absent from the map is unused and safe to delete; the server's
 * 409 stays authoritative for compose references the column misses.
 */
export function repositoryUsageIndex(
  projects: readonly RepositoryUsageProject[],
): Map<string, string[]> {
  const index = new Map<string, string[]>()
  for (const project of projects) {
    if (!project.repositoryId) continue
    const names = index.get(project.repositoryId) ?? []
    // A project may have no name yet; the id still identifies it in the cell.
    names.push(project.name ?? project.id)
    index.set(project.repositoryId, names)
  }
  for (const names of index.values()) {
    names.sort((a, b) => a.localeCompare(b))
  }
  return index
}

/** `["api"]` → `api`; `["api","web"]` → `api, web`; `[]` → `Not used`. */
export function repositoryUsageLabel(projectNames: readonly string[]): string {
  if (projectNames.length === 0) return 'Not used'
  return projectNames.join(', ')
}

/** How a repository row authenticates its clones, as a badge label. */
export type RepositoryAuthLane = {
  label: string
  kind: 'connection' | 'deploy_key' | 'anonymous'
}

/**
 * Connection rows name the connected account (that is what distinguishes two
 * installations of one App); key rows say so; a row with neither is a public
 * repository cloning anonymously — a real configuration, not a gap.
 */
export function repositoryAuthLane(
  row: Pick<RepositoryRecord, 'connectionId' | 'secretId'>,
  connections: readonly Pick<GitConnectionRecord, 'id' | 'accountLogin'>[],
): RepositoryAuthLane {
  if (row.connectionId) {
    const connection = connections.find((entry) => entry.id === row.connectionId)
    return {
      label: connection?.accountLogin ?? 'Connection',
      kind: 'connection',
    }
  }
  if (row.secretId) return { label: 'Deploy key', kind: 'deploy_key' }
  return { label: 'Anonymous', kind: 'anonymous' }
}

/** What the branch cell shows, and whether the provider disagrees with it. */
export type RepositoryBranchDisplay = {
  /** The effective branch — the operator's column value, else the detected one. */
  branch: string | null
  /**
   * Non-null only when the provider's last-detected default differs from the
   * stored branch — the drift the refresh action exists to surface.
   */
  detectedDiffers: string | null
}

export function repositoryBranchDisplay(
  row: Pick<RepositoryRecord, 'defaultBranch' | 'metadata'>,
): RepositoryBranchDisplay {
  const detected = typeof row.metadata?.detectedDefaultBranch === 'string'
    ? row.metadata.detectedDefaultBranch
    : null
  const branch = row.defaultBranch ?? detected
  const detectedDiffers = detected !== null && row.defaultBranch !== null &&
      detected !== row.defaultBranch
    ? detected
    : null
  return { branch, detectedDiffers }
}
