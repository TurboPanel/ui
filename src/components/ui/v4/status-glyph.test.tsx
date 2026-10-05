// @vitest-environment happy-dom
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { StatusGlyph } from '@/components/ui/v4/status-glyph'
import { GLYPHS, type GlyphKey } from '@/lib/v4/status-vocab'

vi.mock('react-native-svg', async () => (await import('@/components/ui/v4/rn-stub')).svgStub)

afterEach(cleanup)

const KEYS = Object.keys(GLYPHS) as GlyphKey[]

describe('StatusGlyph', () => {
  it.each(KEYS)('draws every shape of %s in the given colour', (glyph) => {
    const { container } = render(<StatusGlyph glyph={glyph} color="#123456" />)
    const shapes = container.querySelectorAll('circle, path, rect')
    expect(shapes).toHaveLength(GLYPHS[glyph].length)
    for (const shape of shapes) {
      const paint = shape.getAttribute('fill') === '#123456' || shape.getAttribute('stroke') === '#123456'
      expect(paint).toBe(true)
    }
  })

  it('fills solid marks and strokes outlined ones', () => {
    const solid = render(<StatusGlyph glyph="dot" color="red" />).container.querySelector('circle')
    expect(solid?.getAttribute('fill')).toBe('red')
    expect(solid?.getAttribute('stroke')).toBeNull()
    cleanup()
    const ring = render(<StatusGlyph glyph="ring" color="red" />).container.querySelector('circle')
    expect(ring?.getAttribute('fill')).toBe('none')
    expect(ring?.getAttribute('stroke')).toBe('red')
    expect(ring?.getAttribute('stroke-width')).toBe('3.2')
  })

  it('dashes the unknown mark and rounds the dotted one', () => {
    const dashed = render(<StatusGlyph glyph="dashed" color="red" />).container.querySelector('circle')
    expect(dashed?.getAttribute('stroke-dasharray')).toBe('4 3')
    cleanup()
    const dotted = render(<StatusGlyph glyph="dotted" color="red" />).container.querySelector('circle')
    expect(dotted?.getAttribute('stroke-linecap')).toBe('round')
  })

  it('sizes the box and keeps the 24 unit view box', () => {
    const { container } = render(<StatusGlyph glyph="dot" color="red" size={12} />)
    const svg = container.querySelector('svg')
    expect(svg?.getAttribute('width')).toBe('12')
    expect(svg?.getAttribute('viewBox')).toBe('0 0 24 24')
  })

  it('is 10 px by default and hidden from screen readers', () => {
    const { container } = render(<StatusGlyph glyph="lock" color="red" />)
    const svg = container.querySelector('svg')
    expect(svg?.getAttribute('width')).toBe('10')
    expect(svg?.getAttribute('aria-hidden')).toBe('true')
    expect(container.querySelector('rect')?.getAttribute('width')).toBe('16')
  })
})
