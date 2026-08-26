/**
 * GitHub App *name* (the manifest `name`).
 *
 * GitHub requires this to be unique across all Apps on that origin, so a
 * generic "TurboPanel" is often already taken. 34 characters is GitHub's cap.
 */

export const GITHUB_APP_NAME_MAX = 34

const CONTROL_CHARS_RE = /[\u0000-\u001F\u007F-\u009F\u2028\u2029]/

export function normalizeGithubAppName(name: string): string {
  return name.trim()
}

/**
 * Words the generated default draws from.
 *
 * Short, neutral and unambiguous when read aloud, because this name ends up on
 * a GitHub settings page the operator may have to find again later. Kept
 * deliberately bland — the App belongs to *their* organization.
 */
const NAME_WORDS = [
  'anchor', 'beacon', 'cedar', 'delta', 'ember', 'falcon', 'granite', 'harbor',
  'indigo', 'juniper', 'kestrel', 'lantern', 'meadow', 'nimbus', 'onyx',
  'quarry', 'ridge', 'summit', 'thicket', 'umber', 'valley', 'willow',
] as const

/** Lower-case alphanumerics only — the name has to survive GitHub's slugging. */
function randomSuffix(length = 6): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789'
  const bytes = crypto.getRandomValues(new Uint8Array(length))
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join('')
}

function randomWord(): string {
  const [index] = crypto.getRandomValues(new Uint32Array(1))
  return NAME_WORDS[(index ?? 0) % NAME_WORDS.length]!
}

/**
 * A default that will not collide: `turbopanel-<word>-<code>`.
 *
 * **GitHub App names are unique across all of GitHub**, not per account — the
 * form rejects a duplicate with "Name has already been taken", and it does so
 * *after* the operator has already left us for GitHub, so a name that is merely
 * probably-free is not good enough. The previous default was
 * `TurboPanel <hostname>`, which collides for anyone on a common host name and
 * for two instances that share one.
 *
 * The word makes the name sayable and findable in a GitHub settings list; the
 * code is what actually makes it unique. Always well inside
 * {@link GITHUB_APP_NAME_MAX}, and the operator can overwrite it.
 */
export function suggestGithubAppName(): string {
  return `turbopanel-${randomWord()}-${randomSuffix()}`
}

export function githubAppNameError(name: string): string | null {
  const trimmed = normalizeGithubAppName(name)
  if (!trimmed) return 'Name is required.'
  if ([...trimmed].length > GITHUB_APP_NAME_MAX) {
    return `GitHub App names must be ${String(GITHUB_APP_NAME_MAX)} characters or fewer.`
  }
  if (CONTROL_CHARS_RE.test(trimmed)) {
    return 'Name cannot contain control characters.'
  }
  return null
}
