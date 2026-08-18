import { type ReactNode } from 'react'
import {
  Platform,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native'
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

/** Which edges get the default glass hairline rim. */
export type GlassRim = 'all' | 'none' | 'top' | 'bottom'

type GlassSurfaceProps = Readonly<{
  children: ReactNode
  style?: StyleProp<ViewStyle>
  /** soft = chips; regular = panels; strong = sticky chrome */
  intensity?: GlassIntensity
  /** Native iOS glass style when Liquid Glass API is available */
  nativeStyle?: 'clear' | 'regular'
  /**
   * Hairline rim edges. Shell chrome on rounded devices should use `top` /
   * `bottom` so left/right borders don’t fight the screen curve.
   */
  rim?: GlassRim
}>

function useNativeLiquidGlass(): boolean {
  if (Platform.OS !== 'ios') return false
  try {
    return isLiquidGlassAvailable() && isGlassEffectAPIAvailable()
  } catch {
    return false
  }
}

function rimStyle(rim: GlassRim): ViewStyle {
  switch (rim) {
    case 'none':
      return { borderWidth: 0 }
    case 'top':
      return {
        borderWidth: 0,
        borderTopWidth: 1,
      }
    case 'bottom':
      return {
        borderWidth: 0,
        borderBottomWidth: 1,
      }
    default:
      return { borderWidth: 1 }
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
  rim = 'all',
}: GlassSurfaceProps) {
  const fallback = [
    styles.base,
    glassSurfaceStyle(intensity),
    rimStyle(rim),
    style,
  ]
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
    overflow: 'hidden',
  },
})
