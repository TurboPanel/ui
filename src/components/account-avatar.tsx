import { StyleSheet, View } from 'react-native'
import { UserIcon } from '@/components/icons/nav-icons'
import { chrome, colors } from '@/lib/theme'

export const ACCOUNT_AVATAR_SIZE = 28

type AccountAvatarProps = Readonly<{
  /** Show the unread dot when greater than zero. */
  unreadCount?: number
  size?: number
}>

/**
 * Circular account glyph for the native header profile control.
 * Badge appears only when there is at least one unread notification.
 */
export function AccountAvatar({
  unreadCount = 0,
  size = ACCOUNT_AVATAR_SIZE,
}: AccountAvatarProps) {
  const hasUnread = unreadCount > 0
  const iconSize = Math.round(size * 0.55)

  return (
    <View style={[styles.wrap, { width: size, height: size }]}>
      <View
        style={[
          styles.circle,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
          },
        ]}
      >
        <UserIcon size={iconSize} color={colors.textDim} />
      </View>
      {hasUnread ? (
        <View
          style={styles.badge}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        />
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    position: 'relative',
    flexShrink: 0,
  },
  circle: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bgSecondary,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderChip,
  },
  badge: {
    position: 'absolute',
    top: -1,
    right: -1,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: chrome.accent,
    borderWidth: 2,
    borderColor: colors.bgPanel,
  },
})
