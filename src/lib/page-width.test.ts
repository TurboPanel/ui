import { describe, expect, it } from 'vitest'
import {
  contentMaxWidthFor,
  getPageWidth,
  parsePageWidth,
  setPageWidth,
  togglePageWidth,
} from './page-width'

describe('page width', () => {
  it('reads anything but "wide" as contained', () => {
    expect(parsePageWidth('wide')).toBe('wide')
    expect(parsePageWidth('contained')).toBe('contained')
    expect(parsePageWidth(null)).toBe('contained')
    expect(parsePageWidth('nonsense')).toBe('contained')
  })

  it('caps contained content and lets wide content fill the room', () => {
    expect(contentMaxWidthFor('contained', 2400, 1400)).toBe(1400)
    expect(contentMaxWidthFor('contained', 900, 1400)).toBe(900)
    expect(contentMaxWidthFor('wide', 2400, 1400)).toBe(2400)
  })

  it('toggles and survives storage that is missing', () => {
    setPageWidth('contained')
    togglePageWidth()
    expect(getPageWidth()).toBe('wide')
    togglePageWidth()
    expect(getPageWidth()).toBe('contained')
  })
})
