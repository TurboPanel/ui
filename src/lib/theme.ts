/**
 * TurboPanel console brand tokens.
 *
 * Dual brand: green (self-hosted / “run”) + blue `#3366cc` (HA).
 * Auth screens pick the accent from control-plane runtime (Workers → blue,
 * Deno → green). Signed-in ops chrome stays green-primary for online/CTA.
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
  /** Green-tinted selected / active surface */
  bgActive: '#10241a',
  /** Blue-tinted selected surface (HA auth) */
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
  /** Self-hosted / run green — primary console accent + Deno auth */
  green: '#3dd68c',
  /** TurboPanel High Availability blue — Workers auth + secondary brand */
  blue: '#3366cc',
  /** Alias of {@link colors.green} for existing call sites */
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

export const layout = {
  desktopBreakpoint: 768,
  sidebarWidth: 220,
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
