import { LinearGradient } from 'expo-linear-gradient'
import { StyleSheet, Text, View } from 'react-native'
import { useAuth } from '@/lib/auth-context'
import {
  HA_PRODUCT_NAME,
  HA_WORDMARK_SHORT,
  HA_WORDMARK_TEXT,
  showsHighAvailabilityWordmark,
} from '@/lib/platform-copy'
import { colors } from '@/lib/theme'

/** HA blue fading to its light tint: the pill's 1px border. */
const BORDER_GRADIENT = [colors.blue, colors.command] as const

/**
 * "HIGH AVAILABILITY" beside the T mark on the hosted (Workers) control
 * plane — one line of tiny letter-spaced caps in a slim pill with a 1px
 * HA-blue gradient border. `compact` is the narrow-header form: the same
 * pill reading "HA". Renders nothing until the runtime is known
 * (`controlPlaneRuntime` is hydrated from storage before `/status` answers),
 * and nothing at all on self-hosted.
 *
 * The border is an outer gradient with 1px padding around an inner
 * blue-tinted fill, so it reads the same on every surface it sits on.
 */
export function HighAvailabilityWordmark({
  compact = false,
}: Readonly<{ compact?: boolean }>) {
  const { controlPlaneRuntime } = useAuth()
  if (!showsHighAvailabilityWordmark(controlPlaneRuntime)) return null

  return (
    <LinearGradient
      colors={BORDER_GRADIENT}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.border}
      accessible
      accessibilityRole="text"
      accessibilityLabel={HA_PRODUCT_NAME}
    >
      <View style={[styles.fill, compact && styles.fillCompact]}>
        <Text
          style={[styles.text, compact && styles.textCompact]}
          numberOfLines={1}
          importantForAccessibility="no"
        >
          {compact ? HA_WORDMARK_SHORT : HA_WORDMARK_TEXT}
        </Text>
      </View>
    </LinearGradient>
  )
}

const styles = StyleSheet.create({
  border: {
    padding: 1,
    borderRadius: 999,
    flexShrink: 1,
    minWidth: 0,
    alignSelf: 'center',
  },
  fill: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: colors.bgActiveBlue,
  },
  fillCompact: {
    paddingHorizontal: 6,
  },
  text: {
    color: colors.textTitle,
    fontSize: 9,
    lineHeight: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  textCompact: {
    letterSpacing: 1,
  },
})
