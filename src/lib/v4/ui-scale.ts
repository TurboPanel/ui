/**
 * v4 sizes shared by the primitives: one control scale, one chip height, the
 * page width. Pure data (no React Native), so it is tested and screens can
 * import it without the components.
 */

export type ControlSize = 'sm' | 'md' | 'lg'

export const CONTROL_HEIGHT = {
  /** Buttons, icon buttons, fields, selects, segmented controls. */
  md: 36,
  /** Small buttons, filter chips, environment switch. */
  sm: 32,
  /** Large call to action. */
  lg: 44,
  /** Every control in the top bar. */
  bar: 34,
  /** Minimum touch target on a phone or a coarse pointer. */
  touch: 44,
} as const

export const CHIP_HEIGHT = { sm: 18, md: 22, lg: 28 } as const

/** Height of a control; a touch device raises every size to the touch minimum. */
export function controlHeight(size: ControlSize, touch: boolean): number {
  const base = CONTROL_HEIGHT[size]
  return touch ? Math.max(base, CONTROL_HEIGHT.touch) : base
}

/**
 * True where fingers press: any native app, or a browser whose main pointer is
 * coarse. The browser answer is passed in so this stays pure.
 */
export function isTouchDevice(os: string, coarsePointer: boolean): boolean {
  return os !== 'web' || coarsePointer
}

export const ROW_HEIGHT = { regular: 48, tall: 56 } as const

export const RADIUS = {
  row: 8,
  button: 8,
  small: 6,
  station: 10,
  card: 12,
  layer: 14,
  sheet: 16,
  pill: 999,
} as const

export const SPACE = { s1: 4, s2: 8, s3: 12, s4: 16, s5: 20, s6: 24, s8: 32 } as const

/** Page content width: the same on every page so the header never moves between tabs. */
export const PAGE_WIDTH = 1180
export const SHEET_WIDTH = 560
export const SHEET_WIDTH_WIDE = 720
/** Below this width a sheet becomes a bottom sheet. */
export const COMPACT_BREAKPOINT = 768

/** The brand stripe (blue crossbar to green bars) is the same in both themes. */
export const TEE_STRIPE = { from: '#3366cc', to: '#3dd68c', height: 3 } as const
