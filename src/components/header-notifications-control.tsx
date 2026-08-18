import { useEffect, useRef, useState } from 'react'
import { StyleSheet, View, useWindowDimensions } from 'react-native'
import { GlassSurface } from '@/components/glass/glass-surface'
import {
  HEADER_MENU_WIDTH,
  headerMenuGroupStyles,
} from '@/components/header-menu-group-styles'
import { HeaderMenuOverlay } from '@/components/header-menu-overlay'
import { HeaderMenuTrigger } from '@/components/header-menu-trigger'
import { NotificationsBellIcon } from '@/components/icons/nav-icons'
import { NotificationsPanelBody } from '@/components/notifications-panel-body'
import { useUnreadNotificationCount } from '@/lib/notifications'
import { chrome, colors, layout } from '@/lib/theme'

/**
 * Web header notifications affordance — vertical rule + bell to the right of
 * the account menu. Native folds notifications into the profile avatar instead.
 */
export function HeaderNotificationsSegment() {
  const { width } = useWindowDimensions()
  const isCompact = width < layout.desktopBreakpoint
  const [open, setOpen] = useState(false)
  const buttonRef = useRef<View>(null)
  const [menuPosition, setMenuPosition] = useState({ top: 56, left: 16 })
  const unreadCount = useUnreadNotificationCount()
  const hasUnread = unreadCount > 0

  useEffect(() => {
    if (!open || isCompact) {
      return
    }
    buttonRef.current?.measureInWindow((x, y, w, h) => {
      setMenuPosition({
        top: y + h + 6,
        left: Math.max(12, x + w - HEADER_MENU_WIDTH),
      })
    })
  }, [open, isCompact])

  const close = () => setOpen(false)

  const a11yLabel = hasUnread
    ? `Notifications, ${unreadCount} unread`
    : 'Notifications'

  return (
    <>
      <View style={styles.wrap}>
        <View
          style={styles.separator}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        />
        <View ref={buttonRef} collapsable={false}>
          <HeaderMenuTrigger
            icon
            open={open}
            onPress={() => setOpen((current) => !current)}
            accessibilityRole="button"
            accessibilityLabel={a11yLabel}
            accessibilityState={{ expanded: open }}
          >
            <View style={styles.bellWrap}>
              <NotificationsBellIcon size={16} color={colors.textDim} />
              {hasUnread ? (
                <View
                  style={styles.badge}
                  accessibilityElementsHidden
                  importantForAccessibility="no-hide-descendants"
                />
              ) : null}
            </View>
          </HeaderMenuTrigger>
        </View>
      </View>

      <HeaderMenuOverlay
        open={open}
        onClose={close}
        closeAccessibilityLabel="Close notifications"
        presentation={isCompact ? 'fromRight' : 'dropdown'}
        dropdownPosition={menuPosition}
      >
        <GlassSurface
          style={[headerMenuGroupStyles.menu, isCompact && styles.rightPanel]}
          intensity="strong"
        >
          <NotificationsPanelBody />
        </GlassSurface>
      </HeaderMenuOverlay>
    </>
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
  rightPanel: {
    flex: 1,
    maxHeight: '100%',
    borderTopRightRadius: 0,
    borderBottomRightRadius: 0,
  },
  bellWrap: {
    position: 'relative',
    width: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: chrome.accent,
    borderWidth: 1.5,
    borderColor: colors.bgPanel,
  },
})
