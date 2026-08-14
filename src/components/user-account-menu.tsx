import { useEffect, useRef, useState } from 'react'
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native'
import { useRouter } from 'expo-router'
import { useQueryClient } from '@tanstack/react-query'
import { GlassSurface } from '@/components/glass/glass-surface'
import { HeaderChevron } from '@/components/header-chevron'
import {
  HEADER_MENU_WIDTH,
  headerMenuGroupStyles,
} from '@/components/header-menu-group-styles'
import { UserIcon } from '@/components/icons/nav-icons'
import { webPointer } from '@/components/org/org-panel-styles'
import {
  formatControlPlaneHostLabel,
  isRemoteCookieClient,
} from '@/lib/control-plane'
import {
  switchControlPlaneAccount,
  useControlPlaneStore,
  type ControlPlaneAccount,
} from '@/lib/control-plane-accounts'
import { setActiveOrganizationId } from '@/lib/org-context'
import { HA_PRODUCT_NAME } from '@/lib/platform-copy'
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
  const router = useRouter()
  const queryClient = useQueryClient()
  const store = useControlPlaneStore()
  const showSwitcher = isRemoteCookieClient()
  const otherAccounts = store.accounts.filter(
    (account) => account.origin !== store.activeOrigin && account.email,
  )

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

  const handleSwitch = (account: ControlPlaneAccount) => {
    close()
    if (!switchControlPlaneAccount(account.origin)) return
    setActiveOrganizationId(account.lastOrgId)
    queryClient.clear()
  }

  const handleAddControlPlane = () => {
    close()
    router.push('/connect')
  }

  const menuBody = (
    <GlassSurface
      style={[headerMenuGroupStyles.menu, isCompact && styles.menuSheet]}
      intensity="strong"
    >
      <View style={styles.accountBlock}>
        <Text style={headerMenuGroupStyles.menuHeading}>Signed in as</Text>
        <Text style={styles.accountEmail} selectable numberOfLines={2}>
          {email}
        </Text>
        {showSwitcher && store.activeOrigin ? (
          <Text style={styles.accountOrigin} numberOfLines={1}>
            {store.accounts.find((account) => account.origin === store.activeOrigin)
              ?.kind === 'ha'
              ? HA_PRODUCT_NAME
              : formatControlPlaneHostLabel(store.activeOrigin)}
          </Text>
        ) : null}
      </View>

      {showSwitcher && otherAccounts.length > 0 ? (
        <>
          <View style={headerMenuGroupStyles.menuDivider} />
          <Text style={headerMenuGroupStyles.menuHeading}>Switch control plane</Text>
          {otherAccounts.map((account) => (
            <Pressable
              key={account.origin}
              style={({ pressed }) => [
                headerMenuGroupStyles.menuAction,
                pressed && headerMenuGroupStyles.itemPressed,
                webPointer,
              ]}
              onPress={() => handleSwitch(account)}
              accessibilityRole="menuitem"
              accessibilityLabel={`Switch to ${account.email ?? account.origin}`}
            >
              <Text style={headerMenuGroupStyles.menuActionLabel} numberOfLines={1}>
                {account.email ?? 'Signed in'}
              </Text>
              <Text style={styles.accountOrigin} numberOfLines={1}>
                {account.kind === 'ha'
                  ? HA_PRODUCT_NAME
                  : formatControlPlaneHostLabel(account.origin)}
              </Text>
            </Pressable>
          ))}
        </>
      ) : null}

      {showSwitcher ? (
        <>
          <View style={headerMenuGroupStyles.menuDivider} />
          <Pressable
            style={({ pressed }) => [
              headerMenuGroupStyles.menuAction,
              pressed && headerMenuGroupStyles.itemPressed,
              webPointer,
            ]}
            onPress={handleAddControlPlane}
            accessibilityRole="menuitem"
            accessibilityLabel="Add control plane"
          >
            <Text style={headerMenuGroupStyles.menuActionLabel}>
              Add control plane…
            </Text>
          </Pressable>
        </>
      ) : null}

      <View style={headerMenuGroupStyles.menuDivider} />

      <Pressable
        style={({ pressed }) => [
          headerMenuGroupStyles.menuAction,
          pressed && headerMenuGroupStyles.itemPressed,
          webPointer,
        ]}
        onPress={handleSignOut}
        accessibilityRole="menuitem"
        accessibilityLabel="Sign out"
      >
        <Text style={styles.signOutLabel}>Sign out</Text>
      </Pressable>
    </GlassSurface>
  )

  return (
    <>
      <View ref={buttonRef} collapsable={false} style={styles.triggerWrap}>
        <Pressable
          style={({ pressed }) => [
            headerMenuGroupStyles.trigger,
            open && headerMenuGroupStyles.triggerOpen,
            pressed && headerMenuGroupStyles.triggerPressed,
            webPointer,
          ]}
          onPress={() => setOpen((current) => !current)}
          accessibilityRole="button"
          accessibilityLabel={`Account menu for ${email}`}
          accessibilityState={{ expanded: open }}
        >
          <UserIcon size={15} color={colors.textDim} />
          <View style={headerMenuGroupStyles.triggerCopy}>
            <Text style={headerMenuGroupStyles.triggerLabel} numberOfLines={1}>
              {email}
            </Text>
          </View>
          <HeaderChevron
            color={open ? colors.text : colors.textDim}
            open={open}
          />
        </Pressable>
      </View>

      <Modal
        visible={open}
        transparent
        animationType={isCompact ? 'slide' : 'fade'}
        onRequestClose={close}
      >
        <View
          style={[
            headerMenuGroupStyles.backdrop,
            isCompact && headerMenuGroupStyles.backdropCompact,
          ]}
        >
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
  triggerWrap: {
    flexShrink: 1,
    minWidth: 0,
  },
  menuSheet: {
    maxHeight: '55%',
  },
  accountBlock: {
    paddingBottom: 2,
    gap: 2,
  },
  accountEmail: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 20,
    paddingHorizontal: 8,
  },
  accountOrigin: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 16,
    paddingHorizontal: 8,
  },
  signOutLabel: {
    color: colors.errorText,
    fontSize: 13,
    fontWeight: '600',
  },
})
