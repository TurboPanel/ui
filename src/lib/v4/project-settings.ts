import { validateDescription, validateDisplayName } from '@/lib/display-name'
import type {
  ProjectRecord,
  RepositoryAutoDeploy,
  RepositoryRecord,
  WorkspaceRecord,
} from '@/lib/instance-api'
import { REPOSITORY_AUTO_DEPLOY_OPTIONS } from '@/lib/instance-api'
import { repositoryLabel } from '@/lib/repository-label'

/** What the person typed in the General section. */
export type ProjectGeneralDraft = Readonly<{ name: string; description: string }>

/** The saved General values, as the form starts from them. */
export function projectGeneralFromRecord(project: ProjectRecord): ProjectGeneralDraft {
  return { name: project.name ?? '', description: project.description ?? '' }
}

/** What is wrong with the name, or null. A project cannot be saved without one. */
export function projectNameProblem(name: string): string | null {
  return validateDisplayName(name)
}

/** What is wrong with the description, or null (it may be empty). */
export function projectDescriptionProblem(description: string): string | null {
  return validateDescription(description)
}

/**
 * The PATCH body for a General save: only the fields that changed, trimmed.
 * `null` when nothing changed or the name is not valid, so Save stays hidden.
 */
export function buildProjectGeneralPatch(
  project: ProjectRecord,
  draft: ProjectGeneralDraft,
): { name?: string; description?: string } | null {
  const name = draft.name.trim()
  const description = draft.description.trim()
  if (projectNameProblem(name) || projectDescriptionProblem(description)) return null
  const saved = projectGeneralFromRecord(project)
  const patch: { name?: string; description?: string } = {}
  if (name !== saved.name.trim()) patch.name = name
  if (description !== saved.description.trim()) patch.description = description
  return Object.keys(patch).length > 0 ? patch : null
}

/** Save is shown only when something changed (the design's "Save, only when dirty"). */
export function projectGeneralDirty(
  project: ProjectRecord,
  draft: ProjectGeneralDraft,
): boolean {
  const saved = projectGeneralFromRecord(project)
  return draft.name.trim() !== saved.name.trim() || draft.description.trim() !== saved.description.trim()
}

/** The Git row: which repository the project is, and when a push deploys. */
export type ProjectGitFacts = Readonly<{
  repository: string
  pushTiming: string
}>

function pushTimingLabel(autoDeploy: RepositoryAutoDeploy): string {
  return REPOSITORY_AUTO_DEPLOY_OPTIONS.find((option) => option.value === autoDeploy)?.label ?? autoDeploy
}

/**
 * What the project's Git row says, from the repository list. `null` when the
 * project is not repository-backed, or the list has no such row (the section
 * is then left out rather than guessed).
 */
export function projectGitFacts(
  project: ProjectRecord,
  repositories: readonly RepositoryRecord[],
): ProjectGitFacts | null {
  if (!project.repositoryId) return null
  const row = repositories.find((repository) => repository.id === project.repositoryId)
  if (!row) return null
  return { repository: repositoryLabel(row), pushTiming: pushTimingLabel(row.autoDeploy) }
}

/** Workspaces a project can move to, by name, the current one first. */
export function workspaceMoveChoices(
  project: ProjectRecord,
  workspaces: readonly WorkspaceRecord[],
): readonly { id: string; label: string; current: boolean }[] {
  return workspaces
    .map((workspace) => ({
      id: workspace.id,
      label: workspace.name?.trim() || 'Workspace',
      current: workspace.id === project.workspaceId,
    }))
    .sort((a, b) => Number(b.current) - Number(a.current) || a.label.localeCompare(b.label))
}
