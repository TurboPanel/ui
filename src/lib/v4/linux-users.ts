/**
 * Linux users ("Runs as"): the Linux account that owns an app's files and
 * runs it (ia-v4 section 4).
 *
 * - Node.js apps and sites run as a Linux user; containers run inside their
 *   image and have no picker ("Runs inside its container").
 * - The users are declared in the Base. An environment's changes can point
 *   an app at a different user.
 * - Sign-in access (None, SFTP, SFTP + SSH) belongs to the user, not the app.
 */

import type { PrincipalAccess } from '@/lib/compose/root-extension'
import type { PrincipalAccessLevel, ProjectPrincipalRecord } from '@/lib/instance-api'
import type { NameScheme } from '@/lib/principal-name-scheme'
import { environmentValues } from './effective-config'
import { linuxUserKey, sourceLabel } from './change-labels'
import { plural, slugify } from './text'
import type { ConfigSource, EnvConfigSource, FlatConfig, V4Service } from './types'

/** Sign-in access of a Linux user. */
export type LinuxUserAccess = 'none' | 'sftp' | 'ssh'

export const LINUX_ACCESS_LABELS: Readonly<Record<LinuxUserAccess, string>> = {
  none: 'None',
  sftp: 'SFTP',
  ssh: 'SFTP + SSH',
}

/**
 * Compose says `ssh`, the principals API says `shell`: both are
 * "SFTP + SSH" on screen.
 */
export function linuxAccess(level: PrincipalAccess | PrincipalAccessLevel): LinuxUserAccess {
  return level === 'shell' ? 'ssh' : level
}

export type LinuxUser = Readonly<{
  /** The name people see and type. */
  name: string
  /** The login created on the server (differs from `name` with a name scheme). */
  systemName: string
  access: LinuxUserAccess
  sshKeyCount: number
  passwordAuth: boolean
  /** Declared in the Base but not created on a server yet. */
  createdOnFirstDeploy: boolean
}>

export type LinuxUserRecordFields = Pick<
  ProjectPrincipalRecord,
  'username' | 'appliedUsername' | 'access' | 'sshKeyCount' | 'passwordAuth'
>

/** A user that exists on the control plane. */
export function linuxUserFromRecord(record: LinuxUserRecordFields): LinuxUser {
  return {
    name: record.username,
    systemName: record.appliedUsername,
    access: linuxAccess(record.access),
    sshKeyCount: record.sshKeyCount,
    passwordAuth: record.passwordAuth,
    createdOnFirstDeploy: false,
  }
}

/** A user the Base declares that no deploy has created yet. */
export function linuxUserFromDeclared(name: string, access: PrincipalAccess = 'none'): LinuxUser {
  return {
    name,
    systemName: name,
    access: linuxAccess(access),
    sshKeyCount: 0,
    passwordAuth: false,
    createdOnFirstDeploy: true,
  }
}

/** The user a service falls back to: the first Linux user, else the project name. */
export function defaultLinuxUser(users: readonly LinuxUser[], projectName: string): string {
  return users[0]?.name ?? slugify(projectName)
}

/** "SFTP on" or "No sign-in". */
export function accessText(access: LinuxUserAccess): string {
  return access === 'none' ? 'No sign-in' : `${LINUX_ACCESS_LABELS[access]} on`
}

export function sshKeysText(count: number): string {
  return count > 0 ? plural(count, 'SSH key') : 'No SSH keys'
}

// --- Runs as ---------------------------------------------------------------

export const RUNS_IN_CONTAINER = 'Runs inside its container'

export type RunsAs = Readonly<{
  runsInContainer: boolean
  /** Empty for a container. */
  user: string
  /** "Runs as website" or "Runs inside its container". */
  label: string
  /** "as website", for a map station. */
  short: string
  source: ConfigSource | 'image'
  sourceLabel: string
  /** "SFTP on", "No sign-in", or empty for a container. */
  access: string
  hasAccess: boolean
}>

export type EnvironmentView = Readonly<{ name: string; source: EnvConfigSource }>

export type RunsAsInput = Readonly<{
  service: Pick<V4Service, 'id' | 'kind'>
  base: FlatConfig
  /** The environment to resolve in; leave out for the Base. */
  env?: EnvironmentView
  users: readonly LinuxUser[]
  defaultUser: string
}>

/** Node.js apps and sites run as a Linux user; containers and databases do not. */
export function runsAsLinuxUser(service: Pick<V4Service, 'kind'>): boolean {
  return service.kind === 'node' || service.kind === 'site'
}

const CONTAINER_RUNS_AS: RunsAs = {
  runsInContainer: true,
  user: '',
  label: RUNS_IN_CONTAINER,
  short: RUNS_IN_CONTAINER,
  source: 'image',
  sourceLabel: '',
  access: '',
  hasAccess: false,
}

function runsAsSource(key: string, env: EnvironmentView | undefined): ConfigSource {
  if (env === undefined) return 'base'
  if (env.source.standsAlone) return 'own'
  return env.source.changes.some((change) => change.key === key) ? 'env' : 'base'
}

/** Who runs a service in an environment (or in the Base). */
export function resolveRunsAs(input: RunsAsInput): RunsAs {
  if (!runsAsLinuxUser(input.service)) return CONTAINER_RUNS_AS
  const { env } = input
  const key = linuxUserKey(input.service.id)
  const values = env === undefined ? input.base : environmentValues(input.base, env.source)
  const user = values[key] ?? input.defaultUser
  const source = runsAsSource(key, env)
  const found = input.users.find((candidate) => candidate.name === user)
  const hasAccess = found !== undefined && found.access !== 'none'
  return {
    runsInContainer: false,
    user,
    label: `Runs as ${user}`,
    short: `as ${user}`,
    source,
    sourceLabel: sourceLabel(source, env?.name ?? 'Base'),
    access: hasAccess ? accessText(found.access) : 'No sign-in',
    hasAccess,
  }
}

// --- The Linux users table -------------------------------------------------

export type LinuxUserRow = Readonly<{
  name: string
  access: LinuxUserAccess
  accessLabel: string
  accessText: string
  keysText: string
  /** "SFTP on · 1 SSH key · password set". */
  sub: string
  /** "web in Production, Staging" per app. */
  uses: readonly string[]
  /** "web in Production, Staging" or "No app runs as this user yet". */
  usesText: string
  /** "web in Testing runs as testing-web" for environments that differ. */
  otherText: string
  hasOther: boolean
  inUse: boolean
}>

export type LinuxUsersInput = Readonly<{
  users: readonly LinuxUser[]
  services: readonly V4Service[]
  base: FlatConfig
  environments: readonly EnvironmentView[]
  defaultUser: string
}>

export function userSub(user: LinuxUser): string {
  const parts = [
    user.access === 'none'
      ? 'No sign-in'
      : `${accessText(user.access)} · ${sshKeysText(user.sshKeyCount)}`,
  ]
  if (user.passwordAuth) parts.push('password set')
  if (user.createdOnFirstDeploy) parts.push('created on the first deploy')
  return parts.join(' · ')
}

type UserUse = { uses: string[]; other: string[] }

function collectUse(input: LinuxUsersInput, user: LinuxUser, service: V4Service): UserUse {
  const { base, users, defaultUser, environments } = input
  const baseUser = resolveRunsAs({ service, base, users, defaultUser }).user
  const on: string[] = []
  const other: string[] = []
  for (const env of environments) {
    const resolved = resolveRunsAs({ service, base, env, users, defaultUser })
    if (resolved.user === user.name) on.push(env.name)
    else if (baseUser === user.name) {
      other.push(`${service.name} in ${env.name} runs as ${resolved.user}`)
    }
  }
  const uses = on.length > 0 ? [`${service.name} in ${on.join(', ')}`] : []
  return { uses, other }
}

/** Each Linux user with the apps (per environment) that run as it. */
export function linuxUserRows(input: LinuxUsersInput): LinuxUserRow[] {
  const apps = input.services.filter(runsAsLinuxUser)
  return input.users.map((user) => {
    const found = apps.map((service) => collectUse(input, user, service))
    const uses = found.flatMap((item) => item.uses)
    const other = found.flatMap((item) => item.other)
    return {
      name: user.name,
      access: user.access,
      accessLabel: LINUX_ACCESS_LABELS[user.access],
      accessText: accessText(user.access),
      keysText: sshKeysText(user.sshKeyCount),
      sub: userSub(user),
      uses,
      usesText: uses.length > 0 ? uses.join(' · ') : 'No app runs as this user yet',
      otherText: other.join(' · '),
      hasOther: other.length > 0,
      inUse: uses.length > 0,
    }
  })
}

// --- Name rule ---------------------------------------------------------------

/** Longest login the server accepts. The server names the user's own group after it. */
export const LINUX_USER_NAME_MAX = 28
/** Characters a name scheme adds: an underscore and 11 random ones. */
export const LINUX_USER_NAME_SUFFIX = 12

const LINUX_USER_NAME_RE = /^[a-z][a-z0-9_-]*$/

/**
 * Names the system keeps for itself. Mirrors the control plane's naming rule.
 * The server gives each Linux user a group of the same name, and some group
 * names hand out administrator power (sudo, admin, wheel), so the usual
 * system and privilege group names are kept too.
 */
const SYSTEM_USER_NAMES: ReadonlySet<string> = new Set([
  'root',
  'daemon',
  'bin',
  'sys',
  'sync',
  'games',
  'man',
  'mail',
  'news',
  'www-data',
  'nobody',
  'sshd',
  'postgres',
  'redis',
  'docker',
  'containers',
  'lp',
  'uucp',
  'proxy',
  'backup',
  'list',
  'irc',
  'gnats',
  'nogroup',
  'ssh',
  '_ssh',
  '_apt',
  '_chrony',
  'mysql',
  'adm',
  'admin',
  'audio',
  'avahi',
  'cdrom',
  'crontab',
  'dialout',
  'dip',
  'disk',
  'floppy',
  'fuse',
  'incus',
  'incus-admin',
  'input',
  'kmem',
  'kvm',
  'libvirt',
  'libvirt-qemu',
  'lpadmin',
  'lxd',
  'messagebus',
  'microk8s',
  'netdev',
  'operator',
  'plugdev',
  'polkitd',
  'render',
  'sambashare',
  'sasl',
  'sgx',
  'shadow',
  'src',
  'ssl-cert',
  'staff',
  'sudo',
  'tape',
  'tty',
  'users',
  'utmp',
  'video',
  'voice',
  'wheel',
])

/** True for names the system keeps: its own accounts and everything starting `tp`. */
export function isSystemUserName(name: string): boolean {
  const key = name.trim().toLowerCase()
  return SYSTEM_USER_NAMES.has(key) || key.startsWith('tp') || key.startsWith('systemd-')
}

export type LinuxUserNameCheck = Readonly<{ ok: boolean; msg: string }>

export type LinuxUserNameOptions = Readonly<{
  /** Name scheme the new user is created with. */
  scheme?: NameScheme
  /** Users that already exist in the project. */
  taken?: readonly Pick<LinuxUser, 'name' | 'systemName'>[]
}>

/** The longest name a person can type under a scheme. */
export function linuxUserNameLimit(scheme: NameScheme = 'plain'): number {
  return scheme === 'partial' ? LINUX_USER_NAME_MAX - LINUX_USER_NAME_SUFFIX : LINUX_USER_NAME_MAX
}

function isTaken(name: string, taken: LinuxUserNameOptions['taken']): boolean {
  const key = name.trim().toLowerCase()
  return (taken ?? []).some(
    (user) => user.name.trim().toLowerCase() === key || user.systemName.trim().toLowerCase() === key
  )
}

/**
 * The rule shown inline under the name field: lowercase letters, numbers,
 * `-` and `_`, starting with a letter, within the length the server allows.
 */
export function checkLinuxUserName(
  name: string,
  options: LinuxUserNameOptions = {}
): LinuxUserNameCheck {
  const limit = linuxUserNameLimit(options.scheme)
  if (name === '') return { ok: false, msg: 'Give the user a name' }
  if (name.length > limit) return { ok: false, msg: `Up to ${limit} characters` }
  if (!LINUX_USER_NAME_RE.test(name)) {
    return {
      ok: false,
      msg: 'Lowercase letters, numbers, - and _ only, starting with a letter',
    }
  }
  if (isSystemUserName(name)) return { ok: false, msg: 'The system keeps that name' }
  if (isTaken(name, options.taken)) {
    return { ok: false, msg: `A Linux user called ${name} already exists` }
  }
  return {
    ok: true,
    msg: `Lowercase, up to ${limit} characters. Created on the first deploy.`,
  }
}
