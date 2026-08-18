import { StyleSheet, Text, View } from 'react-native'
import { headerMenuGroupStyles } from '@/components/header-menu-group-styles'
import { colors, spacing } from '@/lib/theme'

/**
 * Shared empty notifications chrome (no API yet).
 * Used by the web header bell menu and the native account sheet.
 */
export function NotificationsPanelBody() {
  return (
    <View style={styles.body}>
      <Text style={headerMenuGroupStyles.menuHeading}>Notifications</Text>
      <View style={styles.empty}>
        <Text style={styles.emptyTitle}>No notifications yet</Text>
        <Text style={styles.emptyCopy}>
          Alerts and updates for this account will show up here.
        </Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  body: {
    gap: 2,
  },
  empty: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.md,
    gap: 4,
  },
  emptyTitle: {
    color: colors.textBody,
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 20,
  },
  emptyCopy: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
  },
})
