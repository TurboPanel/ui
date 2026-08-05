import { View, type StyleProp, type ViewStyle } from 'react-native'
import Svg, { G, Path } from 'react-native-svg'
import { TURBOPANEL_MARK_INK, consoleMarkRenderSize } from '@/lib/wordmark-lockup'
import { colors } from '@/lib/theme'

/**
 * Path data shared with `assets/brand/turbopanel-logo*.svg` — ink-tight
 * viewBox 628×370 (origin at green-bar tip / top of crossbar).
 */
const BAR_A = 'M48 0h55L55 120H0z'
const BAR_B = 'M118 0h78l-48 120H70z'
const TEE = 'M213 0h415l-48 120H428L328 370H173l100-250H165z'

/** Square canvas side equals landscape width; vertical center pad = 129. */
const SQUARE_SIDE = TURBOPANEL_MARK_INK.width
const SQUARE_TRANSLATE_Y = 129

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
  /** Keep exact landscape aspect — independent rounding letterboxes the stem tip. */
  const width = square ? size : size * (TURBOPANEL_MARK_INK.width / TURBOPANEL_MARK_INK.height)
  const height = size
  const viewBox = square
    ? `0 0 ${SQUARE_SIDE} ${SQUARE_SIDE}`
    : `0 0 ${TURBOPANEL_MARK_INK.width} ${TURBOPANEL_MARK_INK.height}`
  const decorative = accessibilityLabel.length === 0

  return (
    <View
      style={[{ width, height }, style]}
      accessible={!decorative}
      accessibilityRole={decorative ? undefined : 'image'}
      accessibilityLabel={decorative ? undefined : accessibilityLabel}
    >
      <Svg width={width} height={height} viewBox={viewBox}>
        <G {...(square ? { transform: `translate(0 ${SQUARE_TRANSLATE_Y})` } : {})}>
          <Path d={BAR_A} fill={bars} />
          <Path d={BAR_B} fill={bars} />
          <Path d={TEE} fill={tee} />
        </G>
      </Svg>
    </View>
  )
}

type LogoProps = Readonly<{
  /** Chrome design size (scaled to ink height via `consoleMarkRenderSize`). */
  size?: number
  variant?: TurboPanelLogoVariant
  style?: StyleProp<ViewStyle>
}>

/**
 * Product chrome logo — **T mark only**. Full “urboPanel” lockup is website-only
 * (`website/src/components/Logo.tsx`).
 */
export function TurboPanelLogo({
  size = 40,
  variant = 'color',
  style,
}: LogoProps) {
  return (
    <TurboPanelLogoMark
      size={consoleMarkRenderSize(size)}
      variant={variant}
      style={style}
      accessibilityLabel="TurboPanel"
    />
  )
}
