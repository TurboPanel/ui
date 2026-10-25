import { describe, expect, it } from 'vitest'
import { tabEdgeFades, tabFadeMask, tabScrollTarget } from '@/lib/v4/tab-scroll'

describe('tabScrollTarget', () => {
  // Seven tabs of 100 px in a 390 px bar: 700 px of content, 310 px of scroll.
  const tab = (index: number) => ({ x: index * 100, width: 100 })

  it('leaves a tab that is already in view alone', () => {
    expect(tabScrollTarget(tab(1), 390, 0, 700)).toBeNull()
    expect(tabScrollTarget(tab(4), 390, 200, 700)).toBeNull()
  })

  it('scrolls a tab cut off on the right in, with room for its neighbour', () => {
    expect(tabScrollTarget(tab(4), 390, 0, 700)).toBe(500 + 24 - 390)
  })

  it('scrolls the last tab (Settings) fully into view on open', () => {
    expect(tabScrollTarget(tab(6), 390, 0, 700)).toBe(310)
  })

  it('scrolls a tab cut off on the left back in, never past the start', () => {
    expect(tabScrollTarget(tab(2), 390, 300, 700)).toBe(176)
    expect(tabScrollTarget(tab(0), 390, 300, 700)).toBe(0)
  })

  it('does nothing before the bar or the tab is measured', () => {
    expect(tabScrollTarget(undefined, 390, 0, 700)).toBeNull()
    expect(tabScrollTarget(tab(6), 0, 0, 700)).toBeNull()
  })
})

describe('tabEdgeFades', () => {
  it('fades only the edges that have more tabs past them', () => {
    expect(tabEdgeFades(0, 390, 700)).toEqual({ start: false, end: true })
    expect(tabEdgeFades(150, 390, 700)).toEqual({ start: true, end: true })
    expect(tabEdgeFades(310, 390, 700)).toEqual({ start: true, end: false })
  })

  it('fades nothing when every tab fits', () => {
    expect(tabEdgeFades(0, 800, 700)).toEqual({ start: false, end: false })
    expect(tabEdgeFades(0, 0, 700)).toEqual({ start: false, end: false })
  })
})

describe('tabFadeMask', () => {
  it('builds a mask for the faded edges only', () => {
    expect(tabFadeMask({ start: false, end: false }, 32)).toBeNull()
    expect(tabFadeMask({ start: false, end: true }, 32)).toBe(
      'linear-gradient(to right, #000 0, #000 calc(100% - 32px), transparent 100%)'
    )
    expect(tabFadeMask({ start: true, end: true }, 32)).toBe(
      'linear-gradient(to right, transparent 0, #000 32px, #000 calc(100% - 32px), transparent 100%)'
    )
  })
})
