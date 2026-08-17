import { Platform } from 'react-native'

/**
 * TurboPanel console brand tokens.
 *
 * Dual brand: green (self-hosted / “run”) + blue `#3366cc` (HA).
 * Interactive chrome (nav, CTAs, toolbar) follows control-plane runtime via
 * {@link chrome} CSS variables on web (Workers → blue, Deno → green).
 * Online / live status stays {@link colors.green} always.
 * Keep in step with website `--tp-green` / `--tp-blue` in `globals.css`.
 */
export const colors = {
  bg: '#000',
  bgPanel: '#0a0a0a',
  bgArea: '#080808',
  bgAreaHeader: '#0d0d0d',
  bgInput: '#111',
  bgSecondary: '#1a1a1a',
  bgInset: '#050505',
  bgSidebar: '#0a0a0a',
  /** Green-tinted selected / active surface (status / Deno chrome fallback) */
  bgActive: '#10241a',
  /** Blue-tinted selected surface (HA chrome) */
  bgActiveBlue: '#0a1628',
  border: '#222',
  borderSubtle: '#1e1e1e',
  borderMuted: '#2a2a2a',
  borderChip: '#333',
  borderArea: '#1a1a1a',
  text: '#fff',
  textTitle: '#ddd',
  textBody: '#ccc',
  textMuted: '#888',
  textDim: '#666',
  textFaint: '#555',
  textLabel: '#777',
  textChip: '#bbb',
  /** Self-hosted / run / online green */
  green: '#3dd68c',
  /** TurboPanel High Availability blue */
  blue: '#3366cc',
  /**
   * Online / success green. Prefer {@link chrome} for nav, CTAs, and toolbar
   * so Workers HA can resolve blue via CSS variables.
   */
  accent: '#3dd68c',
  error: '#ff6b6b',
  errorText: '#ff8a8a',
  errorSoft: '#ff9a9a',
  pending: '#e0b341',
  command: '#9ad2ff',
  stdout: '#cfd3d6',
  log: '#9aa0a6',
  /** On green fills */
  buttonText: '#000',
  /** On blue fills */
  buttonTextOnBlue: '#fff',
  overlay: 'rgba(0, 0, 0, 0.6)',
} as const

/**
 * Runtime interactive chrome (sidebar, primary buttons, toolbar chips).
 * On web these are CSS variables updated by {@link applyConsoleChromeRuntime}
 * when `/status` resolves — StyleSheet can bake the `var(...)` string and still
 * follow Workers blue vs Deno green. Native falls back to green until a
 * later per-tree accent pass.
 */
export const chrome = {
  accent:
    Platform.OS === 'web'
      ? 'var(--tp-chrome-accent, #3dd68c)'
      : colors.green,
  bgActive:
    Platform.OS === 'web'
      ? 'var(--tp-chrome-bg-active, #10241a)'
      : colors.bgActive,
  onAccent:
    Platform.OS === 'web'
      ? 'var(--tp-chrome-on-accent, #000000)'
      : colors.buttonText,
} as const

export const layout = {
  desktopBreakpoint: 768,
  sidebarWidth: 220,
  /** Native bottom tab bar row (excluding the home-indicator inset). */
  bottomTabHeight: 56,
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
