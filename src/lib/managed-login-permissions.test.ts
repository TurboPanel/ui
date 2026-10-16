import { describe, expect, it } from 'vitest'
import {
  grantTarget,
  groupPermissions,
  levelName,
  permissionsErrorMessage,
  permissionsNotices,
} from '@/lib/managed-login-permissions'
import type { ManagedEffectiveGrant, ManagedEffectivePermissions } from '@/lib/managed-services'

const priv = (label: string) => ({
  keyword: label.toUpperCase(),
  catalogueId: null,
  label,
  explanation: '',
  allowed: 'yes' as const,
  grantable: false,
})
const grant = (over: Partial<ManagedEffectiveGrant>): ManagedEffectiveGrant => ({
  level: 'table',
  database: 'd1',
  privileges: [priv('Read')],
  origin: 'observed',
  ...over,
})
const view = (over: Partial<ManagedEffectivePermissions> = {}): ManagedEffectivePermissions => ({
  username: 'u1',
  exists: true,
  engine: 'postgres',
  series: '18',
  observedAt: '2026-10-16T00:00:00Z',
  attributes: [],
  accounts: [],
  memberships: [],
  grants: [],
  defaults: [],
  truncated: false,
  outsidePolicyCount: 0,
  ...over,
})

describe('groupPermissions', () => {
  it('groups per database by level in a fixed order and splits out everyone', () => {
    const rows = groupPermissions([
      grant({ level: 'routine', object: 'f()' }),
      grant({ level: 'column', object: 't', columns: ['a'] }),
      grant({ level: 'table', schema: 'public', object: 't' }),
      grant({ level: 'database' }),
      grant({ level: 'table', via: 'PUBLIC', viaLabel: 'everyone' }),
      grant({ database: 'd0', pattern: true, level: 'database' }),
    ])
    expect(rows.map((row) => `${row.name}:${row.pattern}`)).toEqual(['d0:true', 'd1:false'])
    const d1 = rows[1]!
    expect(d1.groups.map((group) => group.id)).toEqual(['database', 'objects', 'columns', 'routines'])
    expect(d1.everyone).toHaveLength(1)
  })

  it('puts grants with no database first', () => {
    const rows = groupPermissions([grant({}), grant({ database: undefined, level: 'global' })])
    expect(rows[0]!.name).toBeNull()
  })
})

describe('grantTarget and levelName', () => {
  it('names the object and its columns', () => {
    expect(grantTarget(grant({ schema: 'public', object: 'orders', columns: ['a', 'b'] }))).toBe(
      'public.orders (a, b)'
    )
    expect(grantTarget(grant({ level: 'database' }))).toBe('Everything in this database')
    expect(levelName('column')).toBe('Column')
    expect(levelName('table', { engine: 'postgres', series: '18', levels: [{ id: 'table', label: 'Tables', explanation: '' }] })).toBe('Tables')
  })
})

describe('permissionsNotices', () => {
  it('is empty for a complete read', () => {
    expect(permissionsNotices(view())).toEqual([])
  })
  it('explains every gap in plain words', () => {
    const notices = permissionsNotices(
      view({
        databasesFailed: ['a'],
        databasesNotAsked: ['b'],
        truncated: true,
        versionMatchesCatalogue: false,
        exists: false,
      })
    )
    expect(notices.map((n) => n.title)).toEqual([
      'This login does not exist on the server yet',
      'Some databases could not be read',
      'Some databases were left out',
      'The list was cut short',
      'The server runs a different version than expected',
    ])
    expect(notices[1]!.body).toContain('a')
  })
})

describe('permissionsErrorMessage', () => {
  it('maps each refusal', () => {
    const e = (m: string) => new Error(m)
    expect(permissionsErrorMessage(e('HTTP 409: daemon_update_required'))).toMatch(/newer TurboPanel/)
    expect(permissionsErrorMessage(e('HTTP 409: server_offline'))).toMatch(/offline/)
    expect(permissionsErrorMessage(e('HTTP 504: permissions_read_failed'))).toMatch(/in time/)
    expect(permissionsErrorMessage(e('HTTP 502: permissions_read_failed'))).toMatch(/could not read/)
    expect(permissionsErrorMessage(e('HTTP 404'))).toMatch(/not found/)
    expect(permissionsErrorMessage(e('boom'))).toMatch(/could not be loaded/)
  })
})
