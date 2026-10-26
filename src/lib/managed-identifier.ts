/**
 * The name rule for a managed database login or database: letters, digits and
 * underscores, starting with a letter or underscore, at most 63 characters.
 * The problem names the rule that failed, so "ct bad!" is told about the space
 * and the "!" rather than about its first letter.
 */

export const MANAGED_IDENTIFIER_MAX_LENGTH = 63

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
export function managedIdentifierProblem(value: string, subject: string): string | null {
  if (value.length === 0) return `Enter a ${subject.toLowerCase()}.`
  if (!START.test(value)) return `${subject} must start with a letter or underscore.`
  const disallowed = disallowedCharacters(value)
  if (disallowed.length > 0) {
    return `${subject} can use only letters, digits and underscores, not ${joinWords(disallowed)}.`
  }
  if (value.length > MANAGED_IDENTIFIER_MAX_LENGTH) {
    return `${subject} can be at most ${MANAGED_IDENTIFIER_MAX_LENGTH} characters.`
  }
  return null
}
