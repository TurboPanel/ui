import { Platform, View, useWindowDimensions } from 'react-native'
import { headerMenuGroupStyles } from '@/components/header-menu-group-styles'
import { HeaderPageWidthSegment } from '@/components/header-page-width-toggle'
import { HeaderNotificationsSegment } from '@/components/header-notifications-control'
import { UserAccountMenuSegment } from '@/components/user-account-menu'
import { headerLayoutFor } from '@/lib/header-layout'

const isNative = Platform.OS !== 'web'

/**
 * Right-hand header controls, shared by the org, admin and organizations
 * screens: page-width toggle (desktop), profile menu, and the notifications
 * bell (wide web). On compact widths this is just the profile icon; the
 * organization (or the way back from admin) sits on the left, by the logo.
 */
export function HeaderAccountControls({
  email,
  onSignOut,
}: Readonly<{
  email: string
  onSignOut: () => void | Promise<void>
}>) {
  const { width } = useWindowDimensions()
  const header = headerLayoutFor(width, isNative)
  return (
    <View style={headerMenuGroupStyles.group}>
      {header.showPageWidthToggle ? <HeaderPageWidthSegment /> : null}
      <UserAccountMenuSegment email={email} onSignOut={onSignOut} />
      {header.showBell ? <HeaderNotificationsSegment /> : null}
    </View>
  )
}
