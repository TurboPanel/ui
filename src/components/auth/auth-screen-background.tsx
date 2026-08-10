import { memo, useEffect, useMemo } from 'react'
import { Platform, StyleSheet, View, useWindowDimensions } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated'
import { scheduleOnRN } from 'react-native-worklets'
import { AuthGridLayer } from '@/components/auth/auth-grid-layer'
import { hexWithAlpha } from '@/components/auth/auth-hex'
import { colors } from '@/lib/theme'

export const GRID_SIZE = 36
const STREAK_THICKNESS = 2
const TIP_SIZE = 4

/** Pick a random grid line, optionally avoiding the previous one. */
function randomGridTrack(span: number, avoid?: number): number {
  const maxIndex = Math.max(1, Math.floor((span - GRID_SIZE) / GRID_SIZE))
  const minIndex = 1
  const lastIndex = Math.max(minIndex, maxIndex - 1)
  const count = lastIndex - minIndex + 1
  let index =
    minIndex + Math.floor(Math.random() * count) // NOSONAR typescript:S2245 — decorative grid line only
  let track = index * GRID_SIZE
  if (avoid !== undefined && track === avoid && count > 1) {
    index = index >= lastIndex ? minIndex : index + 1
    track = index * GRID_SIZE
  }
  return track
}

type StreakDirection = 'ltr' | 'rtl' | 'ttb' | 'btt'

type StreakConfig = Readonly<{
  id: string
  lengthFactor: number
  maxLength: number
  durationMs: number
  delayMs: number
  peakAlpha: number
  direction: StreakDirection
}>

/** Exactly two horizontal + two vertical; each lap picks a random grid line. */
const STREAKS: readonly StreakConfig[] = [
  {
    id: 'h-ltr',
    lengthFactor: 0.55,
    maxLength: 360,
    durationMs: 7200,
    delayMs: 0,
    peakAlpha: 0.065,
    direction: 'ltr',
  },
  {
    id: 'h-rtl',
    lengthFactor: 0.5,
    maxLength: 340,
    durationMs: 8600,
    delayMs: 1600,
    peakAlpha: 0.038,
    direction: 'rtl',
  },
  {
    id: 'v-ttb',
    lengthFactor: 0.45,
    maxLength: 320,
    durationMs: 7800,
    delayMs: 900,
    peakAlpha: 0.052,
    direction: 'ttb',
  },
  {
    id: 'v-btt',
    lengthFactor: 0.48,
    maxLength: 300,
    durationMs: 9400,
    delayMs: 2400,
    peakAlpha: 0.028,
    direction: 'btt',
  },
]

function isHorizontal(direction: StreakDirection): boolean {
  return direction === 'ltr' || direction === 'rtl'
}

function tipLeadsForward(direction: StreakDirection): boolean {
  return direction === 'ltr' || direction === 'ttb'
}

type AuthGridStreakProps = Readonly<{
  screenWidth: number
  screenHeight: number
  streakLength: number
  durationMs: number
  delayMs: number
  peakAlpha: number
  direction: StreakDirection
  accentColor: string
}>

/**
 * One gradient + one tip view. Track lives in a shared value so lap
 * re-rolls never re-render React.
 */
const AuthGridStreak = memo(function AuthGridStreak({
  screenWidth,
  screenHeight,
  streakLength,
  durationMs,
  delayMs,
  peakAlpha,
  direction,
  accentColor,
}: AuthGridStreakProps) {
  const progress = useSharedValue(0)
  const track = useSharedValue(0)
  const horizontal = isHorizontal(direction)
  const tipForward = tipLeadsForward(direction)
  const span = horizontal ? screenWidth : screenHeight
  const trackSpan = horizontal ? screenHeight : screenWidth
  const travel = span + streakLength

  const palette = useMemo(() => {
    const hot = hexWithAlpha(colors.text, Math.min(0.18, peakAlpha + 0.06))
    const bright = hexWithAlpha(colors.text, peakAlpha * 0.55)
    const mid = hexWithAlpha(accentColor, peakAlpha * 0.35)
    const soft = hexWithAlpha(accentColor, peakAlpha * 0.08)
    const colorsAlong = (
      tipForward
        ? ['transparent', soft, mid, bright, hot]
        : [hot, bright, mid, soft, 'transparent']
    ) as [string, string, string, string, string]
    const locations = (
      tipForward ? [0, 0.35, 0.68, 0.9, 1] : [0, 0.1, 0.32, 0.65, 1]
    ) as [number, number, number, number, number]
    return {
      colorsAlong,
      locations,
      tip: hexWithAlpha(colors.text, Math.min(0.22, peakAlpha + 0.08)),
      tipGlow: hexWithAlpha(accentColor, Math.min(0.08, peakAlpha * 0.9)),
    }
  }, [accentColor, peakAlpha, tipForward])

  useEffect(() => {
    let active = true
    track.value = randomGridTrack(trackSpan)

    const runLap = (nextDelayMs: number) => {
      if (!active) return
      const prev = track.value
      track.value = randomGridTrack(trackSpan, prev)
      progress.value = 0
      progress.value = withDelay(
        nextDelayMs,
        withTiming(
          1,
          { duration: durationMs, easing: Easing.linear },
          (finished) => {
            if (finished) {
              scheduleOnRN(runLap, 0)
            }
          },
        ),
      )
    }

    runLap(delayMs)

    return () => {
      active = false
      cancelAnimation(progress)
    }
  }, [delayMs, durationMs, progress, track, trackSpan])

  const style = useAnimatedStyle(() => {
    const along = progress.value * travel
    const t = track.value
    if (direction === 'ltr') {
      return {
        top: t,
        left: 0,
        transform: [{ translateX: along - streakLength }],
      }
    }
    if (direction === 'rtl') {
      return {
        top: t,
        left: 0,
        transform: [{ translateX: screenWidth - along }],
      }
    }
    if (direction === 'ttb') {
      return {
        left: t,
        top: 0,
        transform: [{ translateY: along - streakLength }],
      }
    }
    return {
      left: t,
      top: 0,
      transform: [{ translateY: screenHeight - along }],
    }
  })

  const box = horizontal
    ? { width: streakLength, height: STREAK_THICKNESS }
    : { width: STREAK_THICKNESS, height: streakLength }

  const tipPad = (STREAK_THICKNESS - TIP_SIZE) / 2
  const tipHang = -TIP_SIZE / 2
  let tipStyle: {
    top?: number
    right?: number
    bottom?: number
    left?: number
  }
  if (horizontal) {
    tipStyle = tipForward
      ? { right: tipHang, top: tipPad }
      : { left: tipHang, top: tipPad }
  } else if (tipForward) {
    tipStyle = { bottom: tipHang, left: tipPad }
  } else {
    tipStyle = { top: tipHang, left: tipPad }
  }

  return (
    <Animated.View style={[styles.streak, box, style]}>
      <LinearGradient
        colors={palette.colorsAlong}
        locations={palette.locations}
        start={horizontal ? { x: 0, y: 0.5 } : { x: 0.5, y: 0 }}
        end={horizontal ? { x: 1, y: 0.5 } : { x: 0.5, y: 1 }}
        style={styles.streakFill}
      />
      <View
        style={[
          styles.tip,
          tipStyle,
          {
            backgroundColor: palette.tip,
            shadowColor: accentColor,
            ...(Platform.OS === 'web'
              ? ({ boxShadow: `0 0 2px 0 ${palette.tipGlow}` } as object)
              : { shadowOpacity: 0.2, shadowRadius: 2 }),
          },
        ]}
      />
    </Animated.View>
  )
})

/**
 * Auth backdrop: GPU-friendly static layer + optional Reanimated streaks.
 * Decorative only — sits behind the form panel.
 */
export function AuthScreenBackground({
  accentColor,
  animate = true,
}: Readonly<{
  accentColor: string
  /** When false, render wash + grid only (no streak motion). */
  animate?: boolean
}>) {
  const reduceMotion = useReducedMotion()
  const { width, height } = useWindowDimensions()
  const ready = width > 0 && height > 0
  const showStreaks = animate && ready && !reduceMotion

  return (
    <View
      pointerEvents="none"
      style={styles.root}
      {...(Platform.OS === 'web'
        ? ({ 'aria-hidden': true } as const)
        : {
            accessibilityElementsHidden: true,
            importantForAccessibility: 'no-hide-descendants' as const,
          })}
    >
      <AuthGridLayer accentColor={accentColor} />

      {showStreaks
        ? STREAKS.map((streak) => {
            const horizontal = isHorizontal(streak.direction)
            const lengthSpan = horizontal ? width : height
            return (
              <AuthGridStreak
                key={streak.id}
                screenWidth={width}
                screenHeight={height}
                streakLength={Math.min(
                  streak.maxLength,
                  lengthSpan * streak.lengthFactor,
                )}
                durationMs={streak.durationMs}
                delayMs={streak.delayMs}
                peakAlpha={streak.peakAlpha}
                direction={streak.direction}
                accentColor={accentColor}
              />
            )
          })
        : null}
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: colors.bg,
    overflow: 'hidden',
  },
  streak: {
    position: 'absolute',
    opacity: 0.62,
  },
  streakFill: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
  tip: {
    position: 'absolute',
    width: TIP_SIZE,
    height: TIP_SIZE,
    borderRadius: TIP_SIZE / 2,
    shadowOffset: { width: 0, height: 0 },
  },
})
