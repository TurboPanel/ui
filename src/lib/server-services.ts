import { formatRelativeLocalDateTime } from '@/lib/format-datetime'
import type {
  ServerServicesDatabaseRole,
  ServerServicesRecord,
} from '@/lib/instance-api'
import { TURBOFABRIC_PRODUCT_NAME } from '@/lib/platform-copy'
import { moreLabel } from '@/lib/server-delete-preview'

type StatusTone = 'ok' | 'muted' | 'danger' | 'pending' | 'info'

export const SERVER_SERVICES_EMPTY = {
  apps: 'No apps on this server.',
  databases: 'No databases on this server.',
  databaseUsers: 'No apps on this server talk to a database through it.',
  backups: 'No backups of databases that have a member on this server.',
  networks: 'No networks on this server.',
  runtimes: 'No language versions reported.',
} as const

export const SERVER_CAN_REMOVE_YES_TITLE = 'Yes'
export const SERVER_CAN_REMOVE_YES_BODY = 'Nothing on this server would stop you from removing it.'
export const SERVER_CAN_REMOVE_NO_TITLE = 'No'
export const SERVER_CAN_REMOVE_NO_BODY = 'Clear the items below first, then try again.'
export const SERVER_CAN_REMOVE_NO_COLOCATED_BODY =
  'This is the machine running the control panel itself and cannot be removed.'
export const SERVER_CAN_REMOVE_NO_FORGET_BODY =
  'Because this host is offline, you can still remove it with Delete server → Host is gone.'

export function removalNoticeBody(
  removal: Readonly<ServerServicesRecord['removal']>
): string {
  if (removal.canRemove) return SERVER_CAN_REMOVE_YES_BODY
  if (removal.reasons.some((reason) => reason.kind === 'colocated')) {
    return SERVER_CAN_REMOVE_NO_COLOCATED_BODY
  }
  if (removal.canForget) return SERVER_CAN_REMOVE_NO_FORGET_BODY
  return SERVER_CAN_REMOVE_NO_BODY
}

export function cappedMoreLine(more: number): string | null {
  if (more <= 0) return null
  return moreLabel(more)
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

/** Network registry kinds from turbopanel `network.kind`. */
export function networkKindLabel(kind: string): string {
  switch (kind) {
    case 'docker':
      return 'Docker'
    case 'compose':
      return TURBOFABRIC_PRODUCT_NAME
    case 'datacenter':
      return 'Datacenter'
    case 'reserved':
      return 'Reserved range'
    case 'managed':
      return 'Managed databases'
    default:
      return 'Network'
  }
}

export function runtimeKindLabel(kind: string): string {
  switch (kind) {
    case 'php':
      return 'PHP'
    case 'lsphp':
      return 'LiteSpeed PHP'
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

/** Replica `status` values from turbopanel `replica_status_check`. */
export function replicaStatusLabel(status: string): string {
  switch (status) {
    case 'ready':
      return 'Running'
    case 'provisioning':
      return 'Provisioning'
    case 'applying':
      return 'Applying'
    case 'stopped':
      return 'Stopped'
    case 'failed':
      return 'Failed'
    case 'needs_resync':
      return 'Needs a resync'
    default:
      return containerStatusLabel(status)
  }
}

export function replicaStatusTone(status: string): StatusTone {
  switch (status) {
    case 'ready':
      return 'ok'
    case 'provisioning':
    case 'applying':
      return 'pending'
    case 'stopped':
      return 'muted'
    case 'failed':
    case 'needs_resync':
      return 'danger'
    default:
      return containerStatusTone(status)
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

export function backupLatestLine(latestAt: string): string {
  if (!latestAt) return 'No copies yet'
  return `Latest ${formatRelativeLocalDateTime(latestAt)}`
}

export function runtimeVersionsLine(versions: readonly string[]): string {
  if (versions.length === 0) return 'No versions reported'
  return versions.join(', ')
}

export function databaseUserDatabasesLine(databases: readonly string[]): string {
  if (databases.length === 1) return `Uses ${databases[0]}`
  return `Uses ${databases.join(', ')}`
}
