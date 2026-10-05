import { Platform, type ViewStyle } from 'react-native'
import { colors } from '@/lib/theme'

/**
 * TurboPanel frosted chrome tokens.
 *
 * Secondary polish: a translucent fill, a hairline edge and (web only) a
 * backdrop blur. The fills, edges and shadow come from the active theme
 * (Navy or Paper), so header menus and panels stay readable in both. Not
 * iridescent / chromatic aberration; the ops console stays instrument-like.
 *
 * Keep in step with website `--tp-glass-*` in `globals.css`.
 */
export const glass = {
  /** Panel / auth fill over animated or scrolling chrome */
  fill: colors.glassFill,
  /** Sticky header / sidebar: denser for type contrast */
  fillStrong: colors.glassFillStrong,
  /** Soft chips / nested glass */
  fillSoft: colors.glassFillSoft,
  /** Hairline glass rim */
  border: colors.glassBorder,
  borderBright: colors.glassBorderBright,
  /** Top-edge specular (light reflection) */
  specular: colors.glassSpecular,
  blurPx: 16,
  saturatePct: 160,
  /** Soft lift, not multi-layer neumorphism */
  shadow: colors.glassShadow,
  /** iOS GlassView tint, near the panel colour */
  tint: colors.bgPanel,
} as const

export type GlassIntensity = 'soft' | 'regular' | 'strong'

function fillFor(intensity: GlassIntensity): string {
  switch (intensity) {
    case 'soft':
      return glass.fillSoft
    case 'strong':
      return glass.fillStrong
    default:
      return glass.fill
  }
}

function blurPxFor(intensity: GlassIntensity): number {
  switch (intensity) {
    case 'soft':
      return 12
    case 'strong':
      return 20
    default:
      return glass.blurPx
  }
}

/**
 * Web / fallback StyleSheet fragment for frosted glass.
 * Native iOS 26+ prefers {@link GlassSurface} + `expo-glass-effect`.
 */
export function glassSurfaceStyle(
  intensity: GlassIntensity = 'regular',
): ViewStyle {
  const fill = fillFor(intensity)
  const blur = blurPxFor(intensity)

  const base: ViewStyle = {
    backgroundColor: fill,
    borderColor: glass.border,
  }

  if (Platform.OS !== 'web') {
    return base
  }

  return {
    ...base,
    // RN Web accepts CSS backdrop-filter via camelCase (+ webkit prefix).
    backdropFilter: `blur(${blur}px) saturate(${glass.saturatePct}%)`,
    WebkitBackdropFilter: `blur(${blur}px) saturate(${glass.saturatePct}%)`,
    boxShadow: glass.shadow,
  } as ViewStyle
}
