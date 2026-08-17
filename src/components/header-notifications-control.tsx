import { StyleSheet, View } from 'react-native'
import { HeaderMenuTrigger } from '@/components/header-menu-trigger'
import { NotificationsBellIcon } from '@/components/icons/nav-icons'
import { colors } from '@/lib/theme'

/**
 * Header notifications affordance — vertical rule + bell to the right of
 * the account menu. Notification content is not wired yet.
 */
export function HeaderNotificationsSegment() {
  return (
    <View style={styles.wrap}>
      <View
        style={styles.separator}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      />
      <HeaderMenuTrigger
        icon
        onPress={() => {
          // Future: open notifications panel.
        }}
        accessibilityRole="button"
        accessibilityLabel="Notifications"
      >
        <NotificationsBellIcon size={16} color={colors.textDim} />
      </HeaderMenuTrigger>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 0,
    gap: 10,
  },
  separator: {
    width: 1,
    height: 40,
    backgroundColor: colors.borderChip,
  },
})
