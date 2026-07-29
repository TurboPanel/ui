import { StyleSheet, View, useWindowDimensions } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import Svg, { Defs, Path, Pattern, Rect } from 'react-native-svg'
import { hexWithAlpha, mixHexWithBlack } from '@/components/auth/auth-hex'
import { colors } from '@/lib/theme'

const GRID_SIZE = 36

/**
 * Wash + dotted/dashed grid.
 * Wash uses opaque accent→black mixes (extra stops) so Safari does not
 * dither/band the way it does with alpha-interpolated gradients.
 */
export function AuthGridLayer({
  accentColor,
}: Readonly<{
  accentColor: string
}>) {
  const { width, height } = useWindowDimensions()
  // Opaque mixes — no #RRGGBBAA in the wash (Safari banding).
  const wash = [
    mixHexWithBlack(accentColor, 0.16),
    mixHexWithBlack(accentColor, 0.11),
    mixHexWithBlack(accentColor, 0.07),
    mixHexWithBlack(accentColor, 0.04),
    mixHexWithBlack(accentColor, 0.018),
    colors.bg,
  ] as const
  const gridStroke = hexWithAlpha(colors.borderMuted, 0.7)
  const ready = width > 0 && height > 0

  return (
    <View pointerEvents="none" style={styles.root}>
      <LinearGradient
        colors={[...wash]}
        locations={[0, 0.16, 0.34, 0.55, 0.76, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      {ready ? (
        <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
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
                strokeWidth={1}
                strokeDasharray="1.5 5"
                strokeLinecap="round"
              />
            </Pattern>
          </Defs>
          <Rect width={width} height={height} fill="url(#authGrid)" />
        </Svg>
      ) : null}
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
