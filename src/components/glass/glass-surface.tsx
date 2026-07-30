import { type ReactNode } from 'react'
import { Platform, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native'
import {
  GlassView,
  isGlassEffectAPIAvailable,
  isLiquidGlassAvailable,
} from 'expo-glass-effect'
import {
  glass,
  glassSurfaceStyle,
  type GlassIntensity,
} from '@/lib/glass'

type GlassSurfaceProps = Readonly<{
  children: ReactNode
  style?: StyleProp<ViewStyle>
  /** soft = chips; regular = panels; strong = sticky chrome */
  intensity?: GlassIntensity
  /** Native iOS glass style when Liquid Glass API is available */
  nativeStyle?: 'clear' | 'regular'
}>

function useNativeLiquidGlass(): boolean {
  if (Platform.OS !== 'ios') return false
  try {
    return isLiquidGlassAvailable() && isGlassEffectAPIAvailable()
  } catch {
    return false
  }
}

/**
 * Frosted / liquid-glass surface.
 *
 * - iOS 26+: native `GlassView` (expo-glass-effect)
 * - Web: CSS `backdrop-filter` + translucent fill
 * - Else: translucent fill (no blur)
 */
export function GlassSurface({
  children,
  style,
  intensity = 'regular',
  nativeStyle = 'regular',
}: GlassSurfaceProps) {
  const fallback = [styles.base, glassSurfaceStyle(intensity), style]
  const native = useNativeLiquidGlass()

  if (native) {
    return (
      <GlassView
        style={fallback}
        glassEffectStyle={nativeStyle}
        tintColor={glass.tint}
        colorScheme="dark"
      >
        {children}
      </GlassView>
    )
  }

  return <View style={fallback}>{children}</View>
}

const styles = StyleSheet.create({
  base: {
    borderWidth: 1,
    overflow: 'hidden',
  },
})
