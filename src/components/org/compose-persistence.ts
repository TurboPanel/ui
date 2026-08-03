import {
  isForbiddenError,
  updateEnvironment,
  updateProject,
  type ComposeDocument,
  type ProjectRecord,
} from '@/lib/instance-api'
import { buildProjectOptionsPatch, mergeProjectOptionsLocal } from '@/lib/project-options'

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback
}

export type PersistProjectComposeArgs = Readonly<{
  projectId: string
  project: ProjectRecord
  compose: ComposeDocument
  setProject: (project: ProjectRecord | null) => void
  setError: (error: string | null) => void
  setSaving: (saving: boolean) => void
  handleUnauthorized: () => void | Promise<void>
}>

export async function persistProjectCompose({
  projectId,
  project,
  compose,
  setProject,
  setError,
  setSaving,
  handleUnauthorized,
}: PersistProjectComposeArgs): Promise<void> {
  setSaving(true)
  setError(null)
  try {
    const options = buildProjectOptionsPatch(project, { compose })
    await updateProject(projectId, { options })
    setProject({
      ...project,
      options: mergeProjectOptionsLocal(project.options, options),
    })
  } catch (err) {
    if (isForbiddenError(err)) {
      await handleUnauthorized()
      return
    }
    setError(err instanceof Error ? err.message : 'Failed to save compose')
  } finally {
    setSaving(false)
  }
}

export type PersistEnvironmentComposeArgs = Readonly<{
  environmentId: string
  compose: ComposeDocument
  onSaved?: () => void | Promise<void>
  setError: (error: string | null) => void
  setSaving: (saving: boolean) => void
  handleUnauthorized: () => void | Promise<void>
}>

export async function persistEnvironmentCompose({
  environmentId,
  compose,
  onSaved,
  setError,
  setSaving,
  handleUnauthorized,
}: PersistEnvironmentComposeArgs): Promise<void> {
  setSaving(true)
  setError(null)
  try {
    await updateEnvironment(environmentId, { options: { compose } })
    await onSaved?.()
  } catch (err) {
    if (isForbiddenError(err)) {
      await handleUnauthorized()
      return
    }
    setError(errorMessage(err, 'Failed to save compose overlay'))
  } finally {
    setSaving(false)
  }
}
