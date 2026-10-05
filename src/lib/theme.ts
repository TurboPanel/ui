import { Platform } from 'react-native'
import { colorTokens, type Palette } from '@/lib/theme-palettes'

/**
 * TurboPanel console colour tokens (v4 "Navy & Tee", two themes).
 *
 * The palettes live in `theme-palettes.ts` (spec tokens plus the old key names
 * as aliases). What `colors` holds depends on the platform:
 * - Web: each entry is a CSS variable reference (`var(--tp-bg, ...)`), so every
 *   screen follows Light / Dark / Match computer without per-file edits. The
 *   variables are defined by the stylesheet in `src/app/+html.tsx`.
 * - Native: the Navy hex values. Screens there migrate to `useColors()`
 *   (`theme-preference.ts`) as they are rebuilt.
 *
 * Because web values are variable references, do not do colour maths on them
 * (no `colors.x + '33'`, no hex parsing, no animated colour ranges). Use
 * `useColors()` for real values, or a `*Soft` token for a tint.
 */
export const colors: Palette = colorTokens(Platform.OS === 'web')

/**
 * Interactive chrome (sidebar, primary buttons, toolbar chips): brand blue in
 * both runtimes and both themes. Green is reserved for "running / live".
 */
export const chrome = {
  accent: colors.accent,
  bgActive: colors.accentSoft,
  onAccent: colors.accentInk,
} as const

export const layout = {
  desktopBreakpoint: 768,
  sidebarWidth: 220,
  /**
   * Native bottom tab icon+label row (excluding home-indicator inset).
   * iOS UITabBar is 49pt; Android Material bottom nav is 56dp.
   */
  bottomTabHeight: Platform.OS === 'android' ? 56 : 49,
  contentMaxWidth: 1400,
  contentGutter: 32,
} as const

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
} as const

/**
 * Web-only pointer cursor for interactive rows and chips.
 *
 * Lives here rather than in a component module so the shared `components/ui`
 * primitives can reach it without importing from a feature folder.
 */
export const webPointer =
  Platform.OS === 'web' ? ({ cursor: 'pointer' } as const) : {}
