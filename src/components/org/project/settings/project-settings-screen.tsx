import { useRouter, type Href } from 'expo-router'
import { useMemo, useState } from 'react'
import { ProjectDeletePanel } from '@/components/org/project-delete-panel'
import { useProjectContext } from '@/components/org/project/project-context'
import { ProjectSettingsView } from '@/components/org/project/settings/project-settings-view'
import { VariablesSection } from '@/components/org/variables-section'
import { LoadingState } from '@/components/ui'
import { projectRepositoriesHref } from '@/lib/org-navigation'
import { buildProjectOptionsPatch } from '@/lib/project-options'
import {
  environmentPageTabHref,
  isManagedProject,
  projectComposeHref,
} from '@/lib/project-navigation'
import { useUpdateProject } from '@/lib/queries'
import { useRepositories } from '@/lib/queries/releases'
import { userWorkspaces } from '@/lib/system-inventory'
import {
  buildProjectGeneralPatch,
  projectDescriptionProblem,
  projectGeneralDirty,
  projectGeneralFromRecord,
  projectGitFacts,
  projectNameProblem,
  workspaceMoveChoices,
} from '@/lib/v4/project-settings'
import { primaryEnvironmentOf } from '@/lib/v4/primary-environment'

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

  const git = useMemo(
    () => (project ? projectGitFacts(project, repositories.data?.repositories ?? []) : null),
    [project, repositories.data]
  )
  if (!project) return <LoadingState />

  const draft = edit ?? projectGeneralFromRecord(project)
  const primary = primaryEnvironmentOf(environments)
  const databaseSettings = primary
    ? environmentPageTabHref(orgId, projectId, primary.id, 'settings')
    : null
  const canEdit = canManage && projectAllowsMutations
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
    <ProjectSettingsView
      projectId={project.id}
      canEdit={canEdit}
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
      variables={
        <VariablesSection orgId={orgId} parentField={{ projectId }} embedded showPresets />
      }
      keepOriginalNames={(project.options?.containerNaming ?? 'uuid') === 'custom'}
      savingNames={busy === 'names'}
      onKeepOriginalNames={(keep) => {
        void run('names', {
          options: buildProjectOptionsPatch(project, { containerNaming: keep ? 'custom' : 'uuid' }),
          // The patch carries the Base compose along, so it names the Base.
          target: 'base',
        })
      }}
      git={git}
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
  )
}
