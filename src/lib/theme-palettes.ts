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

/** The spec's tokens. Soft colours are 9 to 16 percent tints over a surface. */
type SpecTokens = {
  bg: string
  sidebar: string
  surface: string
  surface2: string
  surface3: string
  field: string
  hover: string
  press: string
  sep: string
  sepStrong: string
  /** Boundary of inputs and toggles: 3:1 against the surface it sits on. */
  fieldBorder: string
  text: string
  text2: string
  text3: string
  brand: string
  brandInk: string
  brand2: string
  accent: string
  accentInk: string
  accentSoft: string
  link: string
  ok: string
  okSoft: string
  busy: string
  busySoft: string
  warn: string
  warnSoft: string
  bad: string
  badSoft: string
  idle: string
  idleSoft: string
  base: string
  baseSoft: string
  railHttps: string
  railInternal: string
  railData: string
  knob: string
  logBg: string
  logFg: string
  logDim: string
  logErr: string
  logOk: string
  logHl: string
  logoBars: string
  logoTee: string
  shadow: string
  shadowPop: string
  scrim: string
  /** Frosted header and menu fills (the blur itself is web decoration). */
  glassFill: string
  glassFillStrong: string
  glassFillSoft: string
  glassBorder: string
  glassBorderBright: string
  glassSpecular: string
  glassShadow: string
}

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

const navySpec: SpecTokens = {
  bg: '#0b1220',
  sidebar: '#0e1627',
  surface: '#121b2e',
  surface2: '#17223a',
  surface3: '#1e2b47',
  field: '#0f1828',
  hover: 'rgba(168,181,204,.07)',
  press: 'rgba(168,181,204,.12)',
  sep: 'rgba(168,181,204,.14)',
  sepStrong: 'rgba(168,181,204,.24)',
  fieldBorder: '#5b6b8a',
  text: '#e8eef7',
  text2: '#c9d4e5',
  text3: '#9fb0cb',
  brand: '#3366cc',
  brandInk: '#ffffff',
  brand2: '#3dd68c',
  accent: '#3366cc',
  accentInk: '#ffffff',
  accentSoft: 'rgba(51,102,204,.20)',
  link: '#86a8ff',
  ok: '#3dd68c',
  okSoft: 'rgba(61,214,140,.15)',
  busy: '#b49dff',
  busySoft: 'rgba(180,157,255,.15)',
  warn: '#f2b84b',
  warnSoft: 'rgba(242,184,75,.15)',
  bad: '#ff7a7a',
  badSoft: 'rgba(255,122,122,.15)',
  idle: '#94a0b6',
  idleSoft: 'rgba(148,160,182,.15)',
  base: '#7fa4ff',
  baseSoft: 'rgba(127,164,255,.16)',
  railHttps: '#86a8ff',
  railInternal: '#9fb0cb',
  railData: '#2fc4b2',
  knob: '#ffffff',
  logBg: '#070c16',
  logFg: '#d5deec',
  logDim: '#7d8aa3',
  logErr: '#ff8a8a',
  logOk: '#6fe3a8',
  logHl: 'rgba(255,138,138,.12)',
  logoBars: '#3dd68c',
  logoTee: '#3366cc',
  shadow: '0 8px 28px rgba(3,7,15,.40)',
  shadowPop: '0 1px 0 rgba(168,181,204,.05) inset,0 12px 32px rgba(3,7,15,.55)',
  scrim: 'rgba(11,18,32,.72)',
  glassFill: 'rgba(18,27,46,.74)',
  glassFillStrong: 'rgba(14,22,39,.86)',
  glassFillSoft: 'rgba(23,34,58,.58)',
  glassBorder: 'rgba(168,181,204,.18)',
  glassBorderBright: 'rgba(168,181,204,.30)',
  glassSpecular: 'rgba(255,255,255,.08)',
  glassShadow: '0 12px 40px rgba(3,7,15,.50)',
}

const paperSpec: SpecTokens = {
  bg: '#f5f7fa',
  sidebar: '#edf1f7',
  surface: '#ffffff',
  surface2: '#f7f9fc',
  surface3: '#e9eef6',
  field: '#ffffff',
  hover: 'rgba(15,23,42,.04)',
  press: 'rgba(15,23,42,.07)',
  sep: 'rgba(15,23,42,.09)',
  sepStrong: 'rgba(15,23,42,.16)',
  fieldBorder: 'rgba(15,23,42,.5)',
  text: '#0f172a',
  text2: '#334155',
  text3: '#52607a',
  brand: '#3366cc',
  brandInk: '#ffffff',
  brand2: '#3dd68c',
  accent: '#2b59c3',
  accentInk: '#ffffff',
  accentSoft: 'rgba(43,89,195,.09)',
  link: '#2b59c3',
  ok: '#0b7444',
  okSoft: 'rgba(11,116,68,.10)',
  busy: '#5b3fd0',
  busySoft: 'rgba(91,63,208,.09)',
  warn: '#8a5700',
  warnSoft: 'rgba(196,128,0,.12)',
  bad: '#c22a2a',
  badSoft: 'rgba(194,42,42,.09)',
  idle: '#5d6678',
  idleSoft: 'rgba(15,23,42,.06)',
  base: '#2b59c3',
  baseSoft: 'rgba(43,89,195,.10)',
  railHttps: '#2b59c3',
  railInternal: '#52607a',
  railData: '#0f7f74',
  knob: '#ffffff',
  logBg: '#0f1828',
  logFg: '#d5deec',
  logDim: '#8593ab',
  logErr: '#ff8a8a',
  logOk: '#6fe3a8',
  logHl: 'rgba(255,138,138,.14)',
  logoBars: '#1fa86a',
  logoTee: '#3366cc',
  shadow: '0 8px 24px rgba(15,23,42,.08)',
  shadowPop: '0 1px 2px rgba(15,23,42,.06),0 8px 24px rgba(15,23,42,.10)',
  scrim: 'rgba(245,247,250,.72)',
  glassFill: 'rgba(255,255,255,.78)',
  glassFillStrong: 'rgba(255,255,255,.90)',
  glassFillSoft: 'rgba(247,249,252,.70)',
  glassBorder: 'rgba(15,23,42,.12)',
  glassBorderBright: 'rgba(15,23,42,.20)',
  glassSpecular: 'rgba(255,255,255,.70)',
  glassShadow: '0 12px 32px rgba(15,23,42,.14)',
}

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
