import { describe, expect, it } from 'vitest'
import { TURBOFABRIC_PRODUCT_NAME } from './platform-copy'
import {
  MANAGED_INGRESS_MYSQL_PORT,
  MANAGED_INGRESS_PGSQL_PORT,
  MANAGED_SERVICE_CATALOG,
  clusterHasUnhealthyMember,
  formatClusterTopologyLabel,
  formatReplicationLag,
  managedCatalogEntryForCode,
  managedEngineSupportsBackup,
  managedErrorMessage,
  managedIngressPortForEngine,
  managedStatusLabel,
  memberReplicaClassLabel,
  memberRoleLabel,
  memberStatusLabel,
  memberTransportLabel,
  replicationStateLabel,
  shortBackupChecksum,
  sortManagedCatalogEntries,
  type ManagedMemberRecord,
  type ManagedStatus,
} from './managed-services'

function member(
  partial: Partial<ManagedMemberRecord> &
    Pick<ManagedMemberRecord, 'id' | 'serverId' | 'role'>,
): ManagedMemberRecord {
  return {
    serverDisplayName: partial.serverDisplayName ?? null,
    replicaClass: partial.replicaClass ?? null,
    readEligible: partial.readEligible ?? false,
    ordinal: partial.ordinal ?? 0,
    status: partial.status ?? null,
    replicationTransport: partial.replicationTransport ?? null,
    privatePort: partial.privatePort ?? null,
    ...partial,
  }
}

describe('MANAGED_SERVICE_CATALOG image allowlists', () => {
  it('advertises the approved LTS default for every available engine', () => {
    expect(managedCatalogEntryForCode('postgres')?.defaultImage).toBe(
      'docker.io/library/postgres:18-alpine',
    )
    // MySQL/MariaDB defaults must stay on the approved LTS majors — never an
    // old major like `mysql:8` / `mariadb:11` (mirrors the instance
    // allowlists in `turbopanel/src/lib/managed/settings.ts`).
    expect(managedCatalogEntryForCode('mysql')?.defaultImage).toBe(
      'docker.io/library/mysql:9.7',
    )
    expect(managedCatalogEntryForCode('mariadb')?.defaultImage).toBe(
      'docker.io/library/mariadb:12.3',
    )
  })

  it('lists the default image inside its own allowedImages set for every engine', () => {
    for (const entry of MANAGED_SERVICE_CATALOG) {
      expect(entry.allowedImages).toContain(entry.defaultImage)
      expect(entry.allowedImages.length).toBeGreaterThan(0)
    }
  })

  it('never mixes allowlists across engines', () => {
    const postgres = managedCatalogEntryForCode('postgres')
    const mysql = managedCatalogEntryForCode('mysql')
    const mariadb = managedCatalogEntryForCode('mariadb')
    expect(postgres?.allowedImages.some((image) => image.includes('mysql'))).toBe(false)
    expect(postgres?.allowedImages.some((image) => image.includes('mariadb'))).toBe(false)
    expect(mysql?.allowedImages.some((image) => image.includes('mariadb'))).toBe(false)
    expect(mariadb?.allowedImages.some((image) => image.includes('mysql:'))).toBe(false)
  })
})

describe('managedEngineSupportsBackup', () => {
  it('is true for every engine whose backend spec declares a backup descriptor', () => {
    expect(managedEngineSupportsBackup('postgres')).toBe(true)
    expect(managedEngineSupportsBackup('mysql')).toBe(true)
    expect(managedEngineSupportsBackup('mariadb')).toBe(true)
  })

  it('is false for engines without a backup descriptor and for unknown/null codes', () => {
    expect(managedEngineSupportsBackup('redis')).toBe(false)
    expect(managedEngineSupportsBackup('clickhouse')).toBe(false)
    expect(managedEngineSupportsBackup('not-a-real-engine')).toBe(false)
    expect(managedEngineSupportsBackup(null)).toBe(false)
    expect(managedEngineSupportsBackup(undefined)).toBe(false)
  })
})

describe('shortBackupChecksum', () => {
  it('returns the first 10 hex characters', () => {
    expect(
      shortBackupChecksum(
        'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789',
      ),
    ).toBe('abcdef0123')
  })
})

describe('managedErrorMessage', () => {
  it('maps known HTTP error codes to operator copy', () => {
    expect(
      managedErrorMessage(
        new Error('HTTP 422: server_placement_required'),
        'fallback',
      ),
    ).toBe('Select a server before creating this managed service.')
    expect(
      managedErrorMessage(new Error('HTTP 409: managed_busy'), 'fallback'),
    ).toBe('Another managed operation is still in progress. Wait and try again.')
    expect(
      managedErrorMessage(
        new Error('HTTP 422: peer_tunnel_address_required'),
        'fallback',
      ),
    ).toContain(TURBOFABRIC_PRODUCT_NAME)
  })

  it('returns the raw message or fallback when the code is unknown', () => {
    expect(
      managedErrorMessage(new Error('HTTP 500: totally_unknown_code'), 'fallback'),
    ).toBe('HTTP 500: totally_unknown_code')
    expect(managedErrorMessage(new Error('plain failure'), 'fallback')).toBe(
      'plain failure',
    )
    expect(managedErrorMessage('not-an-error', 'use this')).toBe('use this')
    expect(managedErrorMessage(new Error(''), 'use this')).toBe('use this')
  })
})

describe('managedStatusLabel', () => {
  it('labels every ManagedStatus for status pills', () => {
    const cases: Array<[ManagedStatus, string]> = [
      ['ready', 'Running'],
      ['stopped', 'Stopped'],
      ['provisioning', 'Provisioning'],
      ['applying', 'Applying'],
      ['failed', 'Failed'],
    ]
    for (const [status, label] of cases) {
      expect(managedStatusLabel(status)).toBe(label)
    }
  })
})

describe('member labels', () => {
  it('labels role, replica class, and transport', () => {
    expect(memberRoleLabel('primary')).toBe('Primary')
    expect(memberRoleLabel('replica')).toBe('Replica')
    expect(memberReplicaClassLabel('failover')).toBe('Failover')
    expect(memberReplicaClassLabel('read')).toBe('Read-only')
    expect(memberReplicaClassLabel(null)).toBeNull()
    expect(memberReplicaClassLabel(undefined)).toBeNull()
    expect(memberTransportLabel('local')).toBe('Local')
    expect(memberTransportLabel('datacenter')).toBe('Datacenter LAN')
    expect(memberTransportLabel('fabric')).toBe(
      `${TURBOFABRIC_PRODUCT_NAME} direct`,
    )
    expect(memberTransportLabel('public')).toBe('Public Internet + TLS')
    expect(memberTransportLabel(null)).toBe('—')
    expect(memberTransportLabel(undefined)).toBe('—')
  })

  it('labels known member statuses and falls back for unknowns', () => {
    expect(memberStatusLabel(null)).toBe('—')
    expect(memberStatusLabel(undefined)).toBe('—')
    expect(memberStatusLabel('ready')).toBe('Running')
    expect(memberStatusLabel('running')).toBe('Running')
    expect(memberStatusLabel('stopped')).toBe('Stopped')
    expect(memberStatusLabel('provisioning')).toBe('Provisioning')
    expect(memberStatusLabel('applying')).toBe('Applying')
    expect(memberStatusLabel('failed')).toBe('Failed')
    expect(memberStatusLabel('waiting_for_stream')).toBe('waiting for stream')
  })
})

describe('replicationStateLabel / formatReplicationLag', () => {
  it('labels known replication states', () => {
    expect(replicationStateLabel(null)).toBe('—')
    expect(replicationStateLabel(undefined)).toBe('—')
    expect(replicationStateLabel('streaming')).toBe('Streaming')
    expect(replicationStateLabel('catching_up')).toBe('Catching up')
    expect(replicationStateLabel('catchup')).toBe('Catching up')
    expect(replicationStateLabel('not_streaming')).toBe('Not streaming')
    expect(replicationStateLabel('stopped')).toBe('Stopped')
    expect(replicationStateLabel('unknown_phase')).toBe('unknown phase')
  })

  it('formats lag as bytes, seconds, or both', () => {
    expect(formatReplicationLag(null)).toBeNull()
    expect(formatReplicationLag(undefined)).toBeNull()
    expect(
      formatReplicationLag({
        state: 'streaming',
        observedAt: '2026-01-01T00:00:00.000Z',
      }),
    ).toBeNull()
    expect(
      formatReplicationLag({
        state: 'streaming',
        observedAt: '2026-01-01T00:00:00.000Z',
        lagBytes: 512,
      }),
    ).toBe('512 B behind')
    expect(
      formatReplicationLag({
        state: 'streaming',
        observedAt: '2026-01-01T00:00:00.000Z',
        lagBytes: 1536,
      }),
    ).toBe('1.5 KB behind')
    expect(
      formatReplicationLag({
        state: 'streaming',
        observedAt: '2026-01-01T00:00:00.000Z',
        lagBytes: 10 * 1024 * 1024,
      }),
    ).toBe('10 MB behind')
    expect(
      formatReplicationLag({
        state: 'streaming',
        observedAt: '2026-01-01T00:00:00.000Z',
        lagBytes: Number.NaN,
      }),
    ).toBeNull()
    expect(
      formatReplicationLag({
        state: 'streaming',
        observedAt: '2026-01-01T00:00:00.000Z',
        lagSeconds: 2.34,
      }),
    ).toBe('2.3s behind')
    expect(
      formatReplicationLag({
        state: 'streaming',
        observedAt: '2026-01-01T00:00:00.000Z',
        lagSeconds: 12.6,
      }),
    ).toBe('13s behind')
    expect(
      formatReplicationLag({
        state: 'catching_up',
        observedAt: '2026-01-01T00:00:00.000Z',
        lagBytes: 2048,
        lagSeconds: 1.2,
      }),
    ).toBe('2 KB behind · 1.2s')
  })
})

describe('sortManagedCatalogEntries', () => {
  it('puts available engines first, then sorts by catalog label', () => {
    const sorted = sortManagedCatalogEntries([
      { code: 'redis' },
      { code: 'mysql' },
      { code: 'postgres' },
      { code: 'clickhouse' },
      { code: 'mariadb' },
      { code: 'unknown-engine' },
    ])
    expect(sorted.map((entry) => entry.code)).toEqual([
      'mariadb',
      'mysql',
      'postgres',
      'clickhouse',
      'redis',
      'unknown-engine',
    ])
  })
})

describe('formatClusterTopologyLabel / clusterHasUnhealthyMember', () => {
  it('summarizes primary-only and replica counts', () => {
    expect(formatClusterTopologyLabel(null)).toBe('Primary')
    expect(formatClusterTopologyLabel(undefined)).toBe('Primary')
    expect(
      formatClusterTopologyLabel([
        member({ id: 'm1', serverId: 's1', role: 'primary' }),
      ]),
    ).toBe('Primary')
    expect(
      formatClusterTopologyLabel([
        member({ id: 'm1', serverId: 's1', role: 'primary' }),
        member({ id: 'm2', serverId: 's2', role: 'replica' }),
      ]),
    ).toBe('Primary + 1 replica')
    expect(
      formatClusterTopologyLabel([
        member({ id: 'm1', serverId: 's1', role: 'primary' }),
        member({ id: 'm2', serverId: 's2', role: 'replica' }),
        member({ id: 'm3', serverId: 's3', role: 'replica' }),
      ]),
    ).toBe('Primary + 2 replicas')
  })

  it('flags non-ready/non-running member statuses', () => {
    expect(clusterHasUnhealthyMember(null)).toBe(false)
    expect(clusterHasUnhealthyMember(undefined)).toBe(false)
    expect(
      clusterHasUnhealthyMember([
        member({ id: 'm1', serverId: 's1', role: 'primary', status: 'ready' }),
        member({ id: 'm2', serverId: 's2', role: 'replica', status: 'running' }),
        member({ id: 'm3', serverId: 's3', role: 'replica', status: null }),
      ]),
    ).toBe(false)
    expect(
      clusterHasUnhealthyMember([
        member({ id: 'm1', serverId: 's1', role: 'primary', status: 'ready' }),
        member({ id: 'm2', serverId: 's2', role: 'replica', status: 'failed' }),
      ]),
    ).toBe(true)
    expect(
      clusterHasUnhealthyMember([
        member({
          id: 'm1',
          serverId: 's1',
          role: 'replica',
          status: 'provisioning',
        }),
      ]),
    ).toBe(true)
  })
})

describe('managedIngressPortForEngine', () => {
  it('maps postgres family to the shared pgsql listener', () => {
    expect(managedIngressPortForEngine('postgres', 5432)).toBe(
      MANAGED_INGRESS_PGSQL_PORT,
    )
    expect(managedIngressPortForEngine('postgres')).toBe(
      MANAGED_INGRESS_PGSQL_PORT,
    )
  })

  it('maps mysql and mariadb to the shared mysql listener', () => {
    expect(managedIngressPortForEngine('mysql', 3306)).toBe(
      MANAGED_INGRESS_MYSQL_PORT,
    )
    expect(managedIngressPortForEngine('mariadb')).toBe(
      MANAGED_INGRESS_MYSQL_PORT,
    )
  })

  it('does not use catalog engine-native ports as the client listener', () => {
    expect(MANAGED_INGRESS_PGSQL_PORT).toBe(15432)
    expect(MANAGED_INGRESS_MYSQL_PORT).toBe(16306)
    expect(managedCatalogEntryForCode('postgres')?.defaultPort).toBe(5432)
    expect(managedCatalogEntryForCode('mysql')?.defaultPort).toBe(3306)
  })
})
