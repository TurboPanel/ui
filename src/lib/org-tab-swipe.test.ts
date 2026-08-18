import { describe, expect, it } from 'vitest'
import {
  ORG_TAB_SWIPE_ACTIVATE_PX,
  ORG_TAB_SWIPE_COMMIT_PX,
  ORG_TAB_SWIPE_COMMIT_VELOCITY,
  clampOrgTabPagerTranslateX,
  orgTabPagerIndexAfterGesture,
  orgTabPagerTranslateX,
  orgTabSwipeActiveOffsetX,
  orgTabSwipeCommit,
} from './org-tab-swipe'

describe('orgTabSwipeActiveOffsetX', () => {
  it('activates both ways when neighbors exist on both sides', () => {
    expect(orgTabSwipeActiveOffsetX(true, true)).toEqual([
      -ORG_TAB_SWIPE_ACTIVATE_PX,
      ORG_TAB_SWIPE_ACTIVATE_PX,
    ])
  })

  it('only activates leftward (next) on the first tab', () => {
    const [left, right] = orgTabSwipeActiveOffsetX(false, true)
    expect(left).toBe(-ORG_TAB_SWIPE_ACTIVATE_PX)
    expect(right).toBeGreaterThan(1000)
  })

  it('only activates rightward (previous) on the last tab', () => {
    const [left, right] = orgTabSwipeActiveOffsetX(true, false)
    expect(left).toBeLessThan(-1000)
    expect(right).toBe(ORG_TAB_SWIPE_ACTIVATE_PX)
  })

  it('falls back to a symmetric offset when neither neighbor exists', () => {
    expect(orgTabSwipeActiveOffsetX(false, false)).toEqual([
      -ORG_TAB_SWIPE_ACTIVATE_PX,
      ORG_TAB_SWIPE_ACTIVATE_PX,
    ])
  })
})

describe('orgTabSwipeCommit', () => {
  it('commits next from a leftward distance', () => {
    expect(orgTabSwipeCommit(-ORG_TAB_SWIPE_COMMIT_PX, 0)).toBe('next')
  })

  it('commits previous from a rightward distance', () => {
    expect(orgTabSwipeCommit(ORG_TAB_SWIPE_COMMIT_PX, 0)).toBe('previous')
  })

  it('commits next from a leftward fling', () => {
    expect(orgTabSwipeCommit(-8, -ORG_TAB_SWIPE_COMMIT_VELOCITY)).toBe('next')
  })

  it('commits previous from a rightward fling', () => {
    expect(orgTabSwipeCommit(8, ORG_TAB_SWIPE_COMMIT_VELOCITY)).toBe('previous')
  })

  it('ignores short slow pans', () => {
    expect(orgTabSwipeCommit(20, 100)).toBeNull()
    expect(orgTabSwipeCommit(-20, -100)).toBeNull()
  })

  it('prefers translation when distance and opposing velocity both qualify', () => {
    expect(
      orgTabSwipeCommit(
        -ORG_TAB_SWIPE_COMMIT_PX,
        ORG_TAB_SWIPE_COMMIT_VELOCITY,
      ),
    ).toBe('next')
    expect(
      orgTabSwipeCommit(
        ORG_TAB_SWIPE_COMMIT_PX,
        -ORG_TAB_SWIPE_COMMIT_VELOCITY,
      ),
    ).toBe('previous')
  })
})

describe('orgTabPagerTranslateX', () => {
  it('offsets each page by the viewport width', () => {
    expect(orgTabPagerTranslateX(0, 390)).toBe(0)
    expect(orgTabPagerTranslateX(1, 390)).toBe(-390)
    expect(orgTabPagerTranslateX(2, 390)).toBe(-780)
  })
})

describe('clampOrgTabPagerTranslateX', () => {
  it('clamps to the first and last page', () => {
    expect(clampOrgTabPagerTranslateX(40, 390, 3)).toBe(0)
    expect(clampOrgTabPagerTranslateX(-200, 390, 3)).toBe(-200)
    expect(clampOrgTabPagerTranslateX(-900, 390, 3)).toBe(-780)
  })

  it('returns 0 when width or tab count cannot page', () => {
    expect(clampOrgTabPagerTranslateX(-100, 0, 3)).toBe(0)
    expect(clampOrgTabPagerTranslateX(-100, 390, 1)).toBe(0)
  })
})

describe('orgTabPagerIndexAfterGesture', () => {
  it('commits next and previous from the current index', () => {
    expect(
      orgTabPagerIndexAfterGesture(0, -ORG_TAB_SWIPE_COMMIT_PX, 0, 3),
    ).toBe(1)
    expect(
      orgTabPagerIndexAfterGesture(2, ORG_TAB_SWIPE_COMMIT_PX, 0, 3),
    ).toBe(1)
  })

  it('does not wrap past Overview or Servers', () => {
    expect(
      orgTabPagerIndexAfterGesture(0, ORG_TAB_SWIPE_COMMIT_PX, 0, 3),
    ).toBe(0)
    expect(
      orgTabPagerIndexAfterGesture(2, -ORG_TAB_SWIPE_COMMIT_PX, 0, 3),
    ).toBe(2)
  })

  it('stays on the current tab for a short pan', () => {
    expect(orgTabPagerIndexAfterGesture(1, -20, 100, 3)).toBe(1)
  })
})
