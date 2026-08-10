import { describe, expect, it } from 'vitest'
import {
  BINDING_ENGINE_DEFAULT_KEYS,
  BINDING_SECRET_KEY_SUFFIXES,
  DEFAULT_BINDING_KEY_PREFIX,
  MAX_BINDING_KEY_PREFIX_LENGTH,
  bindingPrefixedKeys,
  isBindingSecretKey,
  previewBindingKeys,
  validateBindingKeyPrefix,
} from './bindings'

describe('validateBindingKeyPrefix', () => {
  it('accepts the default DATABASE prefix', () => {
    expect(validateBindingKeyPrefix(DEFAULT_BINDING_KEY_PREFIX)).toEqual({
      ok: true,
      prefix: 'DATABASE',
    })
  })

  it('rejects reserved TURBOPANEL prefixes', () => {
    expect(validateBindingKeyPrefix('TURBOPANEL').ok).toBe(false)
    expect(validateBindingKeyPrefix('TURBOPANEL_X').ok).toBe(false)
  })

  it('rejects empty, non-identifier, and overlong prefixes', () => {
    expect(validateBindingKeyPrefix('').ok).toBe(false)
    expect(validateBindingKeyPrefix('9bad').ok).toBe(false)
    expect(validateBindingKeyPrefix('bad-name').ok).toBe(false)
    expect(
      validateBindingKeyPrefix('A'.repeat(MAX_BINDING_KEY_PREFIX_LENGTH + 1)).ok,
    ).toBe(false)
  })
})

describe('bindingPrefixedKeys', () => {
  it('emits the exact prefixed key set', () => {
    expect(bindingPrefixedKeys('DATABASE')).toEqual({
      url: 'DATABASE_URL',
      caCert: 'DATABASE_CA_CERT',
      readSplit: 'DATABASE_READ_SPLIT',
      host: 'DATABASE_HOST',
      port: 'DATABASE_PORT',
      database: 'DATABASE_NAME',
      user: 'DATABASE_USER',
      password: 'DATABASE_PASSWORD',
    })
  })
})

describe('BINDING_ENGINE_DEFAULT_KEYS', () => {
  it('matches postgres unprefixed keys including PGSSLMODE', () => {
    expect(BINDING_ENGINE_DEFAULT_KEYS.postgres).toEqual([
      'PGHOST',
      'PGPORT',
      'PGDATABASE',
      'PGUSER',
      'PGPASSWORD',
      'PGSSLMODE',
    ])
  })

  it('matches mysql and mariadb MYSQL_* keys', () => {
    expect(BINDING_ENGINE_DEFAULT_KEYS.mysql).toEqual([
      'MYSQL_HOST',
      'MYSQL_PORT',
      'MYSQL_DATABASE',
      'MYSQL_USER',
      'MYSQL_PASSWORD',
    ])
    expect(BINDING_ENGINE_DEFAULT_KEYS.mariadb).toEqual(
      BINDING_ENGINE_DEFAULT_KEYS.mysql,
    )
  })
})

describe('previewBindingKeys', () => {
  it('includes engine defaults when requested', () => {
    const keys = previewBindingKeys({
      prefix: 'ORDERS',
      engine: 'postgres',
      emitEngineDefaults: true,
    })
    expect(keys).toContain('ORDERS_URL')
    expect(keys).toContain('PGHOST')
    expect(keys).toContain('PGSSLMODE')
  })

  it('omits engine defaults when off', () => {
    const keys = previewBindingKeys({
      prefix: 'ORDERS',
      engine: 'postgres',
      emitEngineDefaults: false,
    })
    expect(keys).toContain('ORDERS_HOST')
    expect(keys).not.toContain('PGHOST')
  })
})

describe('isBindingSecretKey', () => {
  it('classifies secret suffixes and engine password keys', () => {
    expect(isBindingSecretKey('DATABASE_URL')).toBe(true)
    expect(isBindingSecretKey('DATABASE_CA_CERT')).toBe(true)
    expect(isBindingSecretKey('DATABASE_PASSWORD')).toBe(true)
    expect(isBindingSecretKey('PGPASSWORD')).toBe(true)
    expect(isBindingSecretKey('MYSQL_PASSWORD')).toBe(true)
    expect(isBindingSecretKey('DATABASE_HOST')).toBe(false)
    expect(isBindingSecretKey('PGHOST')).toBe(false)
    for (const suffix of BINDING_SECRET_KEY_SUFFIXES) {
      if (suffix.startsWith('_')) {
        expect(isBindingSecretKey(`X${suffix}`)).toBe(true)
      }
    }
  })
})
