import { StyleSheet, View } from 'react-native'
import { hexWithAlpha } from '@/components/auth/auth-hex'
import { colors } from '@/lib/theme'

const GRID_SIZE = 36

/**
 * Web: one compositor layer — wash + dotted grid + vignette via CSS.
 * No SVG, no expo-linear-gradient, no layout measurement.
 */
export function AuthGridLayer({
  accentColor,
}: Readonly<{
  accentColor: string
}>) {
  const washPeak = hexWithAlpha(accentColor, 0.07)
  const washMid = hexWithAlpha(accentColor, 0.035)
  const washSoft = hexWithAlpha(accentColor, 0.012)
  const dot = hexWithAlpha(colors.borderMuted, 0.45)
  const vignette = hexWithAlpha(colors.bg, 0.55)

  return (
    <View
      pointerEvents="none"
      style={[
        styles.root,
        {
          // RN Web passes these through to the DOM.
          backgroundImage: [
            `linear-gradient(to bottom, ${vignette} 0%, transparent 22%, transparent 78%, ${vignette} 100%)`,
            `linear-gradient(135deg, ${washPeak} 0%, ${washMid} 40%, ${washSoft} 72%, ${colors.bg} 100%)`,
            `radial-gradient(circle, ${dot} 0.55px, transparent 0.65px)`,
          ].join(', '),
          backgroundSize: `auto, auto, ${GRID_SIZE}px ${GRID_SIZE}px`,
          backgroundRepeat: 'no-repeat, no-repeat, repeat',
        } as object,
      ]}
    />
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
  },
})
