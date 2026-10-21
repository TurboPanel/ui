/**
 * "Connect straight through (no connection sharing)": a per-login switch for
 * PostgreSQL logins. The control plane reports the effective value
 * (`straightThrough`, always false with a source limit) and whether it is the
 * default (`straightThroughDefault`). These helpers keep the copy and the
 * default rule in one place.
 */

export const STRAIGHT_THROUGH_LABEL = 'Connect straight through (no connection sharing)'

export const STRAIGHT_THROUGH_HELP =
  'One database connection per client session, no connection reuse, no read split. Needed by some drivers, such as the Node postgres driver and drizzle.'

export const STRAIGHT_THROUGH_LIMITED_HINT =
  'Not available while this login is limited to certain addresses'

export const STRAIGHT_THROUGH_DEFAULT_HINT = 'default'

/** Only PostgreSQL logins have the switch. */
export function supportsStraightThrough(engine: string | null | undefined): boolean {
  return engine === 'postgres'
}

/** What the control plane picks when the owner never chose: on for a Migration (owner) login. */
export function straightThroughDefaultFor(privileges: readonly string[]): boolean {
  return privileges.includes('owner')
}

/**
 * The value the new-login form shows: the owner's choice if there is one,
 * otherwise the default for the chosen level; always off with a source limit.
 */
export function newLoginStraightThrough(
  choice: boolean | null,
  privileges: readonly string[],
  limited: boolean
): boolean {
  if (limited) return false
  return choice ?? straightThroughDefaultFor(privileges)
}

/**
 * The create field to send: only an explicit choice, and never with a source
 * limit (the control plane refuses that pair), and only for PostgreSQL. Absent = the default.
 */
export function newLoginStraightThroughPayload(
  engine: string | null | undefined,
  choice: boolean | null,
  limited: boolean
): { straightThrough?: boolean } {
  return !supportsStraightThrough(engine) || choice === null || limited
    ? {}
    : { straightThrough: choice }
}

export const STRAIGHT_THROUGH_ERROR_COPY: Record<string, string> = {
  straight_through_conflicts_with_source_limit:
    'A login that connects straight through cannot be limited to certain addresses. Turn one off.',
  straight_through_postgres_only: 'Connecting straight through is only available for PostgreSQL.',
  straight_through_login_not_allowed:
    'The cluster administrator and replication logins cannot connect straight through.',
}
