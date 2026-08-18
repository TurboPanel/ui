import { describe, expect, it } from 'vitest'
import {
  collectComposeInterpolationKeys,
  containsVariableRefOpener,
  isVariableRefScope,
  parseExactVariableRef,
  resolveVariableRefScope,
  VARIABLE_REF_SCOPES,
} from './variable-refs'

describe('isVariableRefScope', () => {
  it('accepts canonical scope names', () => {
    for (const scope of VARIABLE_REF_SCOPES) {
      expect(isVariableRefScope(scope)).toBe(true)
    }
    expect(isVariableRefScope('bogus')).toBe(false)
    expect(isVariableRefScope('org')).toBe(false)
  })
})

describe('resolveVariableRefScope', () => {
  it('resolves canonical scopes and aliases', () => {
    expect(resolveVariableRefScope('project')).toBe('project')
    expect(resolveVariableRefScope('org')).toBe('organization')
    expect(resolveVariableRefScope('env')).toBe('environment')
    expect(resolveVariableRefScope('unknown')).toBeNull()
  })
})

describe('containsVariableRefOpener', () => {
  it('detects TurboPanel interpolation openers', () => {
    expect(containsVariableRefOpener('plain')).toBe(false)
    expect(containsVariableRefOpener('prefix-{$KEY}')).toBe(true)
    expect(containsVariableRefOpener('{$KEY}')).toBe(true)
  })
})

describe('parseExactVariableRef', () => {
  it('parses unscoped refs with surrounding whitespace', () => {
    expect(parseExactVariableRef('  {$API_KEY}  ')).toEqual({
      ok: true,
      ref: { raw: '{$API_KEY}', scope: null, key: 'API_KEY' },
    })
  })

  it('parses every canonical scope', () => {
    for (const scope of VARIABLE_REF_SCOPES) {
      const result = parseExactVariableRef(`{$${scope}.PORT}`)
      expect(result).toEqual({
        ok: true,
        ref: { raw: `{$${scope}.PORT}`, scope, key: 'PORT' },
      })
    }
  })

  it('parses scope aliases org and env', () => {
    expect(parseExactVariableRef('{$org.TOKEN}')).toEqual({
      ok: true,
      ref: { raw: '{$org.TOKEN}', scope: 'organization', key: 'TOKEN' },
    })
    expect(parseExactVariableRef('{$env.DB_URL}')).toEqual({
      ok: true,
      ref: { raw: '{$env.DB_URL}', scope: 'environment', key: 'DB_URL' },
    })
  })

  it('rejects non-ref values', () => {
    expect(parseExactVariableRef('DATABASE_URL')).toEqual({
      ok: false,
      error: 'not_a_ref',
    })
    expect(parseExactVariableRef('')).toEqual({ ok: false, error: 'not_a_ref' })
  })

  it('rejects embedded refs that are not the entire value', () => {
    const embedded = parseExactVariableRef('prefix-{$KEY}')
    expect(embedded).toEqual({
      ok: false,
      error: 'invalid',
      message:
        'TurboPanel variable refs must be the entire value (e.g. {$KEY} or {$project.KEY})',
    })
  })

  it('rejects malformed ref syntax', () => {
    expect(parseExactVariableRef('{$}')).toEqual({
      ok: false,
      error: 'invalid',
      message:
        'Invalid TurboPanel variable ref; use {$KEY} or {$scope.KEY} with a Compose-safe key',
    })
    expect(parseExactVariableRef('{$1bad}')).toEqual({
      ok: false,
      error: 'invalid',
      message:
        'Invalid TurboPanel variable ref; use {$KEY} or {$scope.KEY} with a Compose-safe key',
    })
    expect(parseExactVariableRef('{$scope.}')).toEqual({
      ok: false,
      error: 'invalid',
      message:
        'Invalid TurboPanel variable ref; use {$KEY} or {$scope.KEY} with a Compose-safe key',
    })
  })

  it('rejects unknown scopes', () => {
    expect(parseExactVariableRef('{$bogus.KEY}')).toEqual({
      ok: false,
      error: 'invalid',
      message: 'Unknown variable scope "bogus"',
    })
  })
})

describe('collectComposeInterpolationKeys', () => {
  it('collects ${KEY} and $KEY forms without duplicates', () => {
    expect(
      collectComposeInterpolationKeys('host=${HOST} port=$PORT and again ${HOST}'),
    ).toEqual(['HOST', 'PORT'])
  })

  it('returns an empty list when no compose interpolation is present', () => {
    expect(collectComposeInterpolationKeys('plain text')).toEqual([])
    expect(collectComposeInterpolationKeys('')).toEqual([])
  })
})
