import { describe, expect, it } from 'vitest'
import { clampPageOffset } from './page-offset'

describe('clampPageOffset', () => {
  it('moves an offset past the end to the last page with rows', () => {
    expect(clampPageOffset(75, 30, 25)).toBe(25)
    expect(clampPageOffset(100, 50, 25)).toBe(25)
    expect(clampPageOffset(50, 1, 25)).toBe(0)
  })

  it('keeps an offset inside the list, and leaves an empty list alone', () => {
    expect(clampPageOffset(25, 30, 25)).toBe(25)
    expect(clampPageOffset(0, 30, 25)).toBe(0)
    expect(clampPageOffset(50, 0, 25)).toBe(50)
    expect(clampPageOffset(-5, 10, 25)).toBe(0)
    expect(clampPageOffset(50, 10, 0)).toBe(50)
  })
})
