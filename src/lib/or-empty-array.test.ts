import { describe, expect, it } from 'vitest'
import { orEmptyArray } from './or-empty-array'

describe('orEmptyArray', () => {
  it('returns the same array reference when value is present', () => {
    const items = ['a', 'b']
    expect(orEmptyArray(items)).toBe(items)
    expect(orEmptyArray([])).toEqual([])
  })

  it('returns a stable empty array for null and undefined', () => {
    const first = orEmptyArray(undefined)
    const second = orEmptyArray(null)
    expect(first).toEqual([])
    expect(second).toEqual([])
    expect(first).toBe(second)
  })
})
