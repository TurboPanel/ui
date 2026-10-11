/**
 * v4 type: the font roles, the family names the app registers, and the
 * type scale. Pure data, so it is tested and the components share one source.
 *
 * Plus Jakarta Sans is the display face (page titles 800 italic, section
 * titles 700), Geist is the body face, Geist Mono carries SHAs, commands,
 * paths and logs. The files come from the `@expo-google-fonts/*` packages and
 * are registered in the root layout under these exact names.
 *
 * Each weight is its own family on purpose. A phone applies `fontWeight`
 * unreliably to a custom font, so components pick a role (which names the
 * weight) and never set `fontWeight` next to it.
 */

export type FontRole =
  | 'body'
  | 'bodyMedium'
  | 'bodySemibold'
  | 'mono'
  | 'monoMedium'
  | 'monoSemibold'
  | 'display'
  | 'displayItalic'

export const FONT_FAMILIES: Readonly<Record<FontRole, string>> = {
  body: 'Geist_400Regular',
  bodyMedium: 'Geist_500Medium',
  bodySemibold: 'Geist_600SemiBold',
  mono: 'GeistMono_400Regular',
  monoMedium: 'GeistMono_500Medium',
  monoSemibold: 'GeistMono_600SemiBold',
  display: 'PlusJakartaSans_700Bold',
  displayItalic: 'PlusJakartaSans_800ExtraBold_Italic',
}

const SANS_FALLBACK = 'system-ui, -apple-system, "Segoe UI", sans-serif'
const MONO_FALLBACK = 'ui-monospace, "SF Mono", Menlo, Consolas, monospace'

/** Every family name the root layout must register, for a completeness test. */
export const FONT_FAMILY_NAMES: readonly string[] = Object.values(FONT_FAMILIES)

/**
 * The `fontFamily` value for a role. The browser takes a fallback list; a
 * phone takes one name only.
 */
export function fontFamily(role: FontRole, web: boolean): string {
  const name = FONT_FAMILIES[role]
  if (!web) return name
  const fallback = role.startsWith('mono') ? MONO_FALLBACK : SANS_FALLBACK
  return `${name}, ${fallback}`
}

/** The eight sizes (px). Body text on an interactive web input is 16 elsewhere. */
export const TYPE_SCALE = {
  large: 28,
  title2: 20,
  headline: 17,
  body: 14,
  subhead: 13,
  footnote: 12,
  caption: 11,
  mono: 12.5,
} as const

export type TypeSize = keyof typeof TYPE_SCALE
