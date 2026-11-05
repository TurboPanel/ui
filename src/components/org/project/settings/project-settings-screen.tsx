import { useRouter, type Href } from 'expo-router'
import { useMemo, useState, type ReactNode } from 'react'
import { IconPickerSheet } from '@/components/org/icon-picker-sheet'
import { ProjectDeletePanel } from '@/components/org/project-delete-panel'
import { useProjectContext } from '@/components/org/project/project-context'
import { ProjectTitleIcon } from '@/components/org/project/project-title-icon'
import {
  ProjectSettingsView,
  type ProjectIconRow,
} from '@/components/org/project/settings/project-settings-view'
import { LoadingState } from '@/components/ui'
import { projectRepositoriesHref } from '@/lib/org-navigation'
import { buildProjectOptionsPatch } from '@/lib/project-options'
import {
  environmentPageTabHref,
  isManagedProject,
  projectBaseHref,
  projectComposeHref,
  projectEnvironmentSettingsHref,
} from '@/lib/project-navigation'
import { iconValueLabel, isEmojiIconAllowedOf, resolvedIconValue } from '@/lib/icons'
import type { ProjectRecord } from '@/lib/instance-api'
import { useUpdateProject } from '@/lib/queries'
import { useOrganizationRecord } from '@/lib/queries/auth'
import { useRepositories, useUpdateRepository } from '@/lib/queries/releases'
import { userWorkspaces } from '@/lib/system-inventory'
import { failedRunMessage } from '@/lib/user-error'
import {
  buildProjectGeneralPatch,
  projectDescriptionProblem,
  projectGeneralDirty,
  projectGeneralFromRecord,
  projectGitFacts,
  projectNameProblem,
  projectPushDeployRows,
  workspaceMoveChoices,
} from '@/lib/v4/project-settings'
import { primaryEnvironmentOf } from '@/lib/v4/primary-environment'

/** Turn on for the project's repository auto-deploy; `run` is null without a repository. */
function useTurnOnAutoDeploy(
  orgId: string,
  repositoryId: string | null,
  setError: (error: string | null) => void
): { run: (() => void) | null; pending: boolean } {
  const update = useUpdateRepository(orgId)
  if (!repositoryId) return { run: null, pending: false }
  const run = () => {
    setError(null)
    void update.run({ repositoryId, patch: { autoDeploy: 'immediate' } }).then((result) => {
      if (!result.ok) setError(result.error ?? 'Failed to turn on auto-deploy')
    })
  }
  return { run, pending: update.isPending }
}

/**
 * The project's icon row and its picker: the icon as it draws (a stored emoji
 * draws the type glyph while the organization has emoji off), and a sheet
 * that saves through the project update. `sheet` is null while closed.
 */
function useProjectIcon(
  orgId: string,
  projectId: string,
  project: ProjectRecord | null | undefined,
  canEdit: boolean
): { row: ProjectIconRow | undefined; sheet: ReactNode } {
  const update = useUpdateProject(orgId, projectId)
  const [open, setOpen] = useState(false)
  const isEmojiIconAllowed = isEmojiIconAllowedOf(useOrganizationRecord(orgId))
  if (!project) return { row: undefined, sheet: null }
  const saveIcon = async (icon: string | null): Promise<string | null> => {
    const result = await update.run({ icon })
    return result.ok ? null : failedRunMessage(result, 'Could not save the icon.')
  }
  const row: ProjectIconRow = {
    glyph: <ProjectTitleIcon project={project} compact isEmojiIconAllowed={isEmojiIconAllowed} />,
    label: iconValueLabel(resolvedIconValue(project.icon, isEmojiIconAllowed)),
    onChoose: canEdit ? () => setOpen(true) : null,
  }
  const sheet = open ? (
    <IconPickerSheet
      value={project.icon}
      isEmojiIconAllowed={isEmojiIconAllowed}
      fallback={<ProjectTitleIcon project={{ ...project, icon: null }} compact />}
      onClose={() => setOpen(false)}
      onSave={saveIcon}
    />
  ) : null
  return { row, sheet }
}

/**
 * Project Settings tab for a Compose project, and for a managed database
 * (name, workspace and delete; its engine settings are per environment). Everything saves through the
 * one project record (`PATCH /projects/:id`), so each control reports its own
 * failure through the shell's error line.
 */
export function ProjectSettingsScreen() {
  const {
    orgId,
    projectId,
    project,
    environments,
    workspaces,
    canOwn,
    canManage,
    projectAllowsMutations,
    setError,
  } = useProjectContext()
  const router = useRouter()
  const update = useUpdateProject(orgId, projectId)
  const repositories = useRepositories(orgId, { enabled: Boolean(project?.repositoryId) })
  const [edit, setEdit] = useState<{ name: string; description: string } | null>(null)
  const [busy, setBusy] = useState<'general' | 'move' | 'names' | null>(null)
  const [dangerOpen, setDangerOpen] = useState(false)
  const turnOnAutoDeploy = useTurnOnAutoDeploy(orgId, project?.repositoryId ?? null, setError)

  const git = useMemo(
    () => (project ? projectGitFacts(project, repositories.data?.repositories ?? []) : null),
    [project, repositories.data]
  )
  const pushDeploy = useMemo(
    () =>
      project
        ? projectPushDeployRows(project, environments, repositories.data?.repositories ?? [])
        : [],
    [project, environments, repositories.data]
  )
  const canEdit = canManage && projectAllowsMutations
  const icon = useProjectIcon(orgId, projectId, project, canEdit)
  if (!project) return <LoadingState />

  const draft = edit ?? projectGeneralFromRecord(project)
  const primary = primaryEnvironmentOf(environments)
  const databaseSettings = primary
    ? environmentPageTabHref(orgId, projectId, primary.id, 'settings')
    : null
  const patch = buildProjectGeneralPatch(project, draft)

  const run = async (kind: NonNullable<typeof busy>, body: Parameters<typeof update.run>[0]) => {
    setError(null)
    setBusy(kind)
    const result = await update.run(body)
    setBusy(null)
    if (!result.ok && update.actionError) setError(update.actionError)
    return result.ok
  }

  return (
    <>
      <ProjectSettingsView
        projectId={project.id}
        canEdit={canEdit}
        icon={icon.row}
        general={{
          name: draft.name,
          description: draft.description,
          onName: (name) => setEdit({ ...draft, name }),
          onDescription: (description) => setEdit({ ...draft, description }),
          nameError: edit ? projectNameProblem(draft.name.trim()) : null,
          descriptionError: edit ? projectDescriptionProblem(draft.description.trim()) : null,
          dirty: projectGeneralDirty(project, draft),
          canSave: patch !== null,
          saving: busy === 'general',
          onSave: () => {
            if (!patch) return
            void run('general', patch).then((ok) => {
              if (ok) setEdit(null)
            })
          },
          onReset: () => setEdit(null),
        }}
        workspaces={workspaceMoveChoices(project, userWorkspaces(workspaces))}
        canMove={canOwn && projectAllowsMutations}
        moving={busy === 'move'}
        onMove={(workspaceId) => {
          void run('move', { workspaceId })
        }}
        onOpenBase={() => router.push(projectBaseHref(orgId, projectId) as Href)}
        keepOriginalNames={(project.options?.containerNaming ?? 'uuid') === 'custom'}
        savingNames={busy === 'names'}
        onKeepOriginalNames={(keep) => {
          void run('names', {
            options: buildProjectOptionsPatch(project, {
              containerNaming: keep ? 'custom' : 'uuid',
            }),
            // The patch carries the Base compose along, so it names the Base.
            target: 'base',
          })
        }}
        git={git}
        pushDeploy={pushDeploy}
        onTurnOnAutoDeploy={canEdit ? turnOnAutoDeploy.run : null}
        turningOnAutoDeploy={turnOnAutoDeploy.pending}
        onOpenEnvironmentSettings={(environmentId) =>
          router.push(projectEnvironmentSettingsHref(orgId, projectId, environmentId) as Href)
        }
        onOpenRepositories={() => router.push(projectRepositoriesHref(orgId) as Href)}
        onOpenBaseCompose={() => router.push(projectComposeHref(orgId, projectId) as Href)}
        managed={
          isManagedProject(project)
            ? {
                onOpenDatabaseSettings: databaseSettings
                  ? () => router.push(databaseSettings as Href)
                  : null,
              }
            : undefined
        }
        danger={
          canOwn && projectAllowsMutations ? (
            <ProjectDeletePanel
              orgId={orgId}
              project={project}
              onCancel={() => setDangerOpen(false)}
              onDeleted={() => router.replace(`/${orgId}/projects` as Href)}
            />
          ) : null
        }
        dangerOpen={dangerOpen}
        onToggleDanger={() => setDangerOpen((open) => !open)}
      />
      {icon.sheet}
    </>
  )
}
