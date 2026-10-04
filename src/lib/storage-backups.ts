import { formatBytes } from '@/lib/format-metrics'
import type { StorageCopyRecord, StorageKind, StorageRecord } from '@/lib/instance-api'

/** The copy a backup panel acts on: the primary copy, else the first. */
export function backupCopyFor(row: Pick<StorageRecord, 'copies'>): StorageCopyRecord | undefined {
  return row.copies.find((copy) => copy.role === 'primary') ?? row.copies[0]
}

/**
 * Whether the control plane can back this copy up: a Docker volume or a
 * directory, placed on a server. A single file is not offered.
 */
export function canBackUpCopy(kind: StorageKind, copy: StorageCopyRecord | undefined): boolean {
  if (!copy?.serverId) return false
  if (copy.provider !== 'docker' && copy.provider !== 'path') return false
  return kind !== 'file'
}

export function backupOriginLabel(policyId: string | null): string {
  return policyId ? 'Scheduled' : 'Manual'
}

export function backupSummary(backup: {
  sizeBytes: number
  checksum: string
  policyId: string | null
}): string {
  return `${backupOriginLabel(backup.policyId)} · ${formatBytes(backup.sizeBytes)} · ${backup.checksum.slice(0, 10)}`
}

export const RESTORE_WARNING =
  'Restoring stops the services that use this storage, replaces its files with this backup, then starts them again. Files changed since the backup are lost.'
