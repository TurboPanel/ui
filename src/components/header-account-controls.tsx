import { View } from 'react-native'
import { headerMenuGroupStyles } from '@/components/header-menu-group-styles'
import { OrganizationSwitcherSegment } from '@/components/organization-switcher'
import { UserAccountMenuSegment } from '@/components/user-account-menu'

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
      <View style={headerMenuGroupStyles.groupDivider} />
      <UserAccountMenuSegment email={email} onSignOut={onSignOut} />
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
    </View>
  )
}
