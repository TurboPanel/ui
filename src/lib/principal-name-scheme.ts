/**
 * Principal name schemes. A principal has a display name (what the operator
 * typed, `username`) and a system name (`appliedUsername`, the account or
 * engine login actually created on the server).
 *
 * - `plain`   system name = typed name
 * - `partial` typed name + `_` + 11 random characters (the default)
 * - `random`  12 random characters, no trace of the typed name
 */
export type NameScheme = 'plain' | 'partial' | 'random'

export const NAME_SCHEMES: readonly NameScheme[] = ['plain', 'partial', 'random']

export const NAME_SCHEME_LABELS: Record<NameScheme, string> = {
  plain: 'Plain',
  partial: 'Partial (recommended default)',
  random: 'Random',
}

export const NAME_SCHEME_EXAMPLES: Record<NameScheme, string> = {
  plain: 'bob',
  partial: 'bob_x7k2m9qpz1a',
  random: 'u7k2m9x4qpz1',
}

const NAME_SCHEME_SHORT_LABELS: Record<NameScheme, string> = {
  plain: 'plain',
  partial: 'partial',
  random: 'random',
}

export type NameSchemeOption = Readonly<{
  value: NameScheme
  label: string
  detail: string
}>

export const NAME_SCHEME_OPTIONS: readonly NameSchemeOption[] = NAME_SCHEMES.map((value) => ({
  value,
  label: NAME_SCHEME_LABELS[value],
  detail: `Example: ${NAME_SCHEME_EXAMPLES[value]}`,
}))

export function isNameScheme(value: unknown): value is NameScheme {
  return value === 'plain' || value === 'partial' || value === 'random'
}

/** Lowercase scheme word for sentences ("locks new principals to partial names"). */
export function nameSchemeWord(scheme: NameScheme): string {
  return NAME_SCHEME_SHORT_LABELS[scheme]
}

export type PrincipalNameDefaults = Readonly<{
  nameScheme?: NameScheme | null
  effectiveNameScheme?: NameScheme
  schemeLocked?: boolean
  randomizedUsernames?: boolean | null
  effectiveRandomizedUsernames?: boolean
}>

/**
 * The scheme new principals get when nobody picks one. Falls back to the legacy
 * randomized-usernames flag when the control plane predates schemes.
 */
export function effectiveNameScheme(
  defaults: PrincipalNameDefaults | null | undefined
): NameScheme {
  if (defaults?.effectiveNameScheme && isNameScheme(defaults.effectiveNameScheme)) {
    return defaults.effectiveNameScheme
  }
  if (defaults?.effectiveRandomizedUsernames === false) return 'plain'
  return 'partial'
}

export function isSchemeLocked(defaults: PrincipalNameDefaults | null | undefined): boolean {
  return defaults?.schemeLocked === true
}

/**
 * The `nameScheme` to send on create: omitted when the org locks the scheme
 * (the control plane applies it) or when the operator kept the org default.
 */
export function nameSchemeForRequest(
  choice: NameScheme | null,
  defaults: PrincipalNameDefaults | null | undefined
): NameScheme | undefined {
  if (isSchemeLocked(defaults)) return undefined
  if (choice == null) return undefined
  return choice
}

export function lockedSchemeNotice(scheme: NameScheme): string {
  return `Your organization locks new principals to ${nameSchemeWord(scheme)} names.`
}

/** What the system name will look like for a typed name (the random parts are placeholders). */
export function systemNamePreview(scheme: NameScheme, typed: string): string {
  const name = typed.trim() || 'bob'
  if (scheme === 'plain') return name
  if (scheme === 'partial') return `${name}_x7k2m9qpz1a`
  return NAME_SCHEME_EXAMPLES.random
}

/** One-line description of how the system name is built and its length. */
export function systemNameLimitsText(scheme: NameScheme): string {
  if (scheme === 'plain') return 'The system name is exactly what you type.'
  if (scheme === 'partial') {
    return 'The system name is what you type plus 12 characters (an underscore and 11 random ones).'
  }
  return 'The system name is 12 random characters and never contains what you type.'
}

/** Label for a list row: `bob -> bob_x7k2m9qpz1a` only when the names differ. */
export function principalNamesLabel(username: string, appliedUsername?: string | null): string {
  if (!appliedUsername || appliedUsername === username) return username
  return `${username} -> ${appliedUsername}`
}

/** Control plane 400: the site owner's Linux user collides with a host account. */
export const USERNAME_RESERVED_COPY =
  "That name is used by the server itself (for example ftp, git, root or a service account), so a site owner can't use it. Pick another name, such as your site's name."

export const USERNAME_TOO_LONG_COPY =
  "That site owner's Linux user name is too long. Use at most 28 characters (16 with the default name scheme)."

export const USERNAME_IN_USE_COPY = 'That name is already used on this server. Pick another name.'

const PRINCIPAL_ERROR_COPY: Record<string, string> = {
  principal_scheme_locked:
    'Your organization locks the name scheme for new principals. Reload to see the current setting.',
  invalid_name_scheme: 'That name scheme is not valid. Pick Plain, Partial, or Random.',
  username_reserved: USERNAME_RESERVED_COPY,
  username_too_long: USERNAME_TOO_LONG_COPY,
  username_in_use: USERNAME_IN_USE_COPY,
}

/** Friendly copy for principal create errors; returns the message unchanged for anything else. */
export function principalSchemeErrorMessage(message: string): string {
  const code = /HTTP \d+:\s*([a-z0-9_]+)/i.exec(message)?.[1] ?? message.trim()
  return PRINCIPAL_ERROR_COPY[code] ?? message
}
