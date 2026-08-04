import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native'
import Svg, { G, Path } from 'react-native-svg'
import { colors } from '@/lib/theme'

/** Path data shared with `assets/brand/turbopanel-logo*.svg`. */
const BAR_A = 'M55 40h55L62 160H7z'
const BAR_B = 'M125 40h78l-48 120H77z'
const TEE = 'M220 40h415l-48 120H435L335 410H180l100-250H172z'

/** Visible letters after the T mark; a11y label stays “TurboPanel”. */
const WORDMARK = 'urboPanel'

/** Mark viewBox 680×520. */
const MARK_ASPECT = 680 / 520
/** Empty pad above/below ink in the mark viewBox. */
const INK_PAD = 75 / 520
/** Stem tip → top of blue/green bars. */
const INK_HEIGHT = 370 / 520
/**
 * Plus Jakarta Sans ExtraBold Italic: `actualBoundingBoxAscent / fontSize`
 * for tall letters (P, l, b). True measured match to the T ink height is
 * ~0.757; we size noticeably smaller (~1.02) so the wordmark sits optically
 * under the T rather than matching its full weight.
 */
const ASCENDER_RATIO = 1.02
/**
 * Baseline offset **below** the CSS box’s bottom edge, as a fraction of
 * font-size — for this face at `lineHeight === fontSize`. NOT
 * `fontBoundingBoxDescent / fontSize` (that overshoots by ~2.5x): with a
 * tight line box shorter than the font’s natural em-box (ascent+descent),
 * the engine applies negative half-leading, pulling the baseline up toward
 * the box’s top. Measured:
 * `(halfLeading + fontBoundingBoxDescent) / fontSize` where
 * `halfLeading = fontSize - (fontBoundingBoxAscent + fontBoundingBoxDescent)`.
 */
const BASELINE_TRIM_RATIO = 0.0851
/** Optical nudge: lift wordmark above the geometric T-tip baseline. */
const WORDMARK_BASELINE_LIFT_PX = 2

/** Brand display face — Plus Jakarta Sans (matches website `--font-display`). */
export const TURBOPANEL_BRAND_FONT = 'PlusJakartaSansItalic'

/**
 * Extra oblique beyond the italic face so the wordmark matches the T lean
 * (mark edges are ~atan(48/120) ≈ 22°; italic alone is ~12°).
 */
const WORDMARK_SKEW = '-14deg'

export type TurboPanelLogoVariant = 'color' | 'white' | 'mono'

type MarkProps = Readonly<{
  size?: number
  variant?: TurboPanelLogoVariant
  /** Square canvas (app-icon framing) vs landscape mark. */
  square?: boolean
  style?: StyleProp<ViewStyle>
  accessibilityLabel?: string
}>

function fillsForVariant(variant: TurboPanelLogoVariant): Readonly<{
  bars: string
  tee: string
}> {
  if (variant === 'white') {
    return { bars: '#FFFFFF', tee: '#FFFFFF' }
  }
  if (variant === 'mono') {
    return { bars: colors.text, tee: colors.text }
  }
  return { bars: colors.green, tee: colors.blue }
}

/**
 * Official TurboPanel T mark (inline SVG — same geometry as `/assets/brand`).
 */
export function TurboPanelLogoMark({
  size = 40,
  variant = 'color',
  square = false,
  style,
  accessibilityLabel = 'TurboPanel',
}: MarkProps) {
  const { bars, tee } = fillsForVariant(variant)
  const width = square ? size : Math.round(size * MARK_ASPECT)
  const height = size
  const viewBox = square ? '0 0 680 680' : '0 0 680 520'
  const translateY = square ? 115 : 35
  const decorative = accessibilityLabel.length === 0

  return (
    <View
      style={[{ width, height }, style]}
      accessible={!decorative}
      accessibilityRole={decorative ? undefined : 'image'}
      accessibilityLabel={decorative ? undefined : accessibilityLabel}
    >
      <Svg width={width} height={height} viewBox={viewBox}>
        <G transform={`translate(35 ${translateY})`}>
          <Path d={BAR_A} fill={bars} />
          <Path d={BAR_B} fill={bars} />
          <Path d={TEE} fill={tee} />
        </G>
      </Svg>
    </View>
  )
}

type LogoProps = Readonly<{
  /** Mark height in px; wordmark locks under the blue bar. */
  size?: number
  variant?: TurboPanelLogoVariant
  /** Hide the TurboPanel wordmark. */
  markOnly?: boolean
  style?: StyleProp<ViewStyle>
}>

/**
 * Logotype: T mark + italic “urboPanel” tucked under the blue crossbar.
 */
export function TurboPanelLogo({
  size = 40,
  variant = 'color',
  markOnly = false,
  style,
}: LogoProps) {
  const markWidth = Math.round(size * MARK_ASPECT)
  /** Under the blue bar, right of the stem — a little air after the T. */
  const wordLeft = Math.round(markWidth * 0.6)
  /** Tall letters (P, l) span the same ink height as the T mark. */
  const wordSize = Math.round((size * INK_HEIGHT) / ASCENDER_RATIO)
  /** Baseline on the T stem tip, then lift a couple px for optical balance. */
  const wordBottom = Math.round(
    size * INK_PAD - wordSize * BASELINE_TRIM_RATIO + WORDMARK_BASELINE_LIFT_PX,
  )
  const width = markOnly
    ? markWidth
    : Math.max(markWidth, wordLeft + Math.round(wordSize * 5.9))

  return (
    <View
      style={[{ width, height: size }, styles.lockup, style]}
      accessibilityRole="image"
      accessibilityLabel="TurboPanel"
    >
      <View style={styles.markLayer} pointerEvents="none">
        <TurboPanelLogoMark
          size={size}
          variant={variant}
          accessibilityLabel=""
        />
      </View>
      {markOnly ? null : (
        <Text
          style={[
            styles.wordmark,
            {
              left: wordLeft,
              bottom: wordBottom,
              fontSize: wordSize,
              lineHeight: wordSize,
              transform: [{ skewX: WORDMARK_SKEW }],
            },
          ]}
          importantForAccessibility="no"
        >
          {WORDMARK}
        </Text>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  lockup: {
    position: 'relative',
    overflow: 'visible',
  },
  markLayer: {
    position: 'absolute',
    left: 0,
    top: 0,
  },
  wordmark: {
    position: 'absolute',
    color: colors.text,
    // Italic face file — do not also set fontStyle or some platforms double-slant.
    fontFamily: TURBOPANEL_BRAND_FONT,
    fontWeight: '800',
    letterSpacing: 0.6,
    // Keep baseline planted while skewing to the T angle.
    transformOrigin: 'left bottom',
  },
})
