/**
 * Icons for projects and organizations: a key from the fixed list, or one
 * emoji. Mirrors the control plane's `src/lib/icons.ts` so the picker never
 * offers what the API refuses. Keys are always allowed; an emoji only while
 * the organization allows emoji icons. A stored emoji is never rewritten when
 * emoji are turned off: the screens draw the default icon instead.
 */

/** The fixed list of icon keys the control plane accepts. */
export const ICON_KEYS = [
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
] as const

export type IconKey = (typeof ICON_KEYS)[number]

/** Names for the picker's labels (book title case, like the mockup). */
export const ICON_KEY_LABELS: Readonly<Record<IconKey, string>> = {
  cube: 'Cube',
  globe: 'Globe',
  cart: 'Cart',
  bolt: 'Bolt',
  chat: 'Chat',
  chart: 'Chart',
  code: 'Code',
  book: 'Book',
  layers: 'Layers',
  mail: 'Mail',
  rocket: 'Rocket',
  image: 'Image',
}

/** Longest emoji icon, in UTF-16 code units (the control plane's limit). */
export const EMOJI_ICON_MAX_LENGTH = 16

export function isIconKey(value: unknown): value is IconKey {
  return typeof value === 'string' && (ICON_KEYS as readonly string[]).includes(value)
}

const ASCII = /\p{ASCII}/u
const PICTOGRAPHIC = /\p{Extended_Pictographic}/u
const FLAG = /^\p{Regional_Indicator}{2}$/u
/**
 * One emoji written out, for a runtime without `Intl.Segmenter`: a flag pair,
 * or pictographs with skin tones and variation selectors joined by ZWJ.
 */
const ONE_EMOJI_SEQUENCE =
  /^(?:\p{Regional_Indicator}{2}|\p{Extended_Pictographic}[\u{FE0F}\p{Emoji_Modifier}]*(?:\u{200D}\p{Extended_Pictographic}[\u{FE0F}\p{Emoji_Modifier}]*)*)$/u

/** Counts graphemes; `null` when the runtime cannot (the caller then uses the sequence rule). */
export type GraphemeCounter = ((value: string) => number) | null

function defaultGraphemeCounter(): GraphemeCounter {
  if (typeof Intl === 'undefined' || typeof Intl.Segmenter !== 'function') return null
  const segmenter = new Intl.Segmenter('en', { granularity: 'grapheme' })
  return (value) => [...segmenter.segment(value)].length
}

let cachedCounter: GraphemeCounter | undefined

/**
 * True for exactly one emoji: no ASCII, at most {@link EMOJI_ICON_MAX_LENGTH}
 * UTF-16 units, one grapheme, and that grapheme a pictograph or a flag pair.
 * A keycap such as `1️⃣` starts with an ASCII digit, so it is refused.
 * `counter` is for tests; screens use the runtime's own.
 */
export function isEmojiIcon(value: unknown, counter?: GraphemeCounter): value is string {
  if (typeof value !== 'string') return false
  if (value.length === 0 || value.length > EMOJI_ICON_MAX_LENGTH) return false
  if (ASCII.test(value)) return false
  if (counter === undefined) {
    cachedCounter ??= defaultGraphemeCounter()
    counter = cachedCounter
  }
  if (counter === null) return ONE_EMOJI_SEQUENCE.test(value)
  if (counter(value) !== 1) return false
  return PICTOGRAPHIC.test(value) || FLAG.test(value)
}

/** What a stored icon draws as, given the organization's emoji setting. */
export type ResolvedIcon =
  | Readonly<{ type: 'key'; key: IconKey }>
  | Readonly<{ type: 'emoji'; emoji: string }>
  | Readonly<{ type: 'default' }>

/**
 * A key draws its glyph; an emoji draws itself only while emoji are allowed;
 * null, an emoji while they are off, or anything unknown draws the default.
 */
export function resolveIcon(
  icon: string | null | undefined,
  isEmojiIconAllowed: boolean
): ResolvedIcon {
  if (isIconKey(icon)) return { type: 'key', key: icon }
  if (isEmojiIconAllowed && isEmojiIcon(icon)) return { type: 'emoji', emoji: icon }
  return { type: 'default' }
}

/** The icon fields of an organization record; either may be missing on an older control plane. */
export type OrganizationIconFields = Readonly<{
  icon?: string | null
  isEmojiIconAllowed?: boolean
}>

/** Missing means allowed: an older control plane has no setting and refuses no emoji. */
export function isEmojiIconAllowedOf(org: OrganizationIconFields | null | undefined): boolean {
  return org?.isEmojiIconAllowed !== false
}

/**
 * True when the control plane serves the organization icon fields, so the
 * Organization Icon and Allow Emoji Icons controls can be shown.
 */
export function supportsOrganizationIcons(org: OrganizationIconFields | null | undefined): boolean {
  return Boolean(org) && typeof org?.isEmojiIconAllowed === 'boolean'
}

/** Customer text for the 422 `emoji_icons_off` refusal. */
export const EMOJI_ICONS_OFF_COPY =
  'This organization has emoji icons turned off. Pick one of the regular icons.'

/** One emoji the picker offers, with the words its search matches. */
export type EmojiChoice = Readonly<{ emoji: string; name: string }>

/** Common emoji for the picker's Emoji tab. Every one passes {@link isEmojiIcon}. */
export const COMMON_EMOJI: readonly EmojiChoice[] = [
  { emoji: '🚀', name: 'rocket launch' },
  { emoji: '⚡', name: 'lightning bolt fast' },
  { emoji: '🔥', name: 'fire hot' },
  { emoji: '✨', name: 'sparkles new' },
  { emoji: '⭐', name: 'star' },
  { emoji: '🌟', name: 'glowing star' },
  { emoji: '💡', name: 'light bulb idea' },
  { emoji: '🎯', name: 'target goal' },
  { emoji: '🏆', name: 'trophy winner' },
  { emoji: '🎉', name: 'party celebration' },
  { emoji: '❤️', name: 'red heart love' },
  { emoji: '💙', name: 'blue heart' },
  { emoji: '💚', name: 'green heart' },
  { emoji: '💜', name: 'purple heart' },
  { emoji: '🧡', name: 'orange heart' },
  { emoji: '🌍', name: 'globe earth world' },
  { emoji: '🌐', name: 'globe web internet' },
  { emoji: '🏠', name: 'house home' },
  { emoji: '🏢', name: 'office building company' },
  { emoji: '🏭', name: 'factory' },
  { emoji: '🏪', name: 'store shop' },
  { emoji: '🛒', name: 'shopping cart store' },
  { emoji: '💳', name: 'credit card payment' },
  { emoji: '💰', name: 'money bag' },
  { emoji: '📈', name: 'chart up growth' },
  { emoji: '📊', name: 'bar chart stats' },
  { emoji: '🗂️', name: 'card index dividers files' },
  { emoji: '📁', name: 'folder' },
  { emoji: '📦', name: 'package box' },
  { emoji: '📚', name: 'books docs library' },
  { emoji: '📖', name: 'open book docs' },
  { emoji: '📝', name: 'memo note write' },
  { emoji: '📧', name: 'email mail' },
  { emoji: '💬', name: 'speech chat' },
  { emoji: '📣', name: 'megaphone announce' },
  { emoji: '🔔', name: 'bell notification' },
  { emoji: '📅', name: 'calendar date' },
  { emoji: '⏰', name: 'alarm clock time' },
  { emoji: '🔒', name: 'lock secure' },
  { emoji: '🔑', name: 'key' },
  { emoji: '🛡️', name: 'shield security' },
  { emoji: '⚙️', name: 'gear settings' },
  { emoji: '🔧', name: 'wrench tool' },
  { emoji: '🛠️', name: 'hammer and wrench tools' },
  { emoji: '🧪', name: 'test tube lab' },
  { emoji: '🔬', name: 'microscope science' },
  { emoji: '🤖', name: 'robot bot' },
  { emoji: '💻', name: 'laptop computer' },
  { emoji: '🖥️', name: 'desktop computer' },
  { emoji: '📱', name: 'mobile phone app' },
  { emoji: '🎮', name: 'video game controller' },
  { emoji: '🎨', name: 'palette art design' },
  { emoji: '📷', name: 'camera photo' },
  { emoji: '🎬', name: 'clapper film video' },
  { emoji: '🎵', name: 'music note' },
  { emoji: '☁️', name: 'cloud' },
  { emoji: '☀️', name: 'sun' },
  { emoji: '🌙', name: 'moon night' },
  { emoji: '🌈', name: 'rainbow' },
  { emoji: '🌱', name: 'seedling plant' },
  { emoji: '🌲', name: 'tree' },
  { emoji: '🌸', name: 'blossom flower' },
  { emoji: '🍕', name: 'pizza food' },
  { emoji: '☕', name: 'coffee' },
  { emoji: '🍔', name: 'burger food' },
  { emoji: '🐳', name: 'whale' },
  { emoji: '🐙', name: 'octopus' },
  { emoji: '🦊', name: 'fox' },
  { emoji: '🐱', name: 'cat' },
  { emoji: '🐶', name: 'dog' },
  { emoji: '🦄', name: 'unicorn' },
  { emoji: '🐝', name: 'bee' },
  { emoji: '🧩', name: 'puzzle piece' },
  { emoji: '🎓', name: 'graduation school' },
  { emoji: '🏥', name: 'hospital health' },
  { emoji: '✈️', name: 'airplane travel' },
  { emoji: '🚚', name: 'truck delivery' },
  { emoji: '🧭', name: 'compass' },
  { emoji: '🗺️', name: 'map' },
  { emoji: '🚩', name: 'flag' },
]

/** The common emoji whose words contain every word of `query`; all of them for an empty query. */
export function filterEmoji(
  query: string,
  choices: readonly EmojiChoice[] = COMMON_EMOJI
): readonly EmojiChoice[] {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  if (words.length === 0) return choices
  return choices.filter((choice) => words.every((word) => choice.name.includes(word)))
}

/**
 * What is wrong with a pasted emoji, or null when it can be used. Surrounding
 * spaces are ignored; an empty field is not an error.
 */
export function pastedEmojiProblem(value: string): string | null {
  const trimmed = value.trim()
  if (trimmed === '') return null
  return isEmojiIcon(trimmed) ? null : 'Paste exactly one emoji, with no letters or numbers.'
}

/** A short spoken name for an icon value: the key's label, the emoji itself, or "Default". */
export function iconValueLabel(icon: string | null | undefined): string {
  if (isIconKey(icon)) return ICON_KEY_LABELS[icon]
  if (isEmojiIcon(icon)) return icon
  return 'Default'
}

/** The stored icon as the screens show it: null when it draws as the default. */
export function resolvedIconValue(
  icon: string | null | undefined,
  isEmojiIconAllowed: boolean
): string | null {
  const resolved = resolveIcon(icon, isEmojiIconAllowed)
  if (resolved.type === 'key') return resolved.key
  if (resolved.type === 'emoji') return resolved.emoji
  return null
}
