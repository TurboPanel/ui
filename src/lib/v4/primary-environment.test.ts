import { describe, expect, it } from 'vitest'
import {
  BASE_EDIT_WARNING,
  BASE_WHEN_TO_USE,
  MAKE_PRIMARY_EXPLANATION,
  NOT_COPIED_NOTE,
  PIN_EXPLANATION,
  PRIMARY_DELETE_EXPLANATION,
  baseIsProminent,
  environmentBadge,
  orderEnvironments,
  pinActionLabel,
  primaryEnvironmentOf,
} from './primary-environment'

const env = (name: string, flags: { isPrimary?: boolean; pinned?: boolean } = {}) => ({
  name,
  ...flags,
})

describe('primary environment helpers', () => {
  it('finds the marked environment, else the first listed, else none', () => {
    expect(primaryEnvironmentOf([env('a'), env('b', { isPrimary: true })])?.name).toBe('b')
    expect(primaryEnvironmentOf([env('a'), env('b')])?.name).toBe('a')
    expect(primaryEnvironmentOf([])).toBeNull()
  })

  it('orders primary first, pinned next, then the rest in the order they came', () => {
    const list = [
      env('d'),
      env('c', { pinned: true }),
      env('a', { isPrimary: true }),
      env('b', { pinned: true }),
      env('e'),
    ]
    expect(orderEnvironments(list).map((item) => item.name)).toEqual(['a', 'c', 'b', 'd', 'e'])
    expect(list.map((item) => item.name)).toEqual(['d', 'c', 'a', 'b', 'e'])
  })

  it('badges the primary and the pinned ones only', () => {
    expect(environmentBadge({ isPrimary: true, pinned: true })).toBe('Primary')
    expect(environmentBadge({ pinned: true })).toBe('Pinned')
    expect(environmentBadge({})).toBeNull()
    expect(environmentBadge({ isPrimary: false, pinned: false })).toBeNull()
  })

  it('makes the Base prominent from two environments', () => {
    expect(baseIsProminent(0)).toBe(false)
    expect(baseIsProminent(1)).toBe(false)
    expect(baseIsProminent(2)).toBe(true)
  })

  it('says what a copy leaves out in plain words', () => {
    expect(NOT_COPIED_NOTE).toContain('variables and secrets')
  })

  it('labels the pin control', () => {
    expect(pinActionLabel(false)).toBe('Pin')
    expect(pinActionLabel(true)).toBe('Unpin')
  })

  it('uses plain words: primary environment, never default, and no follows-the-Base label', () => {
    const text = [
      BASE_EDIT_WARNING,
      BASE_WHEN_TO_USE,
      MAKE_PRIMARY_EXPLANATION,
      PIN_EXPLANATION,
      PRIMARY_DELETE_EXPLANATION,
    ].join(' ')
    expect(text).not.toMatch(/default environment|follows? (the )?base/i)
    expect(PRIMARY_DELETE_EXPLANATION).toContain('primary environment')
    expect(BASE_EDIT_WARNING).toContain('shared defaults for all environments')
  })
})
