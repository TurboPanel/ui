import { validateDisplayName } from '@/lib/display-name'

/**
 * Validate an environment display name.
 * @returns An error message, or `null` when valid.
 */
export function validateEnvironmentName(name: string): string | null {
  return validateDisplayName(name)
}
