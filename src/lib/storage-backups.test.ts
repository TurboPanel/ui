import { describe, expect, it } from 'vitest'
import type { StorageCopyRecord } from '@/lib/instance-api'
import { apiErrorCopy } from '@/lib/user-error'
import {
  backupCopyFor,
  backupOriginLabel,
  backupSummary,
  canBackUpCopy,
} from '@/lib/storage-backups'

function copy(over: Partial<StorageCopyRecord>): StorageCopyRecord {
  return {
    id: 'c1',
    storageId: 's1',
    serverId: 'srv',
    secretId: null,
    provider: 'docker',
    role: 'primary',
    state: 'ready',
    path: null,
    endpoint: null,
    generation: 1,
    metadata: null,
    options: null,
    createdAt: '',
    updatedAt: '',
    resolvedSourcePath: null,
    ...over,
  }
}

describe('storage backups helpers', () => {
  it('prefers the primary copy', () => {
    const replica = copy({ id: 'r', role: 'replica' })
    const primary = copy({ id: 'p' })
    expect(backupCopyFor({ copies: [replica, primary] })?.id).toBe('p')
    expect(backupCopyFor({ copies: [replica] })?.id).toBe('r')
    expect(backupCopyFor({ copies: [] })).toBeUndefined()
  })

  it('offers backups only for placed docker or path copies that are not single files', () => {
    expect(canBackUpCopy('volume', copy({}))).toBe(true)
    expect(canBackUpCopy('directory', copy({ provider: 'path' }))).toBe(true)
    expect(canBackUpCopy('file', copy({ provider: 'path' }))).toBe(false)
    expect(canBackUpCopy('volume', copy({ serverId: null }))).toBe(false)
    expect(canBackUpCopy('volume', copy({ provider: 's3' }))).toBe(false)
    expect(canBackUpCopy('volume', undefined)).toBe(false)
  })

  it('labels where a backup came from', () => {
    expect(backupOriginLabel(null)).toBe('Manual')
    expect(backupOriginLabel('p1')).toBe('Scheduled')
    expect(backupSummary({ sizeBytes: 0, checksum: 'abcdef0123456789', policyId: null })).toContain(
      'abcdef0123'
    )
  })

  it('maps the backup refusals to plain sentences', () => {
    for (const code of [
      'server_offline',
      'server_placement_required',
      'backup_target_unsupported',
      'backup_not_found',
    ]) {
      expect(apiErrorCopy(new Error(`HTTP 409: ${code}`))).toMatch(/\.$/)
    }
  })
})
