const DISPLAY_NAME_PATTERN = /^[A-Za-z0-9 ._-]+$/

/**
 * Validate an environment display name.
 * @returns An error message, or `null` when valid.
 */
export function validateEnvironmentName(name: string): string | null {
  if (!name) {
    return 'Name is required.'
  }
  if (name.length > 255) {
    return 'Name must be 255 characters or fewer.'
  }
  if (!DISPLAY_NAME_PATTERN.test(name)) {
    return 'Name may only contain letters, numbers, spaces, dots, underscores, and hyphens.'
  }
  return null
}
