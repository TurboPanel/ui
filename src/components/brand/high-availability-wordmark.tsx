import { StyleSheet, Text, View } from 'react-native'
import { useAuth } from '@/lib/auth-context'
import {
  HA_PRODUCT_NAME,
  HA_WORDMARK_LINES,
  showsHighAvailabilityWordmark,
} from '@/lib/platform-copy'
import { colors } from '@/lib/theme'

/**
 * "HIGH / AVAILABILITY" beside the T mark on the hosted (Workers) control
 * plane — heavy italic caps behind a thin HA-blue rule. `compact` is the
 * narrow-header form: an italic "HA" chip. Renders nothing until the runtime
 * is known (`controlPlaneRuntime` is hydrated from storage before `/status`
 * answers), and nothing at all on self-hosted.
 */
export function HighAvailabilityWordmark({
  compact = false,
}: Readonly<{ compact?: boolean }>) {
  const { controlPlaneRuntime } = useAuth()
  if (!showsHighAvailabilityWordmark(controlPlaneRuntime)) return null

  if (compact) {
    return (
      <View
        style={styles.chip}
        accessible
        accessibilityRole="text"
        accessibilityLabel={HA_PRODUCT_NAME}
      >
        <Text style={styles.chipText} importantForAccessibility="no">
          HA
        </Text>
      </View>
    )
  }

  const [top, bottom] = HA_WORDMARK_LINES
  return (
    <View
      style={styles.lockup}
      accessible
      accessibilityRole="text"
      accessibilityLabel={HA_PRODUCT_NAME}
    >
      <View style={styles.rule} />
      <View>
        <Text style={styles.top} numberOfLines={1} importantForAccessibility="no">
          {top}
        </Text>
        <Text style={styles.bottom} numberOfLines={1} importantForAccessibility="no">
          {bottom}
        </Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  lockup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 1,
  },
  rule: {
    width: 2,
    height: 26,
    borderRadius: 1,
    backgroundColor: colors.blue,
  },
  top: {
    color: colors.text,
    fontSize: 11,
    lineHeight: 13,
    fontStyle: 'italic',
    fontWeight: '800',
    letterSpacing: 3,
  },
  bottom: {
    color: colors.textChip,
    fontSize: 9,
    lineHeight: 12,
    fontStyle: 'italic',
    fontWeight: '800',
    letterSpacing: 1.6,
  },
  chip: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: colors.blue,
    backgroundColor: colors.bgActiveBlue,
  },
  chipText: {
    color: colors.text,
    fontSize: 10,
    lineHeight: 12,
    fontStyle: 'italic',
    fontWeight: '800',
    letterSpacing: 1.2,
  },
})
