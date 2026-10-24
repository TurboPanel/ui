/**
 * Scroll maths for a tab bar that scrolls sideways on a phone (one row, never
 * wrapped). Pure, so it can be tested without measuring anything.
 */

export type TabSpan = Readonly<{ x: number; width: number }>

/** Room left beside the active tab when it is scrolled into view, so its neighbour peeks in. */
export const TAB_SCROLL_MARGIN = 24

/**
 * Where to scroll so `tab` is fully in view, or null when it already is (or
 * nothing is measured yet). A tab cut off on the left lines up near the left
 * edge; one cut off on the right lines up near the right edge.
 */
export function tabScrollTarget(
  tab: TabSpan | undefined,
  viewportWidth: number,
  scrollX: number,
  contentWidth: number,
  margin: number = TAB_SCROLL_MARGIN
): number | null {
  if (!tab || viewportWidth <= 0) return null
  const maxScroll = Math.max(0, contentWidth - viewportWidth)
  const start = tab.x - margin
  const end = tab.x + tab.width + margin
  let target: number | null = null
  if (start < scrollX) target = start
  else if (end > scrollX + viewportWidth) target = end - viewportWidth
  if (target === null) return null
  const clamped = Math.min(maxScroll, Math.max(0, target))
  return clamped === scrollX ? null : clamped
}

/** Which edges have more tabs past them: those get the fade. */
export function tabEdgeFades(
  scrollX: number,
  viewportWidth: number,
  contentWidth: number
): Readonly<{ start: boolean; end: boolean }> {
  if (viewportWidth <= 0 || contentWidth <= viewportWidth + 1) return { start: false, end: false }
  return {
    start: scrollX > 1,
    end: scrollX + viewportWidth < contentWidth - 1,
  }
}

/** The CSS mask (web) that fades the edges which have more tabs. Null with nothing to fade. */
export function tabFadeMask(
  fades: Readonly<{ start: boolean; end: boolean }>,
  fadeWidth: number
): string | null {
  if (!fades.start && !fades.end) return null
  const left = fades.start ? `transparent 0, #000 ${fadeWidth}px` : '#000 0'
  const right = fades.end ? `#000 calc(100% - ${fadeWidth}px), transparent 100%` : '#000 100%'
  return `linear-gradient(to right, ${left}, ${right})`
}
