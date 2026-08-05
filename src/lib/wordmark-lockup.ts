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

/** Plus Jakarta ExtraBold Italic cap height ≈ fontSize × this. */
export const TURBOPANEL_WORDMARK_ASCENDER_RATIO = 0.78

export const TURBOPANEL_WORDMARK_STYLE = {
  skew: '-15deg',
  letterSpacingEm: 0,
  /** Width estimate per em for lockup bounding width. */
  emWidth: 6.2,
} as const

/** Shared lockup tuning — px / percent tokens, not opaque multipliers in components. */
export const TURBOPANEL_WORDMARK_LOCKUP_TUNING = {
  /** Lockup height vs caller `size` (lower = smaller overall chrome). */
  markScale: 1.05,
  /** T ink height vs lockup (word reads slightly larger than the mark). */
  markInkScale: 0.88,
  /** Horizontal start of “urboPanel” as a fraction of rendered mark width. */
  wordStartXRatio: 0.55,
  /** Space between T stem and first letter. */
  gapPx: 2,
  /** Subtracted before band-target sizing. */
  sizeTrimPx: 1,
  /**
   * Final word size as % of under-bar band fit (+ profile boost).
   * 90 = intentionally 10% smaller than a full band fill.
   */
  wordBandTargetPercent: 90,
} as const

/** Platform-specific optical offsets (website header vs console chrome). */
export const TURBOPANEL_WORDMARK_PROFILE = {
  website: { wordBoostPx: 2, wordDownPx: 1 },
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
    wordBottomOffset: -wordDownPx,
    skew: style.skew,
    letterSpacingEm: style.letterSpacingEm,
    text: TURBOPANEL_WORDMARK_TEXT,
  }
}

export function wordmarkLetterSpacingPx(fontSizePx: number): number {
  return fontSizePx * TURBOPANEL_WORDMARK_STYLE.letterSpacingEm
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
