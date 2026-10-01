import { describe, expect, it, vi } from 'vitest'
import { dropdownLeft, headerLayoutFor } from './header-layout'

vi.mock('react-native', () => ({
  Platform: { OS: 'web', select: (o: Record<string, unknown>) => o.web ?? o.default },
}))

describe('headerLayoutFor', () => {
  it.each([320, 390, 767])('keeps only logo, org and a profile icon at %ipx web', (width) => {
    const result = headerLayoutFor(width, false)
    expect(result.showLogo).toBe(true)
    expect(result.iconOnlyAccount).toBe(true)
    expect(result.showPageWidthToggle).toBe(false)
    expect(result.showBell).toBe(false)
    expect(result.showOrgGlyph).toBe(false)
  })

  it('hides the HA pill on phone widths', () => {
    expect(headerLayoutFor(320, false).showWordmark).toBe(false)
    expect(headerLayoutFor(390, true).showWordmark).toBe(false)
    expect(headerLayoutFor(600, true).showWordmark).toBe(true)
  })

  it('shows the full desktop controls at the breakpoint', () => {
    const result = headerLayoutFor(768, false)
    expect(result.showLogo).toBe(false)
    expect(result.iconOnlyAccount).toBe(false)
    expect(result.showPageWidthToggle).toBe(true)
    expect(result.showBell).toBe(true)
    expect(result.showOrgGlyph).toBe(true)
  })

  it('keeps the native avatar and header logo on a wide tablet', () => {
    const result = headerLayoutFor(1024, true)
    expect(result.showPageWidthToggle).toBe(true)
    expect(result.showLogo).toBe(true)
    expect(result.iconOnlyAccount).toBe(true)
  })
})

describe('dropdownLeft', () => {
  const base = { triggerWidth: 200, menuWidth: 280, windowWidth: 1200 }

  it('aligns to the trigger start', () => {
    expect(dropdownLeft({ ...base, x: 260, align: 'start' })).toBe(260)
  })

  it('aligns to the trigger end', () => {
    expect(dropdownLeft({ ...base, x: 900, align: 'end' })).toBe(820)
  })

  it('never goes off the left edge', () => {
    expect(dropdownLeft({ ...base, x: 2, align: 'start' })).toBe(12)
    expect(dropdownLeft({ ...base, x: 20, align: 'end' })).toBe(12)
  })

  it('never goes off the right edge', () => {
    expect(dropdownLeft({ ...base, x: 1100, align: 'start' })).toBe(908)
  })

  it('falls back to the edge gap in a window narrower than the menu', () => {
    expect(dropdownLeft({ ...base, windowWidth: 200, x: 50, align: 'start' })).toBe(12)
  })
})
