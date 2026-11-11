/**
 * Admin tools of a Database Cluster (phpMyAdmin, Adminer, pgAdmin): which tool
 * fits which engine, the words, the show-once values and the deploy chip. Pure,
 * so the panel, the card and the tests agree.
 */

import type { BadgeTone } from '@/components/ui/badge'
import type {
  ManagedAdminToolAccess,
  ManagedAdminToolCreated,
  ManagedAdminToolId,
  ManagedAdminToolReset,
} from '@/lib/instance-api'
import { managedErrorMessage } from '@/lib/managed-services'
import type { DeploymentGroup } from '@/lib/deployment-history'

export type AdminToolChoice = Readonly<{ value: ManagedAdminToolId; label: string }>

/** The tools of each engine; the first is the default. Mirrors the control plane's table. */
const TOOLS_BY_ENGINE: Readonly<Record<string, readonly AdminToolChoice[]>> = {
  mysql: [
    { value: 'phpmyadmin', label: 'phpMyAdmin' },
    { value: 'adminer', label: 'Adminer' },
  ],
  mariadb: [
    { value: 'phpmyadmin', label: 'phpMyAdmin' },
    { value: 'adminer', label: 'Adminer' },
  ],
  postgres: [
    { value: 'pgadmin', label: 'pgAdmin' },
    { value: 'adminer', label: 'Adminer' },
  ],
}

/** The tools that fit `engine`; none for an engine without one. */
export function adminToolChoices(engine: string | null): readonly AdminToolChoice[] {
  return (engine ? TOOLS_BY_ENGINE[engine] : undefined) ?? []
}

export const ADMIN_ACCESS_OPTIONS: readonly {
  value: ManagedAdminToolAccess
  label: string
}[] = [
  { value: 'admin', label: 'Database Admin' },
  { value: 'read-only', label: 'Read-Only' },
]

export const ADMIN_TOOLS_HINT =
  'A web tool for this Database Cluster, signed in with its own login.'

export const ADMIN_TOOL_ACCESS_HINTS: Readonly<Record<ManagedAdminToolAccess, string>> = {
  admin:
    'Database Admin can change data and tables in every database of this cluster, including ones added later.',
  'read-only': 'Read-Only can look at every database of this cluster, including ones added later.',
}

export const ADMIN_TOOL_EXPOSURE_WARNING =
  "Anyone who reaches this address sees the tool's sign-in page. Use a strong password and keep the address private."

export const ADMIN_TOOL_REMOVE_NOTE =
  'The tool, its address and its login are removed. Your databases are not touched.'

export const PGADMIN_AUTO_CONNECT_NOTE =
  'pgAdmin connects to the database by itself; you never type the database password.'

export function adminToolAccessLabel(access: ManagedAdminToolAccess): string {
  return access === 'read-only' ? 'Read-Only' : 'Database Admin'
}

/** The line under the hostname field. */
export function hostnameHint(serverName = "this Database Cluster's server"): string {
  return `Point this name at ${serverName} before you deploy, like any site.`
}

/** What the show-once panel prints for a new or reset tool. */
export type AdminToolReveal = Readonly<{
  username: string
  password: string
  usernameLabel: string
  passwordLabel: string
  /** A muted line under the password. */
  note: string | null
  /** Lines the control plane adds to an add (empty for a reset), shown under the password. */
  notes: readonly string[]
}>

/** pgAdmin signs in with its web account; the other tools with the tool login. */
export function adminToolReveal(
  result: Pick<
    ManagedAdminToolCreated | ManagedAdminToolReset,
    'loginName' | 'loginPassword' | 'webEmail' | 'webPassword'
  > & { notes?: readonly string[] }
): AdminToolReveal {
  const notes = result.notes ?? []
  if (result.webEmail && result.webPassword) {
    return {
      username: result.webEmail,
      password: result.webPassword,
      usernameLabel: 'Sign-In Email',
      passwordLabel: 'Sign-In Password',
      note: PGADMIN_AUTO_CONNECT_NOTE,
      notes,
    }
  }
  return {
    username: result.loginName,
    password: result.loginPassword,
    usernameLabel: 'Username',
    passwordLabel: 'Password',
    note: null,
    notes,
  }
}

const DEPLOYING = new Set(['queued', 'dispatching', 'sent', 'acked', 'running'])
const FAILED = new Set(['failed', 'timed_out'])

/** The deploy chip: nothing for a tool that never deployed or whose deploy was cancelled. */
export function adminToolDeployChip(
  latest: Pick<DeploymentGroup, 'status'> | null | undefined
): Readonly<{ label: string; tone: BadgeTone }> | null {
  if (!latest) return null
  if (DEPLOYING.has(latest.status)) return { label: 'Deploying', tone: 'pending' }
  if (FAILED.has(latest.status)) return { label: 'Failed', tone: 'danger' }
  if (latest.status === 'succeeded') return { label: 'Running', tone: 'ok' }
  return null
}

/** Answers that carry no sentence of their own; the others bring their own. */
const ADMIN_TOOL_ERROR_COPY: Readonly<Record<string, string>> = {
  managed_destroy_in_progress: 'This Database Cluster is being destroyed. Wait for it to finish.',
  admin_tool_needs_database: 'Add a database to this Database Cluster first.',
}

/** Plain words for a refused request. */
export function adminToolErrorMessage(err: unknown, fallback: string): string {
  const raw = err instanceof Error ? err.message : ''
  const code = /HTTP \d+:\s*([a-z0-9_]+)/i.exec(raw)?.[1]
  const copy = code ? ADMIN_TOOL_ERROR_COPY[code] : undefined
  return copy ?? managedErrorMessage(err, fallback)
}

/** The request body of an add: the hostname is sent trimmed and lowercase, the access always explicit. */
export function adminToolBody(input: {
  tool: ManagedAdminToolId
  hostname: string
  access: ManagedAdminToolAccess
}) {
  return { tool: input.tool, hostname: input.hostname.trim().toLowerCase(), access: input.access }
}
