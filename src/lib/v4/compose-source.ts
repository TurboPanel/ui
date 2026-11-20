/**
 * A Git project's Base and the repository's compose file, in plain words.
 *
 * A project made from a repository's compose file follows it: each deploy
 * reads the file at the commit it deploys and uses it as the Base, so the Base
 * cannot be edited. Stopping to follow keeps the last content as an editable
 * Base. Pure: records in, text out.
 */

import { formatRelativeLocalDateTime } from '@/lib/format-datetime'
import { sha256Hex } from '@/lib/v4/sha256'
import { environmentDisplayName } from '@/lib/resource-labels'
import type {
  ComposeBaseRecord,
  DeploymentHistoryRecord,
  EnvironmentRecord,
  ProjectComposeSource,
  ProjectRecord,
} from '@/lib/instance-api'
import {
  normalizeBranch,
  readEnvironmentSourceBindings,
} from '@/lib/compose/environment-source-branch'

export type CreateComposeSource = Omit<
  ProjectComposeSource,
  'mode' | 'lastReadCommitSha' | 'lastReadDigest'
>

/** The repository file this project's Base came from, or `null` when it has none. */
export function composeSourceOf(
  project: Pick<ProjectRecord, 'options'> | null | undefined
): ProjectComposeSource | null {
  return project?.options?.composeSource ?? null
}

/** True while every deploy takes the Base from the repository file. */
export function isFollowingRepository(
  project: Pick<ProjectRecord, 'options'> | null | undefined
): boolean {
  return composeSourceOf(project)?.mode === 'track'
}

/** The first seven characters of a commit, the way the releases list shows one. */
export function shortCommit(sha: string): string {
  return sha.slice(0, 7)
}

/**
 * When the newest deploy that used the file at `commitSha` was queued, from a
 * deploy history (any order). `null` when no listed deploy used that commit.
 */
export function lastReadTime(
  deployments: readonly DeploymentHistoryRecord[] | undefined,
  commitSha: string | undefined
): string | null {
  if (!commitSha) return null
  let newest: string | null = null
  for (const deployment of deployments ?? []) {
    const when = deployment.queuedAt ?? deployment.startedAt
    if (deployment.composeBase?.commitSha !== commitSha || !when) continue
    if (newest === null || when > newest) newest = when
  }
  return newest
}

/**
 * "Following compose.yaml on main; last read at 1a2b3c4 5m ago (…)".
 * `branch` is the project's own branch, `null` when the repository's default
 * applies. A commit that no deploy has read yet says so.
 */
export function followingNote(
  source: ProjectComposeSource,
  options: Readonly<{ defaultBranch?: string | null; readAt?: string | null }> = {}
): string {
  const branch = normalizeBranch(source.ref) ?? normalizeBranch(options.defaultBranch)
  const where = branch ? `${source.path} on ${branch}` : `${source.path} in the repository`
  const commit = source.lastReadCommitSha ?? source.seededCommitSha
  const time = options.readAt ? ` ${formatRelativeLocalDateTime(options.readAt)}` : ''
  return `Following ${where}; last read at ${shortCommit(commit)}${time}`
}

/** One line of what the last deploy of an environment used: "Base from compose.yaml at 1a2b3c4 (main)". */
export function baseUsedLine(base: ComposeBaseRecord): string {
  return `Base from ${base.path} at ${shortCommit(base.commitSha)} (${base.ref})`
}

export type EnvironmentBranchRow = Readonly<{
  id: string
  name: string
  branch: string
}>

/**
 * The environments that deploy from another branch than the project's own,
 * with the branch whose file they read. An environment's branch is the one its
 * Git-bound service builds (its own override); the control plane reads the
 * compose file on that same branch.
 */
export function environmentBranchRows(
  project: Pick<ProjectRecord, 'options'>,
  environments: readonly Pick<EnvironmentRecord, 'id' | 'name' | 'options'>[],
  sourceId: string,
  ownBranch: string | null
): EnvironmentBranchRow[] {
  const rows: EnvironmentBranchRow[] = []
  for (const environment of environments) {
    const binding = readEnvironmentSourceBindings({
      projectCompose: project.options?.compose,
      environmentCompose: environment.options?.compose,
      repositoryDefaultBranch: () => null,
    }).find(
      (candidate) => candidate.sourceId === sourceId && candidate.branchFrom === 'environment'
    )
    if (!binding?.branch || binding.branch === ownBranch) continue
    rows.push({
      id: environment.id,
      name: environmentDisplayName(environment),
      branch: binding.branch,
    })
  }
  return rows
}

/**
 * Project settings saves (container names, default server) send the Base along,
 * which the control plane refuses while the project follows the repository.
 * The sentence to show instead of sending, or `null` when the save can go.
 */
export function settingsSaveBlockedMessage(
  project: Pick<ProjectRecord, 'options'> | null | undefined
): string | null {
  return isFollowingRepository(project)
    ? 'Stop following the repository\u2019s compose file in the Base first. Then this setting can be saved.'
    : null
}

/**
 * The `composeSource` a new project is created with, from the file the wizard
 * read. `ref` is the branch read; the digest is of the exact bytes the control
 * plane later compares a deploy's read against.
 */
export function composeSourceForCreate(
  read: Readonly<{
    sourceId: string
    branch: string | undefined
    path: string
    commitSha: string
    content: string
  }>
): CreateComposeSource {
  const ref = normalizeBranch(read.branch)
  return {
    sourceId: read.sourceId,
    ...(ref ? { ref } : {}),
    path: read.path,
    seededCommitSha: read.commitSha,
    seededDigest: sha256Hex(read.content),
  }
}
