import { useEffect, useRef, useState } from 'react'
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type StyleProp,
  type ViewStyle,
} from 'react-native'
import { useRouter } from 'expo-router'
import { useQueryClient } from '@tanstack/react-query'
import { AccountAvatar } from '@/components/account-avatar'
import { GlassSurface } from '@/components/glass/glass-surface'
import { HeaderChevron } from '@/components/header-chevron'
import {
  HEADER_MENU_WIDTH,
  HEADER_TRIGGER_ICON_SIZE,
  headerMenuGroupStyles,
} from '@/components/header-menu-group-styles'
import { HeaderMenuOverlay } from '@/components/header-menu-overlay'
import { HeaderMenuTrigger } from '@/components/header-menu-trigger'
import { UserIcon } from '@/components/icons/nav-icons'
import { NotificationsPanelBody } from '@/components/notifications-panel-body'
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
import { useUnreadNotificationCount } from '@/lib/notifications'
import { setActiveOrganizationId } from '@/lib/org-context'
import { HA_PRODUCT_NAME } from '@/lib/platform-copy'
import { colors, layout } from '@/lib/theme'

const isNative = Platform.OS !== 'web'

type UserAccountMenuSegmentProps = Readonly<{
  email: string
  onSignOut: () => void | Promise<void>
}>

function accountMenuA11yLabel(email: string, unreadCount: number): string {
  if (!isNative) {
    return `Account menu for ${email}`
  }
  if (unreadCount > 0) {
    return `Account and notifications for ${email}, ${unreadCount} unread`
  }
  return `Account and notifications for ${email}`
}

function controlPlaneLabel(
  account: Pick<ControlPlaneAccount, 'kind' | 'origin'>,
): string {
  if (account.kind === 'ha') {
    return HA_PRODUCT_NAME
  }
  return formatControlPlaneHostLabel(account.origin)
}

function UserAccountTriggerContent({
  email,
  open,
  unreadCount,
}: Readonly<{
  email: string
  open: boolean
  unreadCount: number
}>) {
  if (isNative) {
    return <AccountAvatar unreadCount={unreadCount} />
  }

  return (
    <>
      <View style={headerMenuGroupStyles.triggerGlyph}>
        <UserIcon size={HEADER_TRIGGER_ICON_SIZE} color={colors.textDim} />
      </View>
      <View style={headerMenuGroupStyles.triggerCopy}>
        <Text style={headerMenuGroupStyles.triggerLabel} numberOfLines={1}>
          {email}
        </Text>
      </View>
      <HeaderChevron
        color={open ? colors.text : colors.textDim}
        open={open}
      />
    </>
  )
}

function UserAccountMenuBody({
  email,
  panelStyle,
  showSwitcher,
  activeOrigin,
  activeKind,
  otherAccounts,
  onSwitch,
  onAddControlPlane,
  onSignOut,
}: Readonly<{
  email: string
  panelStyle?: StyleProp<ViewStyle>
  showSwitcher: boolean
  activeOrigin: string | null
  activeKind: ControlPlaneAccount['kind'] | undefined
  otherAccounts: readonly ControlPlaneAccount[]
  onSwitch: (account: ControlPlaneAccount) => void
  onAddControlPlane: () => void
  onSignOut: () => void
}>) {
  return (
    <GlassSurface
      style={[headerMenuGroupStyles.menu, panelStyle]}
      intensity="strong"
    >
      {isNative ? (
        <>
          <NotificationsPanelBody />
          <View style={headerMenuGroupStyles.menuDivider} />
        </>
      ) : null}

      <View style={styles.accountBlock}>
        <Text style={headerMenuGroupStyles.menuHeading}>Signed in as</Text>
        <Text style={styles.accountEmail} selectable numberOfLines={2}>
          {email}
        </Text>
        {showSwitcher && activeOrigin ? (
          <Text style={styles.accountOrigin} numberOfLines={1}>
            {controlPlaneLabel({
              kind: activeKind ?? 'self-hosted',
              origin: activeOrigin,
            })}
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
              onPress={() => onSwitch(account)}
              accessibilityRole="menuitem"
              accessibilityLabel={`Switch to ${account.email ?? account.origin}`}
            >
              <Text style={headerMenuGroupStyles.menuActionLabel} numberOfLines={1}>
                {account.email ?? 'Signed in'}
              </Text>
              <Text style={styles.accountOrigin} numberOfLines={1}>
                {controlPlaneLabel(account)}
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
            onPress={onAddControlPlane}
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
        onPress={onSignOut}
        accessibilityRole="menuitem"
        accessibilityLabel="Sign out"
      >
        <Text style={styles.signOutLabel}>Sign out</Text>
      </Pressable>
    </GlassSurface>
  )
}

export function UserAccountMenuSegment({ email, onSignOut }: UserAccountMenuSegmentProps) {
  const { width } = useWindowDimensions()
  const isCompact = width < layout.desktopBreakpoint
  const [open, setOpen] = useState(false)
  const buttonRef = useRef<View>(null)
  const [menuPosition, setMenuPosition] = useState({ top: 56, left: 16 })
  const router = useRouter()
  const queryClient = useQueryClient()
  const store = useControlPlaneStore()
  const unreadCount = useUnreadNotificationCount()
  const showSwitcher = isRemoteCookieClient()
  const otherAccounts = store.accounts.filter(
    (account) => account.origin !== store.activeOrigin && account.email,
  )
  const activeAccount = store.accounts.find(
    (account) => account.origin === store.activeOrigin,
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

  return (
    <>
      <View ref={buttonRef} collapsable={false} style={styles.triggerWrap}>
        <HeaderMenuTrigger
          open={open}
          icon={isNative}
          onPress={() => setOpen((current) => !current)}
          accessibilityRole="button"
          accessibilityLabel={accountMenuA11yLabel(email, unreadCount)}
          accessibilityState={{ expanded: open }}
        >
          <UserAccountTriggerContent
            email={email}
            open={open}
            unreadCount={unreadCount}
          />
        </HeaderMenuTrigger>
      </View>

      <HeaderMenuOverlay
        open={open}
        onClose={close}
        closeAccessibilityLabel="Close account menu"
        presentation={isCompact ? 'fromRight' : 'dropdown'}
        dropdownPosition={menuPosition}
      >
        <UserAccountMenuBody
          email={email}
          panelStyle={isCompact ? styles.rightPanel : undefined}
          showSwitcher={showSwitcher}
          activeOrigin={store.activeOrigin}
          activeKind={activeAccount?.kind}
          otherAccounts={otherAccounts}
          onSwitch={handleSwitch}
          onAddControlPlane={handleAddControlPlane}
          onSignOut={handleSignOut}
        />
      </HeaderMenuOverlay>
    </>
  )
}

const styles = StyleSheet.create({
  triggerWrap: {
    flexShrink: 1,
    minWidth: 0,
  },
  rightPanel: {
    flex: 1,
    maxHeight: '100%',
    borderTopRightRadius: 0,
    borderBottomRightRadius: 0,
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
