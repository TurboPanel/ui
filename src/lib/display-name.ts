export const DISPLAY_NAME_PATTERN = /^[A-Za-z0-9 ._-]+$/

export const PROJECT_NAME_IN_USE_ERROR = 'project_name_in_use'
export const WORKSPACE_NAME_IN_USE_ERROR = 'workspace_name_in_use'

/** Trim + lowercase key used for org-scoped display-name uniqueness. */
export function normalizeDisplayNameKey(name: string): string {
  return name.trim().toLowerCase()
}

/**
 * Validate a required display name (project / workspace).
 * @returns An error message, or `null` when valid.
 */
export function validateDisplayName(name: string): string | null {
  const trimmedName = name.trim()

  if (!trimmedName) {
    return 'Name is required.'
  }
  if (trimmedName.length > 255) {
    return 'Name must be 255 characters or fewer.'
  }
  if (!DISPLAY_NAME_PATTERN.test(trimmedName)) {
    return (
      'Name may only contain letters, numbers, spaces, dots, underscores, and hyphens.'
    )
  }

  return null
}

/**
 * Validate an optional description (≤255).
 * @returns An error message, or `null` when valid.
 */
export function validateDescription(description: string): string | null {
  if (description.trim().length > 255) {
    return 'Description must be 255 characters or fewer.'
  }
  return null
}

/** True when `candidate` collides with an existing display name (trim + case-insensitive). */
export function isDisplayNameTaken(
  candidate: string,
  existing: readonly (string | null | undefined)[],
): boolean {
  const key = normalizeDisplayNameKey(candidate)
  if (!key) return false
  return existing.some(
    (name) => name != null && normalizeDisplayNameKey(name) === key,
  )
}

/** Map API `project_name_in_use` / `workspace_name_in_use` codes to UI copy. */
export function displayNameConflictMessage(error: string): string | null {
  if (error.includes(PROJECT_NAME_IN_USE_ERROR)) {
    return 'A project with this name already exists in the organization.'
  }
  if (error.includes(WORKSPACE_NAME_IN_USE_ERROR)) {
    return 'A workspace with this name already exists in the organization.'
  }
  return null
}
