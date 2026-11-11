import { describe, expect, it } from 'vitest'
import {
  plainPresetForEngine,
  presetKeyNames,
  presetsForEngine,
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
    expect(validateBindingKeyPrefix('A'.repeat(MAX_BINDING_KEY_PREFIX_LENGTH + 1)).ok).toBe(false)
  })
})

describe('bindingPrefixedKeys', () => {
  it('emits the exact prefixed key set', () => {
    expect(bindingPrefixedKeys('DATABASE')).toEqual({
      url: 'DATABASE_URL',
      sslMode: 'DATABASE_SSL_MODE',
      caCert: 'DATABASE_CA_CERT',
      caFile: 'DATABASE_CA_FILE',
      readSplit: 'DATABASE_READ_SPLIT',
      host: 'DATABASE_HOST',
      port: 'DATABASE_PORT',
      database: 'DATABASE_NAME',
      user: 'DATABASE_USER',
      password: 'DATABASE_PASSWORD',
    })
  })
})

describe('binding presets', () => {
  it('offers the plain preset first, per engine', () => {
    expect(presetsForEngine('postgres')).toEqual(['postgres', 'laravel', 'metabase'])
    expect(presetsForEngine('mariadb')).toEqual([
      'mysql',
      'laravel',
      'wordpress',
      'metabase',
      'uptime-kuma',
    ])
    expect(plainPresetForEngine('mysql')).toBe('mysql')
    expect(plainPresetForEngine('redis')).toBeNull()
  })

  it('names match the control plane preset table', () => {
    expect(presetKeyNames('postgres', 'postgres')).toContain('PGSSLMODE')
    expect(presetKeyNames('laravel', 'postgres')).toContain('DB_SSLMODE')
    expect(presetKeyNames('laravel', 'mysql')).toContain('MYSQL_ATTR_SSL_CA')
    expect(presetKeyNames('wordpress', 'mysql')).toEqual([
      'DB_HOST',
      'DB_USER',
      'DB_PASSWORD',
      'DB_NAME',
    ])
    expect(presetKeyNames('metabase', 'mariadb')).toContain('MB_DB_DBNAME')
  })
})

describe('previewBindingKeys', () => {
  it('lists prefixed names and the preset names apart', () => {
    const keys = previewBindingKeys({ prefix: 'ORDERS', engine: 'postgres', preset: 'postgres' })
    expect(keys.prefixed).toContain('ORDERS_URL')
    expect(keys.prefixed).toContain('ORDERS_SSL_MODE')
    expect(keys.prefixed).toContain('ORDERS_CA_FILE')
    expect(keys.preset).toContain('PGHOST')
    expect(keys.preset).toContain('PGSSLMODE')
  })

  it('adds no preset names for None', () => {
    const keys = previewBindingKeys({ prefix: 'ORDERS', engine: 'postgres', preset: null })
    expect(keys.prefixed).toContain('ORDERS_HOST')
    expect(keys.preset).toEqual([])
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
