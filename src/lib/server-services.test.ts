import { describe, expect, it } from 'vitest'
import {
  SERVER_SERVICES_EMPTY,
  addressCountLine,
  backupCountLine,
  backupLatestLine,
  containerRoleLabel,
  containerStatusLabel,
  containerStatusTone,
  databaseEngineLabel,
  databaseRoleLabel,
  hostServiceDisplayName,
  hostServiceStateLabel,
  hostServiceStateTone,
  networkKindLabel,
  runtimeKindLabel,
  runtimeVersionsLine,
} from '@/lib/server-services'

describe('server services display copy', () => {
  it('maps host helpers without vendor names', () => {
    expect(hostServiceDisplayName('proxysql', 'ProxySQL')).toBe('Database connector')
    expect(hostServiceDisplayName('nginx', 'nginx')).toBe('Web front door')
    expect(hostServiceDisplayName('caddy', 'Caddy')).toBe('Web front door')
    expect(hostServiceDisplayName('openlitespeed', 'OpenLiteSpeed')).toBe('Site web server')
    expect(hostServiceDisplayName('other', 'Mail helper')).toBe('Mail helper')
    expect(hostServiceDisplayName('other', '  ')).toBe('Host helper')
  })

  it('labels host helper state with a word', () => {
    expect(hostServiceStateLabel('up')).toBe('Running')
    expect(hostServiceStateLabel('down')).toBe('Stopped')
    expect(hostServiceStateLabel('unknown')).toBe('Unknown')
    expect(hostServiceStateTone('up')).toBe('ok')
    expect(hostServiceStateTone('down')).toBe('danger')
    expect(hostServiceStateTone('unknown')).toBe('muted')
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

  it('names networks, runtimes and container roles in plain words', () => {
    expect(networkKindLabel('docker')).toBe('Apps network')
    expect(networkKindLabel('datacenter')).toBe('Datacenter')
    expect(networkKindLabel('reserved')).toBe('Set-aside range')
    expect(networkKindLabel('managed')).toBe('Platform network')
    expect(networkKindLabel('other')).toBe('Network')
    expect(runtimeKindLabel('php')).toBe('PHP')
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

  it('counts addresses, backups and versions', () => {
    expect(addressCountLine(1)).toBe('1 address on this server')
    expect(addressCountLine(3)).toBe('3 addresses on this server')
    expect(backupCountLine(1)).toBe('1 copy')
    expect(backupCountLine(4)).toBe('4 copies')
    expect(backupLatestLine(null)).toBe('No copies yet')
    expect(backupLatestLine('not-a-date')).toBe('Latest Never')
    expect(runtimeVersionsLine([])).toBe('No versions reported')
    expect(runtimeVersionsLine(['8.3', '8.4'])).toBe('8.3, 8.4')
    expect(SERVER_SERVICES_EMPTY.apps).toMatch(/No apps/)
  })
})
