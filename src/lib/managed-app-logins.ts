/**
 * App logins: the three logins an app usually needs on one database, made in
 * one step by `createManagedAppLogins`. Names, copy and the request body live
 * here so the form, the password summary and the tests agree.
 */

import type { ManagedAppLogin } from '@/lib/instance-api'
import { managedErrorMessage } from '@/lib/managed-services'
import { newLoginStraightThroughPayload } from '@/lib/managed-straight-through'
import { principalSchemeErrorMessage, type NameScheme } from '@/lib/principal-name-scheme'

export const APP_LOGIN_ROLES = [
  { suffix: 'migrate', label: 'Owner of this database (for migrations)' },
  { suffix: 'rw', label: 'Read/write (reads and changes rows)' },
  { suffix: 'ro', label: 'Read-only' },
] as const

/** Same rule as the control plane: letters, numbers and underscores, not starting with a number. */
const PREFIX_PATTERN = /^[A-Za-z_]\w*$/

/** The prefix to use: what was typed (trimmed), or the database name. */
export function appLoginPrefix(typed: string, databaseName: string): string {
  return typed.trim() || databaseName
}

/** A plain-words problem with the prefix, or `null` when it can be used. */
export function appLoginPrefixProblem(prefix: string): string | null {
  return PREFIX_PATTERN.test(prefix)
    ? null
    : 'The prefix must start with a letter or an underscore and use only letters, numbers and underscores.'
}

/** The three names, in the order they are made. */
export function appLoginNames(prefix: string): string[] {
  return APP_LOGIN_ROLES.map((role) => `${prefix}_${role.suffix}`)
}

/** What the owner login gets on this engine, in one line. */
export function appLoginsOwnerNote(engine: string | null | undefined): string {
  if (engine === 'mysql' || engine === 'mariadb') {
    return 'MySQL and MariaDB have no database owner, so the _migrate login gets every right on this database and can give other logins access.'
  }
  return 'The _migrate login owns what it creates through the database’s owner role and can give other logins access.'
}

/**
 * App logins always get their names exactly as written. When the organization
 * locks another name scheme the action cannot be used, and this says why.
 */
export function appLoginsSchemeProblem(
  scheme: Readonly<{ locked?: boolean; orgScheme?: NameScheme }>
): string | null {
  if (!scheme.locked || scheme.orgScheme === 'plain') return null
  return 'Your organization requires a name scheme other than Plain, so app logins cannot get these exact names. Add the logins one by one instead.'
}

/** The request body: the prefix only when it differs from the database name, the shared limits and switch. */
export function appLoginsRequestBody(input: {
  engine: string | null | undefined
  prefix: string
  databaseName: string
  allowedSources: string[] | null
  maxConnections: number | null
  straightThrough: boolean
}): {
  prefix?: string
  allowedSources?: string[]
  maxConnections?: number
  straightThrough?: boolean
} {
  return {
    ...(input.prefix === input.databaseName ? {} : { prefix: input.prefix }),
    ...(input.allowedSources ? { allowedSources: input.allowedSources } : {}),
    ...(input.maxConnections ? { maxConnections: input.maxConnections } : {}),
    ...newLoginStraightThroughPayload(
      input.engine,
      input.straightThrough,
      input.allowedSources !== null
    ),
  }
}

/** Every new login and its password, one per line, for "Copy all". */
export function appLoginsCopyAllText(logins: readonly ManagedAppLogin[]): string {
  return logins.map(({ user, password }) => `${user.appliedUsername}: ${password}`).join('\n')
}

/** Refusals whose server sentence names the login or the limit, so it is shown as written. */
const NAMED_REFUSALS = new Set([
  'username_in_use',
  'managed_user_exists',
  'managed_app_login_prefix_invalid',
  'managed_app_login_prefix_too_long',
])

/** Plain words for a failed app-logins request. */
export function appLoginsErrorMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : ''
  const code = /HTTP \d+:\s*([a-z0-9_]+)/i.exec(raw)?.[1]
  const sentence = /\s—\s(.+)$/s.exec(raw)?.[1]
  if (code && sentence && NAMED_REFUSALS.has(code)) return sentence
  return principalSchemeErrorMessage(managedErrorMessage(err, 'Failed to add the app logins'))
}

const NO_OWNER_ROLE_NOTE =
  'This database has no owner role yet, so the _migrate login got read and write access only: it does not own the database and cannot give other logins access.'
const OLDER_SERVER_NOTE =
  'This server runs an older TurboPanel version, so the _migrate login got read and write access only. Update the server, then apply again to give it full ownership.'
const OTHER_NOTE =
  'The _migrate login did not get full ownership of this database. Its card in the list shows what it can do.'

/** The server notes about the owner login, in plain words (never API wording). */
export function plainAppLoginNotes(notes: readonly string[] | undefined): string[] {
  const plain = (notes ?? []).map((note) => {
    if (/no owner role yet/i.test(note)) return NO_OWNER_ROLE_NOTE
    if (/is older than/i.test(note)) return OLDER_SERVER_NOTE
    return /POST |…\/|\/managed\/|\{name\}|connectionRole/.test(note) ? OTHER_NOTE : note
  })
  return [...new Set(plain)]
}
