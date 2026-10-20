/** Field-level validation for the create wizard's details step. */
import { environmentFolderNameProblem } from '@/lib/environment-validation'
import {
  DISPLAY_NAME_MAX_LENGTH,
  displayNameCodePointLength,
  displayNameConflictMessage,
  hasDisallowedDisplayNameChars,
  isDisplayNameTaken,
  normalizeDisplayName,
  validateDescription,
  validateDisplayName,
} from '@/lib/display-name'

/**
 * The environment name is optional (empty lets the server apply the org
 * default); when given it must be a valid folder name.
 */
function validateEnvironmentNameField(name: string): string | null {
  if (!name.trim()) return null
  if (displayNameCodePointLength(normalizeDisplayName(name)) > DISPLAY_NAME_MAX_LENGTH) {
    return `Environment name must be ${String(DISPLAY_NAME_MAX_LENGTH)} characters or fewer.`
  }
  if (hasDisallowedDisplayNameChars(normalizeDisplayName(name))) {
    return 'Environment name cannot contain control characters.'
  }
  return environmentFolderNameProblem(name)
}

export type WorkspaceMode = 'existing' | 'new'

export type FieldErrors = {
  name?: string
  description?: string
  environmentName?: string
  workspaceId?: string
  workspaceName?: string
}

/** Shown / submitted workspace name: mirrors project until the operator overrides. */
export function resolveMirroredWorkspaceName(
  projectName: string,
  workspaceName: string,
  overridden: boolean,
): string {
  if (overridden) return workspaceName.trim()
  return projectName.trim()
}

export function conflictOrRawError(
  error: string | null | undefined,
): string | null {
  if (!error) return null
  return displayNameConflictMessage(error) ?? error
}

export function validateProjectCreateFields(options: {
  name: string
  description: string
  environmentName: string
  workspaceMode: WorkspaceMode
  pickedWorkspaceId: string
  /** Ids the picker offers — existing mode must pick one of these. */
  allowedWorkspaceIds: readonly string[]
  newWorkspaceName: string
  newWorkspaceNameOverridden: boolean
  projectNames: readonly (string | null | undefined)[]
  workspaceNames: readonly (string | null | undefined)[]
}): FieldErrors {
  const errors: FieldErrors = {}
  const nameError = validateDisplayName(options.name)
  if (nameError) errors.name = nameError
  else if (isDisplayNameTaken(options.name, options.projectNames)) {
    errors.name = 'A project with this name already exists in the organization.'
  }

  const environmentError = validateEnvironmentNameField(options.environmentName)
  if (environmentError) errors.environmentName = environmentError

  const descriptionError = validateDescription(options.description)
  if (descriptionError) errors.description = descriptionError

  if (options.workspaceMode === 'existing') {
    if (!options.pickedWorkspaceId) {
      errors.workspaceId = 'Select a workspace.'
    } else if (
      !options.allowedWorkspaceIds.includes(options.pickedWorkspaceId)
    ) {
      errors.workspaceId = 'Select a user workspace.'
    }
    return errors
  }

  const workspaceName = resolveMirroredWorkspaceName(
    options.name,
    options.newWorkspaceName,
    options.newWorkspaceNameOverridden,
  )
  const workspaceNameError = validateDisplayName(workspaceName)
  if (workspaceNameError) {
    errors.workspaceName = options.newWorkspaceNameOverridden
      ? workspaceNameError
      : 'Project name is required before creating a matching workspace.'
  } else if (isDisplayNameTaken(workspaceName, options.workspaceNames)) {
    errors.workspaceName =
      'A workspace with this name already exists in the organization.'
  }

  return errors
}
