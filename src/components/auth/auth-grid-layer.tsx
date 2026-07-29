import { StyleSheet, View } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import Svg, { Defs, Path, Pattern, Rect } from 'react-native-svg'
import { hexWithAlpha } from '@/components/auth/auth-hex'
import { colors } from '@/lib/theme'

const GRID_SIZE = 36

/**
 * Native: lightweight wash + dashed SVG pattern tile + vignette.
 * Pattern tiles — one path definition, not per-line views.
 */
export function AuthGridLayer({
  accentColor,
}: Readonly<{
  accentColor: string
}>) {
  const washPeak = hexWithAlpha(accentColor, 0.07)
  const washMid = hexWithAlpha(accentColor, 0.035)
  const washSoft = hexWithAlpha(accentColor, 0.012)
  const gridStroke = hexWithAlpha(colors.borderMuted, 0.45)
  const vignette = hexWithAlpha(colors.bg, 0.55)

  return (
    <View pointerEvents="none" style={styles.root}>
      <LinearGradient
        colors={[washPeak, washMid, washSoft, colors.bg]}
        locations={[0, 0.4, 0.72, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <Svg width="100%" height="100%" style={StyleSheet.absoluteFill}>
        <Defs>
          <Pattern
            id="authGrid"
            width={GRID_SIZE}
            height={GRID_SIZE}
            patternUnits="userSpaceOnUse"
          >
            <Path
              d={`M ${GRID_SIZE} 0 L 0 0 0 ${GRID_SIZE}`}
              fill="none"
              stroke={gridStroke}
              strokeWidth={StyleSheet.hairlineWidth}
              strokeDasharray="1.5 5"
              strokeLinecap="round"
            />
          </Pattern>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#authGrid)" />
      </Svg>
      <LinearGradient
        colors={[vignette, 'transparent', 'transparent', vignette]}
        locations={[0, 0.22, 0.78, 1]}
        style={StyleSheet.absoluteFill}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: colors.bg,
    overflow: 'hidden',
  },
})
