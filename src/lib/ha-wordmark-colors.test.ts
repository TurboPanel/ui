import { describe, expect, it } from 'vitest'
import { haWordmarkColors } from '@/lib/ha-wordmark-colors'
import { navyPalette, paperPalette } from '@/lib/theme-palettes'

describe('haWordmarkColors', () => {
  it('light: white text on the solid brand blue', () => {
    const { fill, text } = haWordmarkColors('light', paperPalette)
    expect(text).toBe('#ffffff')
    expect(text).toBe(paperPalette.buttonTextOnBlue)
    expect(fill).toBe(paperPalette.brand)
  })

  it('dark: unchanged, title text on the blue tint', () => {
    expect(haWordmarkColors('dark', navyPalette)).toEqual({
      fill: navyPalette.bgActiveBlue,
      text: navyPalette.textTitle,
    })
  })
})
