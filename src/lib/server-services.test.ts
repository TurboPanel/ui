import { describe, expect, it } from 'vitest'
import { TURBOFABRIC_PRODUCT_NAME } from '@/lib/platform-copy'
import {
  SERVER_SERVICES_EMPTY,
  addressCountLine,
  backupCountLine,
  backupLatestLine,
  cappedMoreLine,
  containerRoleLabel,
  containerStatusLabel,
  containerStatusTone,
  databaseEngineLabel,
  databaseRoleLabel,
  databaseUserDatabasesLine,
  networkKindLabel,
  removalNoticeBody,
  replicaStatusLabel,
  replicaStatusTone,
  runtimeKindLabel,
  runtimeVersionsLine,
} from '@/lib/server-services'

function removal(
  overrides: Partial<Parameters<typeof removalNoticeBody>[0]> = {}
): Parameters<typeof removalNoticeBody>[0] {
  return {
    canRemove: true,
    online: true,
    canForget: false,
    reasons: [],
    ...overrides,
  }
}

describe('server services display copy', () => {
  it('uses a colocated or forget notice instead of clear-first copy', () => {
    expect(removalNoticeBody(removal())).toMatch(/Nothing on this server/)
    expect(
      removalNoticeBody(
        removal({
          canRemove: false,
          reasons: [
            {
              kind: 'colocated',
              count: 1,
              message: 'This is the machine running the control panel itself and cannot be removed.',
            },
          ],
        })
      )
    ).toMatch(/control panel itself/)
    expect(
      removalNoticeBody(removal({ canRemove: false, online: false, canForget: true }))
    ).toMatch(/Host is gone/)
    expect(removalNoticeBody(removal({ canRemove: false }))).toMatch(/Clear the items below first/)
  })

  it('uses plain database role and engine words', () => {
    expect(databaseRoleLabel('primary')).toBe('Primary')
    expect(databaseRoleLabel('replica')).toBe('Standby')
    expect(databaseEngineLabel('mysql')).toBe('MySQL')
    expect(databaseEngineLabel('mariadb')).toBe('MariaDB')
    expect(databaseEngineLabel('postgres')).toBe('PostgreSQL')
    expect(databaseEngineLabel('postgresql')).toBe('PostgreSQL')
    expect(databaseEngineLabel('redis')).toBe('Redis')
    expect(databaseEngineLabel('valkey')).toBe('Valkey')
    expect(databaseEngineLabel('custom')).toBe('custom')
  })

  it('names every network registry kind and lsphp runtimes in plain words', () => {
    expect(networkKindLabel('docker')).toBe('Docker')
    expect(networkKindLabel('compose')).toBe(TURBOFABRIC_PRODUCT_NAME)
    expect(networkKindLabel('datacenter')).toBe('Datacenter')
    expect(networkKindLabel('reserved')).toBe('Reserved range')
    expect(networkKindLabel('managed')).toBe('Managed databases')
    expect(networkKindLabel('other')).toBe('Network')
    expect(runtimeKindLabel('php')).toBe('PHP')
    expect(runtimeKindLabel('lsphp')).toBe('LiteSpeed PHP')
    expect(runtimeKindLabel('node')).toBe('Node')
    expect(runtimeKindLabel('deno')).toBe('Deno')
    expect(runtimeKindLabel('python')).toBe('Python')
    expect(runtimeKindLabel('ruby')).toBe('Ruby')
    expect(runtimeKindLabel('go')).toBe('go')
    expect(containerRoleLabel('ingress')).toBe('Front door')
    expect(containerRoleLabel('turbopanel')).toBe('Platform')
    expect(containerRoleLabel('service')).toBe('App')
  })

  it('maps container status to a word and tone', () => {
    expect(containerStatusLabel('running')).toBe('Running')
    expect(containerStatusTone('running')).toBe('ok')
    expect(containerStatusLabel('exited')).toBe('Stopped')
    expect(containerStatusLabel('stopped')).toBe('Stopped')
    expect(containerStatusTone('exited')).toBe('muted')
    expect(containerStatusLabel('created')).toBe('Starting')
    expect(containerStatusLabel('starting')).toBe('Starting')
    expect(containerStatusTone('restarting')).toBe('pending')
    expect(containerStatusLabel('paused')).toBe('Paused')
    expect(containerStatusLabel('dead')).toBe('Failed')
    expect(containerStatusLabel('failed')).toBe('Failed')
    expect(containerStatusTone('failed')).toBe('danger')
    expect(containerStatusLabel('weird')).toBe('weird')
    expect(containerStatusTone('weird')).toBe('muted')
  })

  it('maps every replica status to a word', () => {
    expect(replicaStatusLabel('provisioning')).toBe('Provisioning')
    expect(replicaStatusTone('provisioning')).toBe('pending')
    expect(replicaStatusLabel('applying')).toBe('Applying')
    expect(replicaStatusTone('applying')).toBe('pending')
    expect(replicaStatusLabel('ready')).toBe('Running')
    expect(replicaStatusTone('ready')).toBe('ok')
    expect(replicaStatusLabel('stopped')).toBe('Stopped')
    expect(replicaStatusTone('stopped')).toBe('muted')
    expect(replicaStatusLabel('failed')).toBe('Failed')
    expect(replicaStatusTone('failed')).toBe('danger')
    expect(replicaStatusLabel('needs_resync')).toBe('Needs a resync')
    expect(replicaStatusTone('needs_resync')).toBe('danger')
  })

  it('counts addresses, backups, versions, leftover rows, and grouped databases', () => {
    expect(addressCountLine(1)).toBe('1 address on this server')
    expect(addressCountLine(3)).toBe('3 addresses on this server')
    expect(backupCountLine(1)).toBe('1 copy')
    expect(backupCountLine(4)).toBe('4 copies')
    expect(backupLatestLine('')).toBe('No copies yet')
    expect(backupLatestLine('not-a-date')).toBe('Latest Never')
    expect(runtimeVersionsLine([])).toBe('No versions reported')
    expect(runtimeVersionsLine(['8.3', '8.4'])).toBe('8.3, 8.4')
    expect(cappedMoreLine(0)).toBeNull()
    expect(cappedMoreLine(2)).toBe('and 2 more')
    expect(databaseUserDatabasesLine(['orders'])).toBe('Uses orders')
    expect(databaseUserDatabasesLine(['orders', 'catalog'])).toBe('Uses orders, catalog')
    expect(SERVER_SERVICES_EMPTY.apps).toMatch(/No apps/)
    expect(SERVER_SERVICES_EMPTY.backups).toMatch(/member on this server/)
  })
})
