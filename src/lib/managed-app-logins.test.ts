import { describe, expect, it } from 'vitest'
import type { ManagedAppLogin } from './instance-api'
import {
  appLoginNames,
  appLoginPrefix,
  appLoginPrefixProblem,
  appLoginsCopyAllText,
  appLoginsErrorMessage,
  appLoginsOwnerNote,
  appLoginsRequestBody,
  appLoginsSchemeProblem,
} from './managed-app-logins'

const login = (appliedUsername: string, password: string) =>
  ({ user: { id: appliedUsername, appliedUsername }, password }) as unknown as ManagedAppLogin

describe('app logins', () => {
  it('uses the typed prefix or the database name, and names the three logins', () => {
    expect(appLoginPrefix('  shop ', 'staging')).toBe('shop')
    expect(appLoginPrefix('   ', 'staging')).toBe('staging')
    expect(appLoginNames('staging')).toEqual(['staging_migrate', 'staging_rw', 'staging_ro'])
  })

  it('says when a prefix cannot be a login name', () => {
    expect(appLoginPrefixProblem('shop_1')).toBeNull()
    expect(appLoginPrefixProblem('_shop')).toBeNull()
    expect(appLoginPrefixProblem('1shop')).toMatch(/start with a letter/)
    expect(appLoginPrefixProblem('shop-app')).toMatch(/only letters, numbers and underscores/)
  })

  it('explains the owner login per engine', () => {
    expect(appLoginsOwnerNote('postgres')).toMatch(/owner role/)
    expect(appLoginsOwnerNote(null)).toMatch(/owner role/)
    expect(appLoginsOwnerNote('mysql')).toMatch(/MySQL and MariaDB have no database owner/)
    expect(appLoginsOwnerNote('mariadb')).toMatch(/every right on this database/)
  })

  it('is blocked only when the organization locks a scheme other than Plain', () => {
    expect(appLoginsSchemeProblem({})).toBeNull()
    expect(appLoginsSchemeProblem({ locked: false, orgScheme: 'partial' })).toBeNull()
    expect(appLoginsSchemeProblem({ locked: true, orgScheme: 'plain' })).toBeNull()
    expect(appLoginsSchemeProblem({ locked: true, orgScheme: 'partial' })).toMatch(/Plain/)
  })

  it('sends the prefix only when it differs, and the shared limits and switch', () => {
    const base = {
      engine: 'postgres',
      databaseName: 'staging',
      allowedSources: null,
      maxConnections: null,
      straightThrough: true,
    }
    expect(appLoginsRequestBody({ ...base, prefix: 'staging' })).toEqual({ straightThrough: true })
    expect(
      appLoginsRequestBody({
        ...base,
        prefix: 'shop',
        allowedSources: ['internal'],
        maxConnections: 20,
      })
    ).toEqual({ prefix: 'shop', allowedSources: ['internal'], maxConnections: 20 })
    expect(appLoginsRequestBody({ ...base, engine: 'mysql', prefix: 'staging' })).toEqual({})
  })

  it('copies every name and password, one per line', () => {
    expect(appLoginsCopyAllText([login('a_migrate', 'p1'), login('a_rw', 'p2')])).toBe(
      'a_migrate: p1\na_rw: p2'
    )
  })

  it('shows the server sentence for refusals that name the login, plain copy otherwise', () => {
    const taken = new Error(
      'POST /app-logins failed: HTTP 409: username_in_use — The login name shop_rw is already taken.'
    )
    expect(appLoginsErrorMessage(taken)).toBe('The login name shop_rw is already taken.')
    expect(
      appLoginsErrorMessage(new Error('POST failed: HTTP 409: principal_scheme_locked'))
    ).not.toMatch(/HTTP/)
    expect(appLoginsErrorMessage(new Error('HTTP 409: username_in_use'))).toMatch(/already taken/)
    expect(appLoginsErrorMessage('boom')).toBe('Failed to add the app logins')
  })
})
