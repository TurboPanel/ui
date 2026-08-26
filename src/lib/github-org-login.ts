/**
 * GitHub organization login (the slug in github.com/<login>), used when the
 * manifest flow should create the App under an organization instead of the
 * operator's personal account.
 *
 * Distinct from a TurboPanel organization id — this value is sent to GitHub as
 * `organizationLogin` and becomes `/organizations/<login>/settings/apps/new`.
 */

/** Strip surrounding space and `@` people type from mentions. */
export function normalizeGithubOrgLogin(value: string): string {
  return value.trim().replaceAll('@', '')
}

/**
 * GitHub logins are 1–39 characters, alphanumeric plus internal hyphens.
 * Reject paths and spaces so a pasted profile URL cannot become the slug.
 */
export function isValidGithubOrgLogin(value: string): boolean {
  const login = normalizeGithubOrgLogin(value)
  if (login.length === 0 || login.length > 39) return false
  if (login.includes('/') || /\s/.test(login)) return false
  return /^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?$/.test(login)
}

export function githubOrgLoginError(value: string): string | null {
  const login = normalizeGithubOrgLogin(value)
  if (login.length === 0) {
    return 'Enter the GitHub organization login, or choose Personal account.'
  }
  if (!isValidGithubOrgLogin(login)) {
    return 'Use the organization login from github.com/<login> — letters, numbers, and hyphens only.'
  }
  return null
}
