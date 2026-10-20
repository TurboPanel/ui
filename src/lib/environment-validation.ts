import { validateDisplayName } from '@/lib/display-name'

/** An environment name is part of the folder path on servers: one short lowercase word. */
const ENVIRONMENT_FOLDER_NAME = /^[a-z0-9][a-z0-9_-]{0,31}$/

/** Names an environment may not take: the site owner's own folders and words kept free beside them. */
const RESERVED_ENVIRONMENT_NAMES: ReadonlySet<string> = new Set(
  'common home tmp services volumes data sites backup backups logs cache run var etc bin root public releases current shared lost-found tmp-staging'.split(
    ' '
  )
)

/** The longest an environment name can be (its folder name on the servers). */
export const ENVIRONMENT_NAME_MAX_LENGTH = 32

export const ENVIRONMENT_NAME_RULE_TEXT =
  'Use lowercase letters, digits, hyphens and underscores, up to 32 characters, starting with a letter or digit. The name becomes part of the folder path on your servers.'

/**
 * Validate an environment name.
 * @returns An error message, or `null` when valid.
 */
export function validateEnvironmentName(name: string): string | null {
  return validateDisplayName(name) ?? environmentFolderNameProblem(name)
}

/** Whether a name can be an environment's folder name (rule and reserved words only). */
export function environmentFolderNameProblem(name: string): string | null {
  const trimmed = name.trim()
  if (!ENVIRONMENT_FOLDER_NAME.test(trimmed)) return ENVIRONMENT_NAME_RULE_TEXT
  if (RESERVED_ENVIRONMENT_NAMES.has(trimmed)) {
    return `“${trimmed}” is reserved. Pick another name.`
  }
  return null
}
