import { useEffect, useRef, useState } from 'react'
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native'
import {
  HEADER_MENU_WIDTH,
  headerMenuGroupStyles,
} from '@/components/header-menu-group-styles'
import { webPointer } from '@/components/org/org-panel-styles'
import { colors, layout } from '@/lib/theme'

type UserAccountMenuSegmentProps = Readonly<{
  email: string
  onSignOut: () => void | Promise<void>
}>

export function UserAccountMenuSegment({ email, onSignOut }: UserAccountMenuSegmentProps) {
  const { width } = useWindowDimensions()
  const isCompact = width < layout.desktopBreakpoint
  const [open, setOpen] = useState(false)
  const buttonRef = useRef<View>(null)
  const [menuPosition, setMenuPosition] = useState({ top: 56, left: 16 })

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

  const handleSignOut = () => {
    close()
    Promise.resolve(onSignOut()).catch(() => {
      // Sign-out failures are non-blocking in the header menu.
    })
  }

  const menuBody = (
    <View style={[headerMenuGroupStyles.menu, isCompact && styles.menuSheet]}>
      <View style={styles.accountBlock}>
        <Text style={styles.accountLabel}>Signed in as</Text>
        <Text style={styles.accountEmail} selectable>
          {email}
        </Text>
      </View>

      <View style={headerMenuGroupStyles.menuDivider} />

      <Pressable
        style={({ pressed }) => [
          styles.signOutItem,
          pressed && headerMenuGroupStyles.itemPressed,
          webPointer,
        ]}
        onPress={handleSignOut}
        accessibilityRole="menuitem"
        accessibilityLabel="Sign out"
      >
        <Text style={styles.signOutLabel}>Sign out</Text>
      </Pressable>
    </View>
  )

  return (
    <>
      <View
        ref={buttonRef}
        collapsable={false}
        style={[headerMenuGroupStyles.segment, headerMenuGroupStyles.userSegment]}
      >
        <Pressable
          style={({ pressed }) => [
            headerMenuGroupStyles.segmentMain,
            styles.segmentFill,
            open && headerMenuGroupStyles.segmentOpen,
            pressed && headerMenuGroupStyles.itemPressed,
            webPointer,
          ]}
          onPress={() => setOpen((current) => !current)}
          accessibilityRole="button"
          accessibilityLabel={`Account menu for ${email}`}
          accessibilityState={{ expanded: open }}
        >
          <Text style={headerMenuGroupStyles.segmentLabel} numberOfLines={1}>
            {email}
          </Text>
          <Text
            style={[
              headerMenuGroupStyles.segmentChevron,
              open && headerMenuGroupStyles.segmentChevronOpen,
            ]}
          >
            ▾
          </Text>
        </Pressable>
      </View>

      <Modal
        visible={open}
        transparent
        animationType={isCompact ? 'slide' : 'fade'}
        onRequestClose={close}
      >
        <View style={headerMenuGroupStyles.backdrop}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={close}
            accessibilityRole="button"
            accessibilityLabel="Close account menu"
          />
          {isCompact ? (
            <View style={headerMenuGroupStyles.sheetWrap}>{menuBody}</View>
          ) : (
            <View
              style={[
                headerMenuGroupStyles.desktopMenuWrap,
                {
                  top: menuPosition.top,
                  left: menuPosition.left,
                  width: HEADER_MENU_WIDTH,
                },
              ]}
            >
              {menuBody}
            </View>
          )}
        </View>
      </Modal>
    </>
  )
}

const styles = StyleSheet.create({
  segmentFill: {
    flex: 1,
  },
  menuSheet: {
    maxHeight: '40%',
  },
  accountBlock: {
    paddingHorizontal: 8,
    paddingVertical: 8,
    gap: 4,
  },
  accountLabel: {
    color: colors.textDim,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  accountEmail: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 20,
  },
  signOutItem: {
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  signOutLabel: {
    color: colors.errorText,
    fontSize: 14,
    fontWeight: '600',
  },
})
