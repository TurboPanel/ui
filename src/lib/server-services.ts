import { formatRelativeLocalDateTime } from '@/lib/format-datetime'
import type { ServerHostServiceState, ServerServicesDatabaseRole } from '@/lib/instance-api'

type StatusTone = 'ok' | 'muted' | 'danger' | 'pending' | 'info'

export const SERVER_SERVICES_EMPTY = {
  apps: 'No apps on this server.',
  databases: 'No databases on this server.',
  databaseUsers: 'No apps on this server talk to a database through it.',
  backups: 'No backups stored on this server.',
  networks: 'No networks on this server.',
  hostServices: 'No extra host helpers reported.',
  runtimes: 'No language versions reported.',
} as const

export const SERVER_CAN_REMOVE_YES_TITLE = 'Yes'
export const SERVER_CAN_REMOVE_YES_BODY = 'Nothing on this server would stop you from removing it.'
export const SERVER_CAN_REMOVE_NO_TITLE = 'No'
export const SERVER_CAN_REMOVE_NO_BODY = 'Clear the items below first, then try again.'

export function hostServiceDisplayName(key: string, label: string): string {
  switch (key) {
    case 'proxysql':
      return 'Database connector'
    case 'nginx':
    case 'caddy':
      return 'Web front door'
    case 'openlitespeed':
      return 'Site web server'
    default: {
      const trimmed = label.trim()
      return trimmed.length > 0 ? trimmed : 'Host helper'
    }
  }
}

export function hostServiceStateLabel(state: ServerHostServiceState): string {
  switch (state) {
    case 'up':
      return 'Running'
    case 'down':
      return 'Stopped'
    default:
      return 'Unknown'
  }
}

export function hostServiceStateTone(state: ServerHostServiceState): StatusTone {
  switch (state) {
    case 'up':
      return 'ok'
    case 'down':
      return 'danger'
    default:
      return 'muted'
  }
}

export function databaseRoleLabel(role: ServerServicesDatabaseRole): string {
  return role === 'primary' ? 'Primary' : 'Standby'
}

export function databaseEngineLabel(engine: string): string {
  switch (engine) {
    case 'mysql':
      return 'MySQL'
    case 'mariadb':
      return 'MariaDB'
    case 'postgres':
    case 'postgresql':
      return 'PostgreSQL'
    case 'redis':
      return 'Redis'
    case 'valkey':
      return 'Valkey'
    default:
      return engine
  }
}

export function networkKindLabel(kind: string): string {
  switch (kind) {
    case 'docker':
      return 'Apps network'
    case 'datacenter':
      return 'Datacenter'
    case 'reserved':
      return 'Set-aside range'
    case 'managed':
      return 'Platform network'
    default:
      return 'Network'
  }
}

export function runtimeKindLabel(kind: string): string {
  switch (kind) {
    case 'php':
      return 'PHP'
    case 'node':
      return 'Node'
    case 'deno':
      return 'Deno'
    case 'python':
      return 'Python'
    case 'ruby':
      return 'Ruby'
    default:
      return kind
  }
}

export function containerRoleLabel(role: string): string {
  switch (role) {
    case 'ingress':
      return 'Front door'
    case 'turbopanel':
      return 'Platform'
    default:
      return 'App'
  }
}

export function containerStatusLabel(status: string): string {
  switch (status) {
    case 'running':
      return 'Running'
    case 'exited':
    case 'stopped':
      return 'Stopped'
    case 'created':
    case 'starting':
      return 'Starting'
    case 'restarting':
      return 'Restarting'
    case 'paused':
      return 'Paused'
    case 'dead':
    case 'failed':
      return 'Failed'
    default:
      return status
  }
}

export function containerStatusTone(status: string): StatusTone {
  switch (status) {
    case 'running':
      return 'ok'
    case 'exited':
    case 'stopped':
    case 'paused':
      return 'muted'
    case 'created':
    case 'starting':
    case 'restarting':
      return 'pending'
    case 'dead':
    case 'failed':
      return 'danger'
    default:
      return 'muted'
  }
}

export function addressCountLine(ipCount: number): string {
  if (ipCount === 1) return '1 address on this server'
  return `${ipCount} addresses on this server`
}

export function backupCountLine(count: number): string {
  if (count === 1) return '1 copy'
  return `${count} copies`
}

export function backupLatestLine(latestAt: string | null): string {
  if (!latestAt) return 'No copies yet'
  return `Latest ${formatRelativeLocalDateTime(latestAt)}`
}

export function runtimeVersionsLine(versions: readonly string[]): string {
  if (versions.length === 0) return 'No versions reported'
  return versions.join(', ')
}
