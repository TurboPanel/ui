import { StyleSheet, Text, View } from 'react-native'
import Svg, { Path } from 'react-native-svg'
import { chrome, colors, spacing } from '@/lib/theme'
import { TURBOPANEL_WORKSPACE_BADGE_LABEL } from '@/lib/system-inventory'

export function PlatformShieldIcon({
  size = 12,
  color = chrome.accent,
}: Readonly<{ size?: number; color?: string }>) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 2L4 5v6c0 5.25 3.4 10.15 8 11.35C16.6 21.15 20 16.25 20 11V5l-8-3z"
        stroke={color}
        strokeWidth={1.75}
        strokeLinejoin="round"
      />
      <Path
        d="M12 8.5v4M10 10.5h4"
        stroke={color}
        strokeWidth={1.75}
        strokeLinecap="round"
      />
    </Svg>
  )
}

/** SVG shield/gear + text label — never emoji. Driven by kind, not displayName. */
export function PlatformBadge({
  label = TURBOPANEL_WORKSPACE_BADGE_LABEL,
}: Readonly<{ label?: string }>) {
  return (
    <View style={styles.badge} accessibilityRole="text">
      <PlatformShieldIcon />
      <Text style={styles.badgeText}>{label}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: chrome.accent,
    backgroundColor: colors.bgActive,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  badgeText: {
    color: chrome.accent,
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
})
