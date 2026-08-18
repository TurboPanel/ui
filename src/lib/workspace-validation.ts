import { validateDescription, validateDisplayName } from '@/lib/display-name'

/**
 * Validate a workspace display name.
 * @returns An error message, or `null` when valid.
 */
export function validateWorkspaceName(name: string): string | null {
  return validateDisplayName(name)
}

/**
 * Validate an optional workspace description.
 * @returns An error message, or `null` when valid.
 */
export function validateWorkspaceDescription(description: string): string | null {
  return validateDescription(description)
}
