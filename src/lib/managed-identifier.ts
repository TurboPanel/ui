/**
 * The name rule for a managed database login or database: letters, digits and
 * underscores, starting with a letter or underscore, and no longer than the
 * engine allows (see {@link managedIdentifierMaxLength}). The problem names
 * the rule that failed, so "ct bad!" is told about the space and the "!"
 * rather than about its first letter.
 */
import type { NameScheme } from '@/lib/principal-name-scheme'

/** Postgres identifiers. */
export const MANAGED_IDENTIFIER_MAX_LENGTH = 63
/** MySQL and MariaDB account names, which the panel also uses for database names. */
const MYSQL_FAMILY_MAX_LENGTH = 32
/** The partial name scheme adds an underscore and 11 random characters to a typed login name. */
const PARTIAL_SCHEME_SUFFIX_LENGTH = 12

/**
 * The longest name the panel accepts for this engine, the same limit the
 * server checks. A login name under the partial scheme leaves room for the
 * characters the scheme adds; a database name passes no scheme.
 */
export function managedIdentifierMaxLength(
  engine: string | null | undefined,
  scheme?: NameScheme
): number {
  const base =
    engine === 'mysql' || engine === 'mariadb'
      ? MYSQL_FAMILY_MAX_LENGTH
      : MANAGED_IDENTIFIER_MAX_LENGTH
  return scheme === 'partial' ? base - PARTIAL_SCHEME_SUFFIX_LENGTH : base
}

const START = /^[A-Za-z_]/
const ALLOWED = /^\w$/

/** Each character the rule does not allow, once, in the order typed; a space reads as "spaces". */
function disallowedCharacters(value: string): string[] {
  const seen: string[] = []
  for (const character of value) {
    if (ALLOWED.test(character)) continue
    const shown = character === ' ' ? 'spaces' : `“${character}”`
    if (!seen.includes(shown)) seen.push(shown)
  }
  return seen
}

function joinWords(words: readonly string[]): string {
  if (words.length <= 1) return words.join('')
  return `${words.slice(0, -1).join(', ')} or ${words.at(-1)}`
}

/**
 * Why `value` is not a valid name, or null when it is. `subject` starts the
 * sentence ("Username", "Database name").
 */
export function managedIdentifierProblem(
  value: string,
  subject: string,
  maxLength: number = MANAGED_IDENTIFIER_MAX_LENGTH
): string | null {
  if (value.length === 0) return `Enter a ${subject.toLowerCase()}.`
  if (!START.test(value)) return `${subject} must start with a letter or underscore.`
  const disallowed = disallowedCharacters(value)
  if (disallowed.length > 0) {
    return `${subject} can use only letters, digits and underscores, not ${joinWords(disallowed)}.`
  }
  if (value.length > maxLength) return `${subject} can be at most ${maxLength} characters.`
  return null
}
