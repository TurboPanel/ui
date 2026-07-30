import { Platform, type ViewStyle } from 'react-native'
import { colors } from '@/lib/theme'

/**
 * TurboPanel liquid-glass tokens (ui-ux-pro-max: Liquid Glass + Glassmorphism).
 *
 * Secondary polish on Dark OLED — frosted fill + saturate blur + hairline
 * specular edge. Not iridescent / chromatic aberration (reserved for marketing
 * excess; ops console stays instrument-like).
 *
 * Keep in step with website `--tp-glass-*` in `globals.css`.
 */
export const glass = {
  /** Panel / auth fill over animated or scrolling chrome */
  fill: 'rgba(10, 10, 10, 0.72)',
  /** Sticky header / sidebar — denser for type contrast */
  fillStrong: 'rgba(8, 8, 8, 0.82)',
  /** Soft chips / nested glass */
  fillSoft: 'rgba(17, 17, 17, 0.55)',
  /** Hairline glass rim */
  border: 'rgba(255, 255, 255, 0.12)',
  borderBright: 'rgba(255, 255, 255, 0.2)',
  /** Top-edge specular (light reflection) */
  specular: 'rgba(255, 255, 255, 0.1)',
  blurPx: 16,
  saturatePct: 160,
  /** Soft lift — not multi-layer neumorphism */
  shadow: '0 12px 40px rgba(0, 0, 0, 0.45)',
  /** iOS GlassView tint — near OLED panel */
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
