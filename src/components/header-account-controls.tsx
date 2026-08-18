import { Platform, View } from 'react-native'
import { headerMenuGroupStyles } from '@/components/header-menu-group-styles'
import { HeaderNotificationsSegment } from '@/components/header-notifications-control'
import { OrganizationSwitcherSegment } from '@/components/organization-switcher'
import { ReturnToInstanceSegment } from '@/components/return-to-instance'
import { UserAccountMenuSegment } from '@/components/user-account-menu'

const showSeparateNotifications = Platform.OS === 'web'

type HeaderAccountControlsProps = Readonly<{
  orgId: string
  email: string
  onSignOut: () => void | Promise<void>
}>

export function HeaderAccountControls({
  orgId,
  email,
  onSignOut,
}: HeaderAccountControlsProps) {
  return (
    <View style={headerMenuGroupStyles.group}>
      <OrganizationSwitcherSegment orgId={orgId} />
      <UserAccountMenuSegment email={email} onSignOut={onSignOut} />
      {showSeparateNotifications ? <HeaderNotificationsSegment /> : null}
    </View>
  )
}

/** Admin header: return control + account (no org switcher). */
export function HeaderAdminAccountControls({
  email,
  onSignOut,
}: Readonly<{
  email: string
  onSignOut: () => void | Promise<void>
}>) {
  return (
    <View style={headerMenuGroupStyles.group}>
      <ReturnToInstanceSegment />
      <UserAccountMenuSegment email={email} onSignOut={onSignOut} />
      {showSeparateNotifications ? <HeaderNotificationsSegment /> : null}
    </View>
  )
}

export function HeaderUserAccountControl({
  email,
  onSignOut,
}: Readonly<{
  email: string
  onSignOut: () => void | Promise<void>
}>) {
  return (
    <View style={headerMenuGroupStyles.group}>
      <UserAccountMenuSegment email={email} onSignOut={onSignOut} />
      {showSeparateNotifications ? <HeaderNotificationsSegment /> : null}
    </View>
  )
}
