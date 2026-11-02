import { describe, expect, it } from 'vitest'
import { confirmationName, confirmNameQuery, typedNameMatches } from './confirm-name'

describe('confirmationName', () => {
  it('takes the first candidate that is not blank, trimmed', () => {
    expect(confirmationName(' web-1 ', 'host.example.test', 'id-1')).toBe('web-1')
    expect(confirmationName(null, ' host.example.test', 'id-1')).toBe('host.example.test')
    expect(confirmationName('', undefined, 'id-1')).toBe('id-1')
    expect(confirmationName(null, undefined)).toBe('')
  })
})

describe('typedNameMatches', () => {
  it('needs the exact name', () => {
    expect(typedNameMatches('production', 'production')).toBe(true)
    expect(typedNameMatches('Production', 'production')).toBe(false)
    expect(typedNameMatches('production ', 'production')).toBe(false)
    expect(typedNameMatches('productio', 'production')).toBe(false)
    expect(typedNameMatches('', '')).toBe(false)
  })
})

describe('confirmNameQuery', () => {
  it('encodes the name, and is empty without one', () => {
    expect(confirmNameQuery(undefined)).toBe('')
    expect(confirmNameQuery('my env & co')).toBe('?confirmName=my+env+%26+co')
  })
})
