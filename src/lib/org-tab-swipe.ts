import type { OrgTabSwipeDirection } from '@/lib/org-navigation'

/** Horizontal movement before the tab-swipe pan activates (lets vertical scroll win). */
export const ORG_TAB_SWIPE_ACTIVATE_PX = 32

/** Duration of the pager snap after a swipe or tab press. */
export const ORG_TAB_PAGER_ANIM_MS = 280

/** Vertical movement that fails the tab-swipe pan so pull-to-refresh can run. */
export const ORG_TAB_SWIPE_FAIL_Y_PX = 24

/** Distance (px) that commits a tab change. */
export const ORG_TAB_SWIPE_COMMIT_PX = 72

/** Fling velocity (px/s) that commits a tab change. */
export const ORG_TAB_SWIPE_COMMIT_VELOCITY = 700

/**
 * Offset large enough that this axis never activates. Used so the first/last
 * tab does not steal iOS back (rightward) or a no-op leftward swipe.
 */
const INACTIVE_AXIS_PX = 100_000

/**
 * Pan `activeOffsetX` for the current tab. Only the directions that have a
 * neighbor become easy to activate.
 */
export function orgTabSwipeActiveOffsetX(
  canGoPrevious: boolean,
  canGoNext: boolean,
): readonly [number, number] {
  const activate = ORG_TAB_SWIPE_ACTIVATE_PX
  if (canGoPrevious && canGoNext) {
    return [-activate, activate]
  }
  if (canGoNext) {
    return [-activate, INACTIVE_AXIS_PX]
  }
  if (canGoPrevious) {
    return [-INACTIVE_AXIS_PX, activate]
  }
  return [-activate, activate]
}

/**
 * Swipe left (negative X) → next tab; swipe right → previous tab.
 * Matches pager / iOS tab-adjacent navigation.
 */
export function orgTabSwipeCommit(
  translationX: number,
  velocityX: number,
): OrgTabSwipeDirection | null {
  const next =
    translationX <= -ORG_TAB_SWIPE_COMMIT_PX ||
    velocityX <= -ORG_TAB_SWIPE_COMMIT_VELOCITY
  const previous =
    translationX >= ORG_TAB_SWIPE_COMMIT_PX ||
    velocityX >= ORG_TAB_SWIPE_COMMIT_VELOCITY
  if (next && previous) {
    if (translationX < 0) {
      return 'next'
    }
    return 'previous'
  }
  if (next) {
    return 'next'
  }
  if (previous) {
    return 'previous'
  }
  return null
}

/** Pixel translateX for a pager page (`0` is the first tab). */
export function orgTabPagerTranslateX(index: number, width: number): number {
  if (index === 0) {
    return 0
  }
  return -index * width
}

/** Keep the pager strip from dragging past the first or last tab. */
export function clampOrgTabPagerTranslateX(
  translateX: number,
  width: number,
  tabCount: number,
): number {
  'worklet'
  if (width <= 0 || tabCount <= 1) {
    return 0
  }
  const min = -(tabCount - 1) * width
  if (translateX > 0) {
    return 0
  }
  if (translateX < min) {
    return min
  }
  return translateX
}

/**
 * Tab index after a pan, clamped so Overview and Servers do not wrap.
 */
export function orgTabPagerIndexAfterGesture(
  startIndex: number,
  translationX: number,
  velocityX: number,
  tabCount: number,
): number {
  const direction = orgTabSwipeCommit(translationX, velocityX)
  let next = startIndex
  if (direction === 'next') {
    next += 1
  } else if (direction === 'previous') {
    next -= 1
  }
  if (next < 0) {
    return 0
  }
  const last = tabCount - 1
  if (next > last) {
    return last
  }
  return next
}
