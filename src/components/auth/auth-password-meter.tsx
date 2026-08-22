import { useEffect, useRef, useState } from 'react'
import {
  AccessibilityInfo,
  Animated,
  Easing,
  StyleSheet,
  View,
} from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { hexWithAlpha } from '@/components/auth/auth-hex'
import { colors, spacing } from '@/lib/theme'

/**
 * Single-indicator password feedback.
 *
 * Deliberately *not* a requirements checklist: sign-up is the first thing a
 * customer sees, so the meter shows one hairline track, one badge, and at most
 * one short nudge at a time. When the password clears the structural policy and
 * the HIBP check, the badge draws a check and the track sweeps once — the only
 * moment the component draws attention to itself.
 */
export type PasswordMeterStatus =
  /** Structural rules not satisfied yet. */
  | 'incomplete'
  /** Structurally valid, HIBP breach lookup in flight. */
  | 'checking'
  /** Structurally valid and not breached. */
  | 'valid'
  /** Found in a known breach corpus. */
  | 'compromised'

type AuthPasswordMeterProps = Readonly<{
  status: PasswordMeterStatus
  /** 0–1 fill for the hairline track. */
  progress: number
  /** At most one short nudge; empty renders no text row. */
  hint: string
  accentColor: string
}>

const BADGE_SIZE = 18
const STROKE = 2
const TRACK_HEIGHT = 2
const SWEEP_WIDTH = 72

/**
 * Checkmark as two rotated bars rather than an SVG path: each bar lives in a
 * fixed-size wrapper so the (center-origin) rotation stays put while the inner
 * bar grows from its left edge. Avoids animating SVG props and `transformOrigin`,
 * neither of which behaves identically across native and RN Web.
 */
const CHECK_ARMS = [
  { left: 3.03, top: 9.75, length: 4.95, rotate: '45deg' },
  { left: 5.8, top: 8, length: 9.9, rotate: '-45deg' },
] as const

function useReduceMotion(): boolean {
  const [reduce, setReduce] = useState(false)
  useEffect(() => {
    let active = true
    AccessibilityInfo.isReduceMotionEnabled()
      .then((value) => {
        if (active) setReduce(value)
      })
      .catch(() => {
        // Unsupported platform — keep motion on.
      })
    const sub = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      setReduce,
    )
    return () => {
      active = false
      sub.remove()
    }
  }, [])
  return reduce
}

/** Crossfades `hint` so the nudge swaps instead of popping between words. */
function useCrossfadedHint(hint: string, reduceMotion: boolean) {
  const [shown, setShown] = useState(hint)
  const [fade] = useState(() => new Animated.Value(1))
  const pending = useRef(hint)

  useEffect(() => {
    pending.current = hint
    if (hint === shown) return
    if (reduceMotion) {
      setShown(hint)
      fade.setValue(1)
      return
    }
    Animated.timing(fade, {
      toValue: 0,
      duration: 110,
      easing: Easing.in(Easing.quad),
      useNativeDriver: false,
    }).start(({ finished }) => {
      if (!finished) return
      setShown(pending.current)
      Animated.timing(fade, {
        toValue: 1,
        duration: 170,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }).start()
    })
  }, [fade, hint, reduceMotion, shown])

  return { shown, fade }
}

export function AuthPasswordMeter({
  status,
  progress,
  hint,
  accentColor,
}: AuthPasswordMeterProps) {
  const reduceMotion = useReduceMotion()
  const [enter] = useState(() => new Animated.Value(0))
  const [fill] = useState(() => new Animated.Value(0))
  const [settle] = useState(() => new Animated.Value(0))
  const [armA] = useState(() => new Animated.Value(0))
  const [armB] = useState(() => new Animated.Value(0))
  const [spin] = useState(() => new Animated.Value(0))
  const [sweep] = useState(() => new Animated.Value(0))
  const [trackWidth, setTrackWidth] = useState(0)
  const { shown: shownHint, fade: hintFade } = useCrossfadedHint(
    hint,
    reduceMotion,
  )

  const isValid = status === 'valid'
  const isWarning = status === 'compromised'
  const target = status === 'incomplete' ? Math.min(1, Math.max(0, progress)) : 1

  useEffect(() => {
    Animated.timing(enter, {
      toValue: 1,
      duration: reduceMotion ? 0 : 240,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start()
  }, [enter, reduceMotion])

  useEffect(() => {
    Animated.timing(fill, {
      toValue: target,
      duration: reduceMotion ? 0 : 340,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start()
  }, [fill, reduceMotion, target])

  useEffect(() => {
    Animated.timing(settle, {
      toValue: isValid ? 1 : 0,
      duration: reduceMotion ? 0 : 420,
      easing: Easing.inOut(Easing.quad),
      useNativeDriver: false,
    }).start()
  }, [isValid, reduceMotion, settle])

  useEffect(() => {
    if (!isValid) {
      armA.setValue(0)
      armB.setValue(0)
      return
    }
    if (reduceMotion) {
      armA.setValue(1)
      armB.setValue(1)
      return
    }
    const draw = Animated.sequence([
      Animated.timing(armA, {
        toValue: 1,
        duration: 120,
        easing: Easing.out(Easing.quad),
        useNativeDriver: false,
      }),
      Animated.timing(armB, {
        toValue: 1,
        duration: 190,
        easing: Easing.out(Easing.quad),
        useNativeDriver: false,
      }),
    ])
    draw.start()
    return () => draw.stop()
  }, [armA, armB, isValid, reduceMotion])

  useEffect(() => {
    if (status !== 'checking' || reduceMotion) {
      spin.setValue(0)
      return
    }
    const loop = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: 850,
        easing: Easing.linear,
        useNativeDriver: false,
      }),
    )
    loop.start()
    return () => loop.stop()
  }, [reduceMotion, spin, status])

  useEffect(() => {
    if (!isValid || reduceMotion || trackWidth === 0) return
    sweep.setValue(0)
    const shine = Animated.timing(sweep, {
      toValue: 1,
      duration: 900,
      delay: 120,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    })
    shine.start()
    return () => shine.stop()
  }, [isValid, reduceMotion, sweep, trackWidth])

  const stateColor = isWarning ? colors.pending : accentColor
  const fillColor = fill.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [colors.borderChip, hexWithAlpha(stateColor, 0.65), stateColor],
  })
  const ringColor = settle.interpolate({
    inputRange: [0, 1],
    outputRange: [isWarning ? colors.pending : colors.borderChip, stateColor],
  })
  const ringFill = settle.interpolate({
    inputRange: [0, 1],
    outputRange: ['#00000000', hexWithAlpha(stateColor, 0.14)],
  })

  return (
    <Animated.View
      style={[
        styles.root,
        {
          opacity: enter,
          transform: [
            {
              translateY: enter.interpolate({
                inputRange: [0, 1],
                outputRange: [-4, 0],
              }),
            },
          ],
        },
      ]}
      accessibilityLiveRegion="polite"
    >
      <View
        style={styles.track}
        onLayout={(event) => setTrackWidth(event.nativeEvent.layout.width)}
      >
        <Animated.View
          style={[
            styles.trackFill,
            {
              backgroundColor: fillColor,
              width: fill.interpolate({
                inputRange: [0, 1],
                outputRange: ['0%', '100%'],
              }),
            },
          ]}
        />
        {isValid && trackWidth > 0 ? (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.sweep,
              {
                transform: [
                  {
                    translateX: sweep.interpolate({
                      inputRange: [0, 1],
                      outputRange: [-SWEEP_WIDTH, trackWidth],
                    }),
                  },
                ],
              },
            ]}
          >
            <LinearGradient
              colors={[
                '#00000000',
                hexWithAlpha('#ffffff', 0.55),
                '#00000000',
              ]}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={StyleSheet.absoluteFill}
            />
          </Animated.View>
        ) : null}
      </View>

      <View style={styles.row}>
        <Animated.View
          style={[
            styles.badge,
            {
              borderColor: ringColor,
              backgroundColor: ringFill,
              transform: [
                {
                  scale: settle.interpolate({
                    inputRange: [0, 0.45, 1],
                    outputRange: [1, 1.16, 1],
                  }),
                },
              ],
            },
          ]}
        >
          {status === 'checking' ? (
            <Animated.View
              style={[
                styles.spinner,
                {
                  borderTopColor: accentColor,
                  transform: [
                    {
                      rotate: spin.interpolate({
                        inputRange: [0, 1],
                        outputRange: ['0deg', '360deg'],
                      }),
                    },
                  ],
                },
              ]}
            />
          ) : null}
          {isWarning ? <View style={styles.warnDot} /> : null}
          <View pointerEvents="none" style={styles.checkLayer}>
            {CHECK_ARMS.map((arm, index) => (
              <View
                key={arm.rotate}
                style={[
                  styles.armWrapper,
                  {
                    left: arm.left,
                    top: arm.top,
                    width: arm.length,
                    transform: [{ rotate: arm.rotate }],
                  },
                ]}
              >
                <Animated.View
                  style={[
                    styles.arm,
                    {
                      backgroundColor: accentColor,
                      width: (index === 0 ? armA : armB).interpolate({
                        inputRange: [0, 1],
                        outputRange: [0, arm.length],
                      }),
                    },
                  ]}
                />
              </View>
            ))}
          </View>
        </Animated.View>

        {shownHint ? (
          <Animated.Text
            style={[
              styles.hint,
              isValid ? { color: accentColor } : null,
              isWarning ? { color: colors.pending } : null,
              {
                opacity: hintFade,
                transform: [
                  {
                    translateY: hintFade.interpolate({
                      inputRange: [0, 1],
                      outputRange: [3, 0],
                    }),
                  },
                ],
              },
            ]}
          >
            {shownHint}
          </Animated.Text>
        ) : null}
      </View>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  root: {
    /** Panel body already gaps 16 — pull the meter up so it reads as part of the field. */
    marginTop: -6,
    gap: spacing.sm,
  },
  track: {
    height: TRACK_HEIGHT,
    borderRadius: TRACK_HEIGHT,
    backgroundColor: colors.borderSubtle,
    overflow: 'hidden',
  },
  trackFill: {
    height: '100%',
    borderRadius: TRACK_HEIGHT,
  },
  sweep: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    width: SWEEP_WIDTH,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: BADGE_SIZE,
  },
  badge: {
    width: BADGE_SIZE,
    height: BADGE_SIZE,
    borderRadius: BADGE_SIZE / 2,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  spinner: {
    position: 'absolute',
    top: -1.5,
    left: -1.5,
    width: BADGE_SIZE,
    height: BADGE_SIZE,
    borderRadius: BADGE_SIZE / 2,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  warnDot: {
    width: 5.5,
    height: 5.5,
    borderRadius: 3,
    backgroundColor: colors.pending,
  },
  /** Absolute children sit inside the border box — re-anchor to the 18px badge. */
  checkLayer: {
    position: 'absolute',
    top: -1.5,
    left: -1.5,
    width: BADGE_SIZE,
    height: BADGE_SIZE,
  },
  armWrapper: {
    position: 'absolute',
    height: STROKE,
  },
  arm: {
    height: STROKE,
    borderRadius: STROKE / 2,
  },
  hint: {
    fontSize: 12,
    lineHeight: 16,
    color: colors.textMuted,
    flexShrink: 1,
  },
})
