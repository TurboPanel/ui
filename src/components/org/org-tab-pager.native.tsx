import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { StyleSheet, View, useWindowDimensions } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'
import { usePathname, useRouter, type Href } from 'expo-router'
import { scheduleOnRN } from 'react-native-worklets'
import { OverviewSection } from '@/components/org/overview-section'
import { OrgScreenScroll } from '@/components/org/org-screen-scroll'
import { ProjectsOverviewSection } from '@/components/org/projects-overview-section'
import { ServersOverviewSection } from '@/components/org/servers-overview-section'
import {
  ORG_TAB_AREA_IDS,
  orgTabHref,
  orgTabIndexFromPathname,
} from '@/lib/org-navigation'
import {
  ORG_TAB_PAGER_ANIM_MS,
  ORG_TAB_SWIPE_FAIL_Y_PX,
  clampOrgTabPagerTranslateX,
  orgTabPagerIndexAfterGesture,
  orgTabPagerTranslateX,
  orgTabSwipeActiveOffsetX,
} from '@/lib/org-tab-swipe'
import { PullToRefreshProvider } from '@/lib/pull-to-refresh'
import { ALL_WORKSPACES_SCOPE } from '@/lib/workspace-scope'
import { useWorkspaceScope } from '@/lib/workspace-scope-context'
import { colors } from '@/lib/theme'

const TAB_COUNT = ORG_TAB_AREA_IDS.length

const pagerTiming = {
  duration: ORG_TAB_PAGER_ANIM_MS,
  easing: Easing.out(Easing.cubic),
} as const

/**
 * Finger-following pager for native tab overviews (Overview · Projects · Servers).
 *
 * Nested routes (server detail, project, datacenters, …) unmount this and
 * leave the org stack in charge so vertical scroll, pull-to-refresh, and
 * back stay intact.
 */
export function OrgTabPager({ orgId }: Readonly<{ orgId: string }>) {
  const pathname = usePathname()
  const router = useRouter()
  const { scopeId } = useWorkspaceScope()
  const { width: windowWidth } = useWindowDimensions()
  const reduceMotion = useReducedMotion() === true
  const [width, setWidth] = useState(windowWidth)
  const activeIndex = Math.max(0, orgTabIndexFromPathname(pathname, orgId))
  const translateX = useSharedValue(0)
  const dragStartX = useSharedValue(0)
  const laidOut = useRef(false)
  const lastWidth = useRef(0)

  const canGoPrevious = activeIndex > 0
  const canGoNext = activeIndex < TAB_COUNT - 1

  const snapToIndex = useCallback(
    (index: number, widthPx: number, animate: boolean) => {
      const target = orgTabPagerTranslateX(index, widthPx)
      if (!animate || reduceMotion) {
        translateX.value = target
        return
      }
      translateX.value = withTiming(target, pagerTiming)
    },
    [reduceMotion, translateX],
  )

  useEffect(() => {
    if (width <= 0) {
      return
    }
    const widthChanged = lastWidth.current !== width
    lastWidth.current = width
    const animate = laidOut.current && !widthChanged
    laidOut.current = true
    snapToIndex(activeIndex, width, animate)
  }, [activeIndex, snapToIndex, width])

  const commitIndex = useCallback(
    (nextIndex: number) => {
      if (nextIndex === activeIndex) {
        return
      }
      const areaId = ORG_TAB_AREA_IDS[nextIndex]
      if (!areaId) {
        return
      }
      router.replace(orgTabHref(orgId, areaId, scopeId) as Href)
    },
    [activeIndex, orgId, router, scopeId],
  )

  const finishSwipe = useCallback(
    (translationX: number, velocityX: number) => {
      if (width <= 0) {
        return
      }
      const nextIndex = orgTabPagerIndexAfterGesture(
        activeIndex,
        translationX,
        velocityX,
        TAB_COUNT,
      )
      snapToIndex(nextIndex, width, true)
      commitIndex(nextIndex)
    },
    [activeIndex, commitIndex, snapToIndex, width],
  )

  const gesture = useMemo(() => {
    const [activeLeft, activeRight] = orgTabSwipeActiveOffsetX(
      canGoPrevious,
      canGoNext,
    )
    return Gesture.Pan()
      .enabled(width > 0)
      .maxPointers(1)
      .activeOffsetX([activeLeft, activeRight])
      .failOffsetY([-ORG_TAB_SWIPE_FAIL_Y_PX, ORG_TAB_SWIPE_FAIL_Y_PX])
      .cancelsTouchesInView(false)
      .onStart(() => {
        dragStartX.value = translateX.value
      })
      .onUpdate((event) => {
        translateX.value = clampOrgTabPagerTranslateX(
          dragStartX.value + event.translationX,
          width,
          TAB_COUNT,
        )
      })
      .onEnd((event) => {
        scheduleOnRN(finishSwipe, event.translationX, event.velocityX)
      })
  }, [
    canGoNext,
    canGoPrevious,
    dragStartX,
    finishSwipe,
    translateX,
    width,
  ])

  const stripStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }))

  const projectsWorkspaceId =
    scopeId === ALL_WORKSPACES_SCOPE ? undefined : scopeId

  return (
    <View
      style={styles.root}
      onLayout={(event) => {
        const nextWidth = event.nativeEvent.layout.width
        if (nextWidth > 0 && nextWidth !== width) {
          setWidth(nextWidth)
        }
      }}
    >
      <GestureDetector gesture={gesture}>
        <Animated.View
          collapsable={false}
          style={[
            styles.strip,
            width > 0 ? { width: width * TAB_COUNT } : null,
            stripStyle,
          ]}
        >
          <PagerPage width={width}>
            <OverviewSection orgId={orgId} />
          </PagerPage>
          <PagerPage width={width}>
            <ProjectsOverviewSection
              orgId={orgId}
              workspaceId={projectsWorkspaceId}
            />
          </PagerPage>
          <PagerPage width={width}>
            <ServersOverviewSection orgId={orgId} />
          </PagerPage>
        </Animated.View>
      </GestureDetector>
    </View>
  )
}

function PagerPage({
  width,
  children,
}: Readonly<{
  width: number
  children: ReactNode
}>) {
  return (
    <View style={[styles.page, width > 0 ? { width } : null]}>
      <PullToRefreshProvider>
        <OrgScreenScroll>{children}</OrgScreenScroll>
      </PullToRefreshProvider>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    overflow: 'hidden',
    backgroundColor: colors.bg,
  },
  strip: {
    flex: 1,
    flexDirection: 'row',
  },
  page: {
    flexGrow: 0,
    flexShrink: 0,
  },
})
