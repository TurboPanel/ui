import { layout } from '@/lib/theme'

/** Minimum gap between a dropdown menu and the window edge. */
const SCREEN_EDGE_GAP = 12

export type HeaderLayout = Readonly<{
  /** Below the desktop breakpoint the sidebar is a drawer, so the header carries the logo. */
  compact: boolean
  /** Logo sits in the header (the desktop sidebar already carries it). */
  showLogo: boolean
  /** Page-width toggle is a desktop-only control. */
  showPageWidthToggle: boolean
  /** Light / Dark / Match computer switch beside the page-width toggle (wide web). */
  showThemeSwitch: boolean
  /** Compact web: the same switch sits in the account menu instead. */
  themeSwitchInMenu: boolean
  /** Profile control is a small icon; notifications fold into its menu. */
  iconOnlyAccount: boolean
  /** Separate bell beside the profile control (wide web only). */
  showBell: boolean
  /** Leading organization glyph in the trigger; dropped on compact widths. */
  showOrgGlyph: boolean
  /** The "HA" pill beside the logo; dropped on phone widths. */
  showWordmark: boolean
}>

/** Widths under this keep the header to logo, organization and profile. */
export const HEADER_WORDMARK_MIN_WIDTH = 480

/**
 * Which header controls show at a given window width. Native always has the
 * drawer-style chrome and the avatar profile control, whatever its width; the
 * page-width toggle follows the width alone (as it always has).
 */
export function headerLayoutFor(width: number, isNative: boolean): HeaderLayout {
  const compact = isNative || width < layout.desktopBreakpoint
  return {
    compact,
    showLogo: compact,
    showPageWidthToggle: width >= layout.desktopBreakpoint,
    // The phone app has one theme until its screens move to `useColors()`.
    showThemeSwitch: !isNative && width >= layout.desktopBreakpoint,
    themeSwitchInMenu: !isNative && width < layout.desktopBreakpoint,
    iconOnlyAccount: compact,
    showBell: !compact,
    showOrgGlyph: !compact,
    showWordmark: width >= HEADER_WORDMARK_MIN_WIDTH,
  }
}

/**
 * Left edge for a desktop dropdown anchored to a header trigger: aligned to the
 * trigger's start (left) or end (right) edge, then kept on screen.
 */
export function dropdownLeft(input: {
  x: number
  triggerWidth: number
  menuWidth: number
  windowWidth: number
  align: 'start' | 'end'
}): number {
  const { x, triggerWidth, menuWidth, windowWidth, align } = input
  const wanted = align === 'start' ? x : x + triggerWidth - menuWidth
  const maxLeft = Math.max(SCREEN_EDGE_GAP, windowWidth - menuWidth - SCREEN_EDGE_GAP)
  return Math.min(Math.max(SCREEN_EDGE_GAP, wanted), maxLeft)
}
