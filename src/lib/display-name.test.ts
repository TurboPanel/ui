import { describe, expect, it } from 'vitest'
import {
  DISPLAY_NAME_MAX_LENGTH,
  foldDisplayNameApostrophes,
  HEADER_ORG_NAME_MAX_CHARS,
  isDisplayNameTaken,
  truncateDisplayName,
  validateDisplayName,
} from '@/lib/display-name'
import { validateEnvironmentName } from '@/lib/environment-validation'

describe('validateDisplayName', () => {
  it('accepts apostrophes in labels', () => {
    expect(validateDisplayName("O'Reilly")).toBeNull()
    expect(validateDisplayName("McDonald's")).toBeNull()
  })

  it('accepts typographic apostrophes from iOS/macOS', () => {
    expect(validateDisplayName('O\u2019Reilly')).toBeNull()
  })

  it('accepts non-Latin, accented, and emoji labels', () => {
    expect(validateDisplayName('Müller GmbH')).toBeNull()
    expect(validateDisplayName('东京')).toBeNull()
    expect(validateDisplayName('Café')).toBeNull()
    expect(validateDisplayName('اسم')).toBeNull()
    expect(validateDisplayName('🚀')).toBeNull()
    expect(validateDisplayName('bad@name')).toBeNull()
  })

  it('rejects control characters', () => {
    expect(validateDisplayName('bad\nname')).toBe(
      'Name cannot contain control characters.',
    )
  })

  it('rejects over-length names by code point', () => {
    expect(validateDisplayName('a'.repeat(DISPLAY_NAME_MAX_LENGTH + 1))).toBe(
      `Name must be ${String(DISPLAY_NAME_MAX_LENGTH)} characters or fewer.`,
    )
    expect(validateDisplayName('😀'.repeat(DISPLAY_NAME_MAX_LENGTH))).toBeNull()
  })
})

describe('truncateDisplayName', () => {
  it('leaves short names unchanged', () => {
    expect(truncateDisplayName('Acme')).toBe('Acme')
  })

  it('leaves names at the header limit unchanged', () => {
    const name = 'A'.repeat(HEADER_ORG_NAME_MAX_CHARS)
    expect(truncateDisplayName(name)).toBe(name)
  })

  it('caps longer names and adds an ellipsis', () => {
    const name = `${'A'.repeat(HEADER_ORG_NAME_MAX_CHARS)} Corp`
    expect(truncateDisplayName(name)).toBe(
      `${'A'.repeat(HEADER_ORG_NAME_MAX_CHARS)}…`,
    )
  })

  it('trims a trailing space before the ellipsis', () => {
    const name = `${'A'.repeat(HEADER_ORG_NAME_MAX_CHARS - 1)} extra`
    expect(truncateDisplayName(name)).toBe(
      `${'A'.repeat(HEADER_ORG_NAME_MAX_CHARS - 1)}…`,
    )
  })
})

describe('foldDisplayNameApostrophes', () => {
  it('maps curly quotes to ASCII apostrophe', () => {
    expect(foldDisplayNameApostrophes('O\u2019Reilly')).toBe("O'Reilly")
  })
})

describe('isDisplayNameTaken', () => {
  it('treats curly and ASCII apostrophes as the same key', () => {
    expect(isDisplayNameTaken('O\u2019Reilly', ["O'Reilly"])).toBe(true)
  })

  it('treats NFC and NFD forms as the same key', () => {
    expect(isDisplayNameTaken('Café', ['Cafe\u0301'])).toBe(true)
  })
})

describe('validateEnvironmentName', () => {
  it('shares the display-name rule including apostrophes', () => {
    expect(validateEnvironmentName("O'Reilly")).toBeNull()
  })
})
