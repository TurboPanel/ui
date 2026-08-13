import { useEffect } from 'react'
import { StyleSheet, View, type ViewStyle } from 'react-native'
import Animated, {
  Easing,
  cancelAnimation,
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated'
import type { ServerConnectionStatus } from '@/lib/server-connection-status'
import { colors } from '@/lib/theme'

const PULSE_MS = 700

export function ConnectionStatusDot({
  status,
  size = 6,
}: Readonly<{
  status: ServerConnectionStatus
  size?: number
}>) {
  const reduceMotion = useReducedMotion()
  const shouldPulse = status === 'initializing' && reduceMotion !== true
  const progress = useSharedValue(1)

  useEffect(() => {
    if (!shouldPulse) {
      cancelAnimation(progress)
      progress.value = 1
      return
    }
    progress.value = 0.35
    progress.value = withRepeat(
      withTiming(1, { duration: PULSE_MS, easing: Easing.inOut(Easing.sin) }),
      -1,
      true,
    )
    return () => {
      cancelAnimation(progress)
    }
  }, [progress, shouldPulse])

  const coreStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
  }))
  const haloStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0.35, 1], [0.5, 0]),
    transform: [
      { scale: interpolate(progress.value, [0.35, 1], [1, 2.15]) },
    ],
  }))

  const radius = size / 2
  const box: ViewStyle = { width: size, height: size, borderRadius: radius }
  const fill = statusDotFill(status)

  return (
    <View style={[styles.wrap, box]} accessibilityElementsHidden>
      {shouldPulse ? (
        <Animated.View
          pointerEvents="none"
          style={[styles.halo, box, fill, haloStyle]}
        />
      ) : null}
      <Animated.View style={[box, fill, coreStyle]} />
    </View>
  )
}

function statusDotFill(status: ServerConnectionStatus): ViewStyle {
  switch (status) {
    case 'online':
      return styles.online
    case 'initializing':
      return styles.initializing
    case 'offline':
      return styles.offline
  }
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
  },
  halo: {
    position: 'absolute',
  },
  online: {
    backgroundColor: colors.accent,
  },
  initializing: {
    backgroundColor: colors.pending,
  },
  offline: {
    backgroundColor: colors.textFaint,
    borderWidth: 1,
    borderColor: colors.borderChip,
  },
})
