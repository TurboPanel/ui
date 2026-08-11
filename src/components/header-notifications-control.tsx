import { Pressable, StyleSheet, View } from 'react-native'
import { headerMenuGroupStyles } from '@/components/header-menu-group-styles'
import { NotificationsBellIcon } from '@/components/icons/nav-icons'
import { webPointer } from '@/components/org/org-panel-styles'
import { glass } from '@/lib/glass'
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
      <Pressable
        style={({ pressed }) => [
          styles.trigger,
          pressed && headerMenuGroupStyles.triggerPressed,
          webPointer,
        ]}
        onPress={() => {
          // Future: open notifications panel.
        }}
        accessibilityRole="button"
        accessibilityLabel="Notifications"
      >
        <NotificationsBellIcon size={16} color={colors.textDim} />
      </Pressable>
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
  trigger: {
    width: 40,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: glass.border,
    backgroundColor: glass.fillSoft,
  },
})
