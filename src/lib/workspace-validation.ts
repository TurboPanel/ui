export const DISPLAY_NAME_PATTERN = /^[A-Za-z0-9 ._-]+$/

/**
 * Validate a workspace display name.
 * @returns An error message, or `null` when valid.
 */
export function validateWorkspaceName(name: string): string | null {
  const trimmedName = name.trim()

  if (!trimmedName) {
    return 'Name is required.'
  }
  if (trimmedName.length > 255) {
    return 'Name must be 255 characters or fewer.'
  }
  if (!DISPLAY_NAME_PATTERN.test(trimmedName)) {
    return 'Name may only contain letters, numbers, spaces, dots, underscores, and hyphens.'
  }

  return null
}

/**
 * Validate an optional workspace description.
 * @returns An error message, or `null` when valid.
 */
export function validateWorkspaceDescription(description: string): string | null {
  if (description.length > 255) {
    return 'Description must be 255 characters or fewer.'
  }
  return null
}
