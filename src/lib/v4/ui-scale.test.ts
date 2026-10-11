import { describe, expect, it } from 'vitest'
import { navyPalette, paperPalette } from '@/lib/theme-palettes'
import {
  CHIP_HEIGHT,
  CONTROL_HEIGHT,
  controlHeight,
  isTouchDevice,
  PAGE_WIDTH,
  ROW_HEIGHT,
  TEE_STRIPE,
} from '@/lib/v4/ui-scale'

describe('control scale', () => {
  it('is one scale: 36 / 32 / 34, chips 22, rows 48', () => {
    expect(CONTROL_HEIGHT).toMatchObject({ md: 36, sm: 32, bar: 34 })
    expect(CHIP_HEIGHT.md).toBe(22)
    expect(ROW_HEIGHT.regular).toBe(48)
    expect(PAGE_WIDTH).toBe(1180)
  })

  it('keeps the sizes on a mouse', () => {
    expect(controlHeight('sm', false)).toBe(32)
    expect(controlHeight('md', false)).toBe(36)
    expect(controlHeight('lg', false)).toBe(44)
  })

  it('raises every size to 44 for a finger, never lowers one', () => {
    expect(controlHeight('sm', true)).toBe(44)
    expect(controlHeight('md', true)).toBe(44)
    expect(controlHeight('lg', true)).toBe(44)
  })

  it('treats every phone app as touch, and the browser by its pointer', () => {
    expect(isTouchDevice('ios', false)).toBe(true)
    expect(isTouchDevice('android', false)).toBe(true)
    expect(isTouchDevice('web', true)).toBe(true)
    expect(isTouchDevice('web', false)).toBe(false)
  })

  it('draws the Tee stripe in the two brand colours of both themes', () => {
    for (const p of [navyPalette, paperPalette]) {
      expect(TEE_STRIPE.from).toBe(p.brand)
      expect(TEE_STRIPE.to).toBe(p.brand2)
    }
  })
})
