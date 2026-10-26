import { describe, expect, it } from 'vitest'
import { MANAGED_IDENTIFIER_MAX_LENGTH, managedIdentifierProblem } from '@/lib/managed-identifier'

describe('managedIdentifierProblem', () => {
  it('accepts letters, digits and underscores that start with a letter or underscore', () => {
    expect(managedIdentifierProblem('ct_app2', 'Username')).toBeNull()
    expect(managedIdentifierProblem('_shop', 'Database name')).toBeNull()
    expect(
      managedIdentifierProblem('a'.repeat(MANAGED_IDENTIFIER_MAX_LENGTH), 'Username')
    ).toBeNull()
  })

  it('asks for a name when there is none', () => {
    expect(managedIdentifierProblem('', 'Username')).toBe('Enter a username.')
  })

  it('names the start rule only when the first character breaks it', () => {
    expect(managedIdentifierProblem('9x', 'Username')).toBe(
      'Username must start with a letter or underscore.'
    )
  })

  it('names the characters that are not allowed, a space as spaces', () => {
    expect(managedIdentifierProblem('ct bad!', 'Username')).toBe(
      'Username can use only letters, digits and underscores, not spaces or “!”.'
    )
    expect(managedIdentifierProblem('my-app-db', 'Database name')).toBe(
      'Database name can use only letters, digits and underscores, not “-”.'
    )
    expect(managedIdentifierProblem('a b-c.d', 'Username')).toBe(
      'Username can use only letters, digits and underscores, not spaces, “-” or “.”.'
    )
  })

  it('names the length rule', () => {
    expect(
      managedIdentifierProblem('a'.repeat(MANAGED_IDENTIFIER_MAX_LENGTH + 1), 'Username')
    ).toBe('Username can be at most 63 characters.')
  })
})
