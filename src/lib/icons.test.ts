import { describe, expect, it, vi } from 'vitest'
import {
  COMMON_EMOJI,
  EMOJI_ICON_MAX_LENGTH,
  filterEmoji,
  ICON_KEY_LABELS,
  ICON_KEYS,
  iconValueLabel,
  isEmojiIcon,
  emojiIconsOffered,
  isEmojiIconAllowedOf,
  isIconKey,
  pastedEmojiProblem,
  resolvedIconValue,
  resolveIcon,
  supportsOrganizationIcons,
} from '@/lib/icons'

describe('icon keys', () => {
  it('lists the twelve keys the control plane accepts, each with a label', () => {
    expect(ICON_KEYS).toEqual([
      'cube',
      'globe',
      'cart',
      'bolt',
      'chat',
      'chart',
      'code',
      'book',
      'layers',
      'mail',
      'rocket',
      'image',
    ])
    for (const key of ICON_KEYS) expect(ICON_KEY_LABELS[key]).toMatch(/^[A-Z]/)
  })

  it('knows a key from anything else', () => {
    expect(isIconKey('rocket')).toBe(true)
    expect(isIconKey('Rocket')).toBe(false)
    expect(isIconKey('server')).toBe(false)
    expect(isIconKey(null)).toBe(false)
    expect(isIconKey(3)).toBe(false)
  })
})

describe('the one-emoji rule (mirrors the control plane)', () => {
  it('accepts one emoji, with skin tones, joiners, variation selectors and flags', () => {
    for (const emoji of ['🚀', '❤️', '👍🏽', '👩‍💻', '👨‍👩‍👧‍👦', '🏳️‍🌈', '🇩🇪', '☕']) {
      expect(isEmojiIcon(emoji)).toBe(true)
    }
  })

  it('refuses text, keycaps, two emoji, empty and over-long values', () => {
    for (const value of ['a', 'rocket', '🚀a', '1️⃣', '#️⃣', '🚀🚀', '', ' 🚀', 'é']) {
      expect(isEmojiIcon(value)).toBe(false)
    }
    expect('👨‍👩‍👧‍👦'.length).toBeLessThanOrEqual(EMOJI_ICON_MAX_LENGTH)
    expect(isEmojiIcon('🚀'.repeat(9))).toBe(false)
    expect(isEmojiIcon(null)).toBe(false)
    expect(isEmojiIcon(42)).toBe(false)
  })

  it('refuses one grapheme that is not a pictograph (a lone regional indicator, a symbol)', () => {
    expect(isEmojiIcon('🇩')).toBe(false)
    expect(isEmojiIcon('→')).toBe(false)
  })

  it('uses the counter it is given', () => {
    expect(isEmojiIcon('🚀', () => 2)).toBe(false)
    expect(isEmojiIcon('🚀', () => 1)).toBe(true)
  })

  it('falls back to the sequence rule on a runtime without grapheme segmentation', () => {
    for (const emoji of ['🚀', '❤️', '👍🏽', '👩‍💻', '🇩🇪']) expect(isEmojiIcon(emoji, null)).toBe(true)
    for (const value of ['🚀🚀', '→', '🇩', '🚀‍']) expect(isEmojiIcon(value, null)).toBe(false)
  })

  it('picks the sequence rule by itself when the runtime has no Intl.Segmenter', async () => {
    vi.resetModules()
    vi.stubGlobal('Intl', { ...Intl, Segmenter: undefined })
    try {
      const fresh = await import('@/lib/icons')
      expect(fresh.isEmojiIcon('👩‍💻')).toBe(true)
      expect(fresh.isEmojiIcon('🚀🚀')).toBe(false)
    } finally {
      vi.unstubAllGlobals()
      vi.resetModules()
    }
  })

  it('offers only common emoji the control plane accepts, each once', () => {
    for (const choice of COMMON_EMOJI) expect(isEmojiIcon(choice.emoji)).toBe(true)
    expect(new Set(COMMON_EMOJI.map((choice) => choice.emoji)).size).toBe(COMMON_EMOJI.length)
  })
})

describe('resolveIcon', () => {
  it('draws a key whatever the emoji setting says', () => {
    expect(resolveIcon('globe', false)).toEqual({ type: 'key', key: 'globe' })
    expect(resolveIcon('globe', true)).toEqual({ type: 'key', key: 'globe' })
  })

  it('draws an emoji only while emoji are allowed, the default otherwise', () => {
    expect(resolveIcon('🚀', true)).toEqual({ type: 'emoji', emoji: '🚀' })
    expect(resolveIcon('🚀', false)).toEqual({ type: 'default' })
  })

  it('draws the default for nothing or for an unknown value', () => {
    expect(resolveIcon(null, true)).toEqual({ type: 'default' })
    expect(resolveIcon(undefined, true)).toEqual({ type: 'default' })
    expect(resolveIcon('server', true)).toEqual({ type: 'default' })
  })

  it('gives the value as shown, null for the default', () => {
    expect(resolvedIconValue('cart', false)).toBe('cart')
    expect(resolvedIconValue('🚀', true)).toBe('🚀')
    expect(resolvedIconValue('🚀', false)).toBeNull()
    expect(resolvedIconValue(null, true)).toBeNull()
  })
})

describe('organization icon fields', () => {
  it('treats a missing emoji setting as allowed (older control plane)', () => {
    expect(isEmojiIconAllowedOf(undefined)).toBe(true)
    expect(isEmojiIconAllowedOf(null)).toBe(true)
    expect(isEmojiIconAllowedOf({})).toBe(true)
    expect(isEmojiIconAllowedOf({ isEmojiIconAllowed: true })).toBe(true)
    expect(isEmojiIconAllowedOf({ isEmojiIconAllowed: false })).toBe(false)
  })

  it('offers emoji in a picker only when the fields are served and emoji are allowed', () => {
    expect(emojiIconsOffered(undefined)).toBe(false)
    expect(emojiIconsOffered({})).toBe(false)
    expect(emojiIconsOffered({ isEmojiIconAllowed: false })).toBe(false)
    expect(emojiIconsOffered({ isEmojiIconAllowed: true })).toBe(true)
  })

  it('shows the icon controls only when the control plane serves the fields', () => {
    expect(supportsOrganizationIcons(undefined)).toBe(false)
    expect(supportsOrganizationIcons({})).toBe(false)
    expect(supportsOrganizationIcons({ icon: null })).toBe(false)
    expect(supportsOrganizationIcons({ icon: null, isEmojiIconAllowed: false })).toBe(true)
  })
})

describe('picker helpers', () => {
  it('filters the common emoji by every word typed', () => {
    expect(filterEmoji('')).toBe(COMMON_EMOJI)
    expect(filterEmoji('  ')).toBe(COMMON_EMOJI)
    expect(filterEmoji('rocket').map((choice) => choice.emoji)).toEqual(['🚀'])
    expect(filterEmoji('Heart blue').map((choice) => choice.emoji)).toEqual(['💙'])
    expect(filterEmoji('nothing like this')).toEqual([])
  })

  it('names what is wrong with a pasted emoji', () => {
    expect(pastedEmojiProblem('')).toBeNull()
    expect(pastedEmojiProblem('  🚀 ')).toBeNull()
    expect(pastedEmojiProblem('rocket')).toMatch(/one emoji/)
    expect(pastedEmojiProblem('🚀🚀')).toMatch(/one emoji/)
  })

  it('labels a key, an emoji and the default', () => {
    expect(iconValueLabel('rocket')).toBe('Rocket')
    expect(iconValueLabel('🚀')).toBe('🚀')
    expect(iconValueLabel(null)).toBe('Default')
    expect(iconValueLabel('nope')).toBe('Default')
  })
})
