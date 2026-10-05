/**
 * v4 "Navy & Tee" palettes, one per theme. Pure data and string builders, so
 * it can be tested and imported by the static-export HTML shell without
 * pulling in React Native.
 *
 * Source of truth: the v4 design spec (`theme-v4.css`). The token names are
 * the spec's, camel-cased (`--surface-2` is `surface2`). The old `colors.*`
 * keys (`bgPanel`, `textMuted`, ...) stay as aliases of those tokens so
 * screens that were not rebuilt yet keep compiling and follow the theme.
 */

export type ColorScheme = 'light' | 'dark'

/** Old `colors.*` keys, defined per palette from the spec tokens. */
type LegacyTokens = {
  bgPanel: string
  bgArea: string
  bgAreaHeader: string
  bgInput: string
  bgSecondary: string
  bgInset: string
  bgSidebar: string
  bgActive: string
  bgActiveBlue: string
  border: string
  borderSubtle: string
  borderMuted: string
  borderChip: string
  borderArea: string
  textTitle: string
  textBody: string
  textMuted: string
  textDim: string
  textFaint: string
  textLabel: string
  textChip: string
  green: string
  blue: string
  error: string
  errorText: string
  errorSoft: string
  pending: string
  command: string
  stdout: string
  log: string
  buttonText: string
  buttonTextOnBlue: string
  overlay: string
}

export type Palette = SpecTokens & LegacyTokens
export type PaletteKey = keyof Palette

/**
 * Every spec token as `[Navy, Paper]`, side by side so a change to one theme
 * is reviewed against the other.
 */
const SPEC = {
  bg: ['#0b1220', '#f5f7fa'],
  sidebar: ['#0e1627', '#edf1f7'],
  surface: ['#121b2e', '#ffffff'],
  surface2: ['#17223a', '#f7f9fc'],
  surface3: ['#1e2b47', '#e9eef6'],
  field: ['#0f1828', '#ffffff'],
  hover: ['rgba(168,181,204,.07)', 'rgba(15,23,42,.04)'],
  press: ['rgba(168,181,204,.12)', 'rgba(15,23,42,.07)'],
  sep: ['rgba(168,181,204,.14)', 'rgba(15,23,42,.09)'],
  sepStrong: ['rgba(168,181,204,.24)', 'rgba(15,23,42,.16)'],
  fieldBorder: ['#5b6b8a', 'rgba(15,23,42,.5)'],
  text: ['#e8eef7', '#0f172a'],
  text2: ['#c9d4e5', '#334155'],
  text3: ['#9fb0cb', '#52607a'],
  brand: ['#3366cc', '#3366cc'],
  brandInk: ['#ffffff', '#ffffff'],
  brand2: ['#3dd68c', '#3dd68c'],
  accent: ['#3366cc', '#2b59c3'],
  accentInk: ['#ffffff', '#ffffff'],
  accentSoft: ['rgba(51,102,204,.20)', 'rgba(43,89,195,.09)'],
  link: ['#86a8ff', '#2b59c3'],
  ok: ['#3dd68c', '#0b7444'],
  okSoft: ['rgba(61,214,140,.15)', 'rgba(11,116,68,.10)'],
  busy: ['#b49dff', '#5b3fd0'],
  busySoft: ['rgba(180,157,255,.15)', 'rgba(91,63,208,.09)'],
  warn: ['#f2b84b', '#8a5700'],
  warnSoft: ['rgba(242,184,75,.15)', 'rgba(196,128,0,.12)'],
  bad: ['#ff7a7a', '#c22a2a'],
  badSoft: ['rgba(255,122,122,.15)', 'rgba(194,42,42,.09)'],
  idle: ['#94a0b6', '#5d6678'],
  idleSoft: ['rgba(148,160,182,.15)', 'rgba(15,23,42,.06)'],
  base: ['#7fa4ff', '#2b59c3'],
  baseSoft: ['rgba(127,164,255,.16)', 'rgba(43,89,195,.10)'],
  railHttps: ['#86a8ff', '#2b59c3'],
  railInternal: ['#9fb0cb', '#52607a'],
  railData: ['#2fc4b2', '#0f7f74'],
  knob: ['#ffffff', '#ffffff'],
  logBg: ['#070c16', '#0f1828'],
  logFg: ['#d5deec', '#d5deec'],
  logDim: ['#7d8aa3', '#8593ab'],
  logErr: ['#ff8a8a', '#ff8a8a'],
  logOk: ['#6fe3a8', '#6fe3a8'],
  logHl: ['rgba(255,138,138,.12)', 'rgba(255,138,138,.14)'],
  logoBars: ['#3dd68c', '#1fa86a'],
  logoTee: ['#3366cc', '#3366cc'],
  shadow: ['0 8px 28px rgba(3,7,15,.40)', '0 8px 24px rgba(15,23,42,.08)'],
  shadowPop: ['0 1px 0 rgba(168,181,204,.05) inset,0 12px 32px rgba(3,7,15,.55)', '0 1px 2px rgba(15,23,42,.06),0 8px 24px rgba(15,23,42,.10)'],
  scrim: ['rgba(11,18,32,.72)', 'rgba(245,247,250,.72)'],
  glassFill: ['rgba(18,27,46,.74)', 'rgba(255,255,255,.78)'],
  glassFillStrong: ['rgba(14,22,39,.86)', 'rgba(255,255,255,.90)'],
  glassFillSoft: ['rgba(23,34,58,.58)', 'rgba(247,249,252,.70)'],
  glassBorder: ['rgba(168,181,204,.18)', 'rgba(15,23,42,.12)'],
  glassBorderBright: ['rgba(168,181,204,.30)', 'rgba(15,23,42,.20)'],
  glassSpecular: ['rgba(255,255,255,.08)', 'rgba(255,255,255,.70)'],
  glassShadow: ['0 12px 40px rgba(3,7,15,.50)', '0 12px 32px rgba(15,23,42,.14)'],
} as const satisfies Record<string, readonly [string, string]>

type SpecTokens = { [K in keyof typeof SPEC]: string }

function specFor(index: 0 | 1): SpecTokens {
  const entries = Object.entries(SPEC).map(([key, pair]) => [key, pair[index]])
  return Object.fromEntries(entries) as SpecTokens
}

const navySpec = specFor(0)
const paperSpec = specFor(1)

/**
 * Old key to spec token. `inset` is the one recessed surface the two themes
 * disagree on: darker than a card in Navy, a shade off white in Paper.
 */
function legacyFrom(spec: SpecTokens, inset: string): LegacyTokens {
  return {
    bgPanel: spec.surface,
    bgArea: spec.surface,
    bgAreaHeader: spec.surface2,
    bgInput: spec.field,
    bgSecondary: spec.surface3,
    bgInset: inset,
    bgSidebar: spec.sidebar,
    bgActive: spec.accentSoft,
    bgActiveBlue: spec.accentSoft,
    border: spec.sepStrong,
    borderSubtle: spec.sep,
    borderMuted: spec.sepStrong,
    borderChip: spec.sepStrong,
    borderArea: spec.sep,
    textTitle: spec.text,
    textBody: spec.text2,
    // v4 has three text levels; the old dim, faint and label greys all land
    // on the third, which clears 4.5:1 on every surface in both themes.
    textMuted: spec.text3,
    textDim: spec.text3,
    textFaint: spec.text3,
    textLabel: spec.text3,
    textChip: spec.text2,
    green: spec.ok,
    blue: spec.brand,
    error: spec.bad,
    errorText: spec.bad,
    errorSoft: spec.bad,
    pending: spec.warn,
    command: spec.link,
    stdout: spec.text2,
    log: spec.idle,
    buttonText: spec.accentInk,
    buttonTextOnBlue: spec.brandInk,
    overlay: spec.scrim,
  }
}

export const navyPalette: Palette = {
  ...navySpec,
  ...legacyFrom(navySpec, navySpec.field),
}

export const paperPalette: Palette = {
  ...paperSpec,
  ...legacyFrom(paperSpec, paperSpec.surface2),
}

export function paletteFor(scheme: ColorScheme): Palette {
  return scheme === 'light' ? paperPalette : navyPalette
}

/** `bgPanel` to `--tp-bg-panel`; `surface2` to `--tp-surface-2`. */
export function cssVarName(key: PaletteKey): string {
  return `--tp-${key.replaceAll(/([A-Z0-9])/g, '-$1').toLowerCase()}`
}

/** A `colors` entry on the web: the live theme variable, Navy as fallback. */
export function cssVarRef(key: PaletteKey): string {
  return `var(${cssVarName(key)}, ${navyPalette[key]})`
}

const paletteKeys = Object.keys(navyPalette) as PaletteKey[]

/**
 * What `colors` holds: variable references on the web, Navy values elsewhere.
 */
export function colorTokens(web: boolean): Palette {
  if (!web) return navyPalette
  const entries = paletteKeys.map((key) => [key, cssVarRef(key)] as const)
  return Object.fromEntries(entries) as Palette
}

function declarations(palette: Palette, scheme: ColorScheme): string {
  const vars = paletteKeys
    .map((key) => `${cssVarName(key)}:${palette[key]};`)
    .join('')
  return `color-scheme:${scheme};${vars}`
}

/**
 * The stylesheet that defines every `--tp-*` variable. Navy is the default
 * (also when scripts are off); Paper applies when the device is light and no
 * choice was saved (`data-theme` absent), or when Light was chosen. A saved
 * Dark choice keeps Navy even on a light device. Any element carrying
 * `data-theme` re-points the variables for its subtree.
 */
export function themeCss(): string {
  const navy = declarations(navyPalette, 'dark')
  const paper = declarations(paperPalette, 'light')
  return [
    `:root{${navy}}`,
    `@media (prefers-color-scheme: light){:root:not([data-theme]){${paper}}}`,
    // Not tied to `:root`: a screen can pin its own scheme with data-theme.
    `[data-theme="light"]{${paper}}`,
    `[data-theme="dark"]{${navy}}`,
    'html,body{background-color:var(--tp-bg);}',
  ].join('\n')
}
