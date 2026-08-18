export const DISPLAY_NAME_MAX_LENGTH = 255
export const DESCRIPTION_MAX_LENGTH = 255

export const PROJECT_NAME_IN_USE_ERROR = 'project_name_in_use'
export const WORKSPACE_NAME_IN_USE_ERROR = 'workspace_name_in_use'

const LEFT_SINGLE_QUOTE = '\u2018'
const RIGHT_SINGLE_QUOTE = '\u2019'
const MODIFIER_LETTER_APOSTROPHE = '\u02BC'

/** Unicode C0/C1 controls, DEL, NUL (in C0), and line/paragraph separators. */
const DISPLAY_NAME_CONTROL_CHARS_RE =
  /[\u0000-\u001F\u007F-\u009F\u2028\u2029]/

/** Code-point length so astral characters and emoji are not double-counted. */
export function displayNameCodePointLength(value: string): number {
  return [...value].length
}

function hasDisallowedDisplayNameChars(value: string): boolean {
  return DISPLAY_NAME_CONTROL_CHARS_RE.test(value)
}

/** Fold typographic apostrophes to ASCII `'` (matches instance persist). */
export function foldDisplayNameApostrophes(name: string): string {
  return name
    .replaceAll(LEFT_SINGLE_QUOTE, "'")
    .replaceAll(RIGHT_SINGLE_QUOTE, "'")
    .replaceAll(MODIFIER_LETTER_APOSTROPHE, "'")
}

/** Trim → NFC → apostrophe-fold (matches instance persist). */
export function normalizeDisplayName(name: string): string {
  return foldDisplayNameApostrophes(name.trim().normalize('NFC'))
}

/** Trim + NFC + lowercase key used for org-scoped display-name uniqueness. */
export function normalizeDisplayNameKey(name: string): string {
  return normalizeDisplayName(name).toLowerCase()
}

/** Native header org switcher — keep the trigger readable beside the avatar. */
export const HEADER_ORG_NAME_MAX_CHARS = 20

/**
 * Truncate a display name for compact chrome (native org switcher).
 * Full names stay in menus and accessibility labels.
 */
export function truncateDisplayName(
  name: string,
  maxChars: number = HEADER_ORG_NAME_MAX_CHARS,
): string {
  const trimmed = name.trim()
  if (trimmed.length <= maxChars) {
    return trimmed
  }
  return `${trimmed.slice(0, maxChars).trimEnd()}…`
}

/**
 * Validate a required display name (org / project / workspace).
 * @returns An error message, or `null` when valid.
 */
export function validateDisplayName(name: string): string | null {
  const trimmedName = normalizeDisplayName(name)

  if (!trimmedName) {
    return 'Name is required.'
  }
  if (displayNameCodePointLength(trimmedName) > DISPLAY_NAME_MAX_LENGTH) {
    return `Name must be ${String(DISPLAY_NAME_MAX_LENGTH)} characters or fewer.`
  }
  if (hasDisallowedDisplayNameChars(trimmedName)) {
    return 'Name cannot contain control characters.'
  }

  return null
}

/**
 * Validate an optional description (length-capped).
 * @returns An error message, or `null` when valid.
 */
export function validateDescription(description: string): string | null {
  const normalized = normalizeDisplayName(description)
  if (displayNameCodePointLength(normalized) > DESCRIPTION_MAX_LENGTH) {
    return `Description must be ${String(DESCRIPTION_MAX_LENGTH)} characters or fewer.`
  }
  if (hasDisallowedDisplayNameChars(normalized)) {
    return 'Description cannot contain control characters.'
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
