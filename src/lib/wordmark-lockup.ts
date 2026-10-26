/**
 * TurboPanel logotype geometry — T mark + “urboPanel” under the crossbar.
 *
 * Single source for chrome lockups and inline wordmark demos. Keep in sync with
 * `website/src/lib/wordmark-lockup.ts`.
 */

export const TURBOPANEL_WORDMARK_TEXT = 'urboPanel' as const

export const TURBOPANEL_MARK_INK = {
  width: 628,
  height: 370,
} as const

export const TURBOPANEL_MARK_ASPECT =
  TURBOPANEL_MARK_INK.width / TURBOPANEL_MARK_INK.height

/** Crossbar band = 120/370; wordmark sits in the remaining 250/370. */
export const TURBOPANEL_UNDER_BAR_RATIO = 250 / TURBOPANEL_MARK_INK.height

/** Figtree Black Italic cap height ≈ fontSize × this (0.70 em). */
export const TURBOPANEL_WORDMARK_ASCENDER_RATIO = 0.7

export const TURBOPANEL_WORDMARK_STYLE = {
  /** Added to Figtree's own 9.5° italic: ~23.5°, a touch past the T stem's 21.8°. */
  skew: '-14deg',
  letterSpacingEm: -0.01,
  /** “urboPanel” at weight 900 is 4.84 em wide, plus the skew overhang. */
  emWidth: 5,
} as const

/**
 * Where Figtree's baseline sits above the bottom of a `line-height: 1` text
 * box: hhea ascent 0.95 em and descent 0.25 em leave 0.15 em under the baseline.
 */
export const TURBOPANEL_WORDMARK_BASELINE_EM = 0.15

/**
 * How far Figtree's round letters (u, b, o, a, e) dip below the baseline at
 * weight 900: 12/1000 em. The word is placed by its lowest ink, so nothing
 * crosses the base of the T.
 */
export const TURBOPANEL_WORDMARK_OVERSHOOT_EM = 0.012

/** Shared lockup tuning — px / percent tokens, not opaque multipliers in components. */
export const TURBOPANEL_WORDMARK_LOCKUP_TUNING = {
  /** Lockup height vs caller `size` (lower = smaller overall chrome). */
  markScale: 1.05,
  /** T ink height vs lockup (word reads slightly larger than the mark). */
  markInkScale: 0.88,
  /** Horizontal start of “urboPanel” as a fraction of rendered mark width. */
  wordStartXRatio: 0.55,
  /** Space between T stem and first letter (0: the word hugs the stem). */
  gapPx: 0,
  /** Drop the word so its baseline sits on the base of the T (the stem tip). */
  wordBaselineOnMarkBase: true,
  /** Subtracted before band-target sizing. */
  sizeTrimPx: 1,
  /**
   * Final word size as % of under-bar band fit (+ profile boost).
   * 104 = the caps rise a little into the crossbar band (the chosen look).
   */
  wordBandTargetPercent: 104,
} as const

/** Platform-specific optical offsets (website header vs console chrome). */
export const TURBOPANEL_WORDMARK_PROFILE = {
  website: { wordBoostPx: 2, wordDownPx: 0 },
  console: { wordBoostPx: 4, wordDownPx: 2 },
} as const

export type TurboPanelWordmarkProfile = keyof typeof TURBOPANEL_WORDMARK_PROFILE

/** Common caller `size` values for site / console chrome. */
export const TURBOPANEL_WORDMARK_CHROME_SIZE = {
  website: { compact: 24, default: 30 },
  console: { default: 40 },
} as const

export type TurboPanelWordmarkLockupGeometry = Readonly<{
  lockupWidth: number
  lockupHeight: number
  markWidth: number
  markRenderHeight: number
  wordLeft: number
  wordSize: number
  /** Pass to `bottom` (negative drops the word below the lockup edge). */
  wordBottomOffset: number
  skew: string
  letterSpacingEm: number
  text: typeof TURBOPANEL_WORDMARK_TEXT
}>

export type ComputeTurboPanelWordmarkLockupOptions = Readonly<{
  /** Design size from the host surface (before lockup mark scale). */
  size: number
  markOnly?: boolean
  profile?: TurboPanelWordmarkProfile
  wordBoostPx?: number
  wordDownPx?: number
}>

function resolveProfileOffsets(
  profile: TurboPanelWordmarkProfile,
  overrides: Pick<ComputeTurboPanelWordmarkLockupOptions, 'wordBoostPx' | 'wordDownPx'>,
): Readonly<{ wordBoostPx: number; wordDownPx: number }> {
  const base = TURBOPANEL_WORDMARK_PROFILE[profile]
  return {
    wordBoostPx: overrides.wordBoostPx ?? base.wordBoostPx,
    wordDownPx: overrides.wordDownPx ?? base.wordDownPx,
  }
}

function wordSizeFromUnderBarBand(
  lockupHeightPx: number,
  wordBoostPx: number,
): number {
  const tuning = TURBOPANEL_WORDMARK_LOCKUP_TUNING
  const underBarPx = lockupHeightPx * TURBOPANEL_UNDER_BAR_RATIO
  const bandFitPx =
    Math.round(underBarPx / TURBOPANEL_WORDMARK_ASCENDER_RATIO) -
    tuning.sizeTrimPx +
    wordBoostPx
  return Math.max(
    1,
    Math.round((bandFitPx * tuning.wordBandTargetPercent) / 100),
  )
}

/** Extra drop (px) that puts the word's lowest ink on the mark's base, or 0 when off. */
export function wordBaselineDropPx(wordSizePx: number): number {
  return TURBOPANEL_WORDMARK_LOCKUP_TUNING.wordBaselineOnMarkBase
    ? wordSizePx *
        (TURBOPANEL_WORDMARK_BASELINE_EM - TURBOPANEL_WORDMARK_OVERSHOOT_EM)
    : 0
}

/** Compute absolute lockup box + wordmark placement for any host surface. */
export function computeTurboPanelWordmarkLockup(
  options: ComputeTurboPanelWordmarkLockupOptions,
): TurboPanelWordmarkLockupGeometry {
  const profile = options.profile ?? 'console'
  const { wordBoostPx, wordDownPx } = resolveProfileOffsets(profile, options)
  const tuning = TURBOPANEL_WORDMARK_LOCKUP_TUNING
  const style = TURBOPANEL_WORDMARK_STYLE

  const lockupHeight = Math.round(options.size * tuning.markScale)
  const markRenderHeight = lockupHeight * tuning.markInkScale
  const markWidth = markRenderHeight * TURBOPANEL_MARK_ASPECT
  const wordSize = wordSizeFromUnderBarBand(lockupHeight, wordBoostPx)
  const wordLeft = markWidth * tuning.wordStartXRatio + tuning.gapPx
  const lockupWidth = options.markOnly
    ? markWidth
    : Math.max(markWidth, wordLeft + wordSize * style.emWidth)

  return {
    lockupWidth,
    lockupHeight,
    markWidth,
    markRenderHeight,
    wordLeft,
    wordSize,
    wordBottomOffset: -(wordDownPx + wordBaselineDropPx(wordSize)),
    skew: style.skew,
    letterSpacingEm: style.letterSpacingEm,
    text: TURBOPANEL_WORDMARK_TEXT,
  }
}

export function wordmarkLetterSpacingPx(fontSizePx: number): number {
  return fontSizePx * TURBOPANEL_WORDMARK_STYLE.letterSpacingEm
}

/** Ink height for mark-only console chrome (maps legacy full-lockup `size` props). */
export function consoleMarkRenderSize(designSize: number): number {
  return Math.round(
    computeTurboPanelWordmarkLockup({
      size: designSize,
      markOnly: true,
      profile: 'console',
    }).markRenderHeight,
  )
}

/** Console sidebar / auth / shell lockup from a caller `size`. */
export function consoleWordmarkLockup(
  size: number,
  markOnly = false,
): TurboPanelWordmarkLockupGeometry {
  return computeTurboPanelWordmarkLockup({
    size,
    markOnly,
    profile: 'console',
  })
}
